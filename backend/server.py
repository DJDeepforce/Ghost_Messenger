from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import hashlib
import secrets
from nacl import secret, utils
from nacl.public import PrivateKey, PublicKey, Box
from nacl.encoding import Base64Encoder
import base64
import certifi

ROOT_DIR = Path(__file__).parent
# Only load .env if it exists AND we're not on a cloud platform (Render sets env vars directly)
env_path = ROOT_DIR / '.env'
if env_path.exists():
    load_dotenv(env_path, override=False)  # Never override platform env vars

# MongoDB connection - supports both local and Atlas (cloud)
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'ghostchat_db')

# Log which DB we're connecting to (masked for security)
_masked_url = mongo_url[:20] + '...' if len(mongo_url) > 20 else mongo_url
print(f"[STARTUP] Connecting to MongoDB: {_masked_url}")
print(f"[STARTUP] Database name: {db_name}")

# Use SSL/TLS for Atlas (mongodb+srv) connections
if mongo_url.startswith('mongodb+srv') or 'mongodb.net' in mongo_url:
    client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
else:
    client = AsyncIOMotorClient(mongo_url)

db = client[db_name]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging - minimal for security
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    username: str
    pin_hash: str  # Client sends hashed PIN
    public_key: str  # For E2E encryption
    duress_pin_hash: Optional[str] = None  # Duress PIN - wipes data when entered

class UserLogin(BaseModel):
    username: str
    pin_hash: str

class UserResponse(BaseModel):
    id: str
    username: str
    public_key: str
    created_at: datetime

class InviteCodeCreate(BaseModel):
    code: str  # Generated client-side for anonymity

class ConversationCreate(BaseModel):
    participant_id: str

class ConversationResponse(BaseModel):
    id: str
    participants: List[str]
    created_at: datetime
    last_activity: datetime

class MessageCreate(BaseModel):
    conversation_id: str
    encrypted_content: str  # E2E encrypted on client
    content_type: str = "text"  # text, image
    recipient_id: str

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    encrypted_content: str
    content_type: str
    timestamp: datetime
    is_read: bool = False

class SessionToken(BaseModel):
    token: str
    user_id: str
    expires_at: datetime

class PanicRequest(BaseModel):
    confirm: bool = True

# ==================== SECURITY HELPERS ====================

def generate_session_token():
    """Generate a cryptographically secure session token"""
    return secrets.token_urlsafe(64)

def hash_data(data: str) -> str:
    """Hash data using SHA-256"""
    return hashlib.sha256(data.encode()).hexdigest()

async def verify_session(authorization: Optional[str] = Header(None)):
    """Verify session token from header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization token")
    
    token = authorization.replace("Bearer ", "")
    session = await db.sessions.find_one({
        "token": token,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return session["user_id"]

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate):
    """Register anonymous user with username and hashed PIN"""
    try:
        # Check if username exists
        existing = await db.users.find_one({"username": user.username})
        if existing:
            raise HTTPException(status_code=400, detail="Username taken")
        
        # Create user
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "username": user.username,
            "pin_hash": hash_data(user.pin_hash),  # Double hash for extra security
            "duress_pin_hash": hash_data(user.duress_pin_hash) if user.duress_pin_hash else None,
            "public_key": user.public_key,
            "created_at": datetime.utcnow(),
            "is_active": True
        }
        
        await db.users.insert_one(user_doc)
        
        return UserResponse(
            id=user_id,
            username=user.username,
            public_key=user.public_key,
            created_at=user_doc["created_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@api_router.post("/auth/login")
async def login_user(credentials: UserLogin):
    """Login with username and PIN hash - checks for duress PIN"""
    # First check if this is a duress PIN
    user_with_duress = await db.users.find_one({
        "username": credentials.username,
        "duress_pin_hash": hash_data(credentials.pin_hash),
        "is_active": True
    })
    
    if user_with_duress:
        # DURESS PIN DETECTED - Wipe all data silently
        user_id = user_with_duress["id"]
        
        # Delete all user data
        await db.messages.delete_many({
            "$or": [{"sender_id": user_id}, {"recipient_id": user_id}]
        })
        await db.conversations.delete_many({"participants": user_id})
        await db.sessions.delete_many({"user_id": user_id})
        await db.invites.delete_many({"created_by": user_id})
        await db.users.delete_one({"id": user_id})
        
        # Return fake "invalid credentials" to not reveal duress activation
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Normal login
    user = await db.users.find_one({
        "username": credentials.username,
        "pin_hash": hash_data(credentials.pin_hash),
        "is_active": True
    })
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create session token
    token = generate_session_token()
    session = {
        "token": token,
        "user_id": user["id"],
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(hours=24)
    }
    
    await db.sessions.insert_one(session)
    
    return {
        "token": token,
        "user_id": user["id"],
        "username": user["username"],
        "public_key": user["public_key"],
        "expires_at": session["expires_at"]
    }

@api_router.post("/auth/logout")
async def logout_user(user_id: str = Depends(verify_session)):
    """Logout and invalidate session"""
    await db.sessions.delete_many({"user_id": user_id})
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_current_user(user_id: str = Depends(verify_session)):
    """Get current user info"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user["id"],
        username=user["username"],
        public_key=user["public_key"],
        created_at=user["created_at"]
    )

# ==================== INVITE CODES ====================

@api_router.post("/invites/create")
async def create_invite(invite: InviteCodeCreate, user_id: str = Depends(verify_session)):
    """Create an invite code"""
    invite_doc = {
        "id": str(uuid.uuid4()),
        "code": hash_data(invite.code),
        "created_by": user_id,
        "created_at": datetime.utcnow(),
        "used": False,
        "used_by": None
    }
    
    await db.invites.insert_one(invite_doc)
    return {"message": "Invite created", "code": invite.code}

@api_router.post("/invites/verify")
async def verify_invite(invite: InviteCodeCreate):
    """Verify an invite code"""
    invite_doc = await db.invites.find_one({
        "code": hash_data(invite.code),
        "used": False
    })
    
    if not invite_doc:
        raise HTTPException(status_code=400, detail="Invalid or used invite code")
    
    return {"valid": True}

@api_router.post("/invites/use")
async def use_invite(invite: InviteCodeCreate, user_id: str = Depends(verify_session)):
    """Mark invite as used"""
    result = await db.invites.update_one(
        {"code": hash_data(invite.code), "used": False},
        {"$set": {"used": True, "used_by": user_id, "used_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Invalid or already used invite")
    
    return {"message": "Invite used successfully"}

# ==================== USERS / CONTACTS ====================

@api_router.get("/users/search")
async def search_users(q: str, user_id: str = Depends(verify_session)):
    """Search users by username"""
    users = await db.users.find({
        "username": {"$regex": q, "$options": "i"},
        "id": {"$ne": user_id},
        "is_active": True
    }).limit(20).to_list(20)
    
    return [UserResponse(
        id=u["id"],
        username=u["username"],
        public_key=u["public_key"],
        created_at=u["created_at"]
    ) for u in users]

@api_router.get("/users/{user_id_param}/public-key")
async def get_user_public_key(user_id_param: str, user_id: str = Depends(verify_session)):
    """Get user's public key for E2E encryption"""
    user = await db.users.find_one({"id": user_id_param, "is_active": True})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"public_key": user["public_key"]}

# ==================== CONVERSATIONS ====================

@api_router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(conv: ConversationCreate, user_id: str = Depends(verify_session)):
    """Create a new conversation"""
    # Check if conversation already exists
    existing = await db.conversations.find_one({
        "participants": {"$all": [user_id, conv.participant_id]}
    })
    
    if existing:
        return ConversationResponse(
            id=existing["id"],
            participants=existing["participants"],
            created_at=existing["created_at"],
            last_activity=existing["last_activity"]
        )
    
    # Create new conversation
    conv_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conv_doc = {
        "id": conv_id,
        "participants": [user_id, conv.participant_id],
        "created_at": now,
        "last_activity": now
    }
    
    await db.conversations.insert_one(conv_doc)
    
    return ConversationResponse(
        id=conv_id,
        participants=conv_doc["participants"],
        created_at=now,
        last_activity=now
    )

@api_router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(user_id: str = Depends(verify_session)):
    """Get all conversations for current user"""
    conversations = await db.conversations.find({
        "participants": user_id
    }).sort("last_activity", -1).to_list(100)
    
    return [ConversationResponse(
        id=c["id"],
        participants=c["participants"],
        created_at=c["created_at"],
        last_activity=c["last_activity"]
    ) for c in conversations]

@api_router.get("/conversations/{conv_id}/participant")
async def get_conversation_participant(conv_id: str, user_id: str = Depends(verify_session)):
    """Get the other participant in a conversation"""
    conv = await db.conversations.find_one({"id": conv_id, "participants": user_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    other_id = [p for p in conv["participants"] if p != user_id][0]
    user = await db.users.find_one({"id": other_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="Participant not found")
    
    return UserResponse(
        id=user["id"],
        username=user["username"],
        public_key=user["public_key"],
        created_at=user["created_at"]
    )

# ==================== MESSAGES ====================

@api_router.post("/messages", response_model=MessageResponse)
async def send_message(msg: MessageCreate, user_id: str = Depends(verify_session)):
    """Send an encrypted message"""
    # Verify user is in conversation
    conv = await db.conversations.find_one({
        "id": msg.conversation_id,
        "participants": user_id
    })
    
    if not conv:
        raise HTTPException(status_code=403, detail="Not in this conversation")
    
    msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    msg_doc = {
        "id": msg_id,
        "conversation_id": msg.conversation_id,
        "sender_id": user_id,
        "recipient_id": msg.recipient_id,
        "encrypted_content": msg.encrypted_content,
        "content_type": msg.content_type,
        "timestamp": now,
        "is_read": False
    }
    
    await db.messages.insert_one(msg_doc)
    
    # Update conversation last activity
    await db.conversations.update_one(
        {"id": msg.conversation_id},
        {"$set": {"last_activity": now}}
    )
    
    return MessageResponse(
        id=msg_id,
        conversation_id=msg.conversation_id,
        sender_id=user_id,
        encrypted_content=msg.encrypted_content,
        content_type=msg.content_type,
        timestamp=now,
        is_read=False
    )

@api_router.get("/messages/{conv_id}", response_model=List[MessageResponse])
async def get_messages(conv_id: str, user_id: str = Depends(verify_session)):
    """Get messages for a conversation - deletes after retrieval for recipient"""
    # Verify user is in conversation
    conv = await db.conversations.find_one({
        "id": conv_id,
        "participants": user_id
    })
    
    if not conv:
        raise HTTPException(status_code=403, detail="Not in this conversation")
    
    messages = await db.messages.find({
        "conversation_id": conv_id
    }).sort("timestamp", 1).to_list(1000)
    
    response_messages = [MessageResponse(
        id=m["id"],
        conversation_id=m["conversation_id"],
        sender_id=m["sender_id"],
        encrypted_content=m["encrypted_content"],
        content_type=m["content_type"],
        timestamp=m["timestamp"],
        is_read=m.get("is_read", False)
    ) for m in messages]
    
    return response_messages

@api_router.post("/messages/{msg_id}/read")
async def mark_message_read(msg_id: str, user_id: str = Depends(verify_session)):
    """Mark message as read and DELETE it immediately (ephemeral messages)"""
    msg = await db.messages.find_one({"id": msg_id})
    
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Verify user is recipient
    if msg["recipient_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not the recipient")
    
    # DELETE the message immediately after reading
    await db.messages.delete_one({"id": msg_id})
    
    return {"message": "Message read and destroyed"}

@api_router.delete("/messages/{msg_id}")
async def delete_message(msg_id: str, user_id: str = Depends(verify_session)):
    """Manually delete a message"""
    result = await db.messages.delete_one({
        "id": msg_id,
        "$or": [{"sender_id": user_id}, {"recipient_id": user_id}]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found or not authorized")
    
    return {"message": "Message deleted"}

# ==================== PANIC MODE ====================

@api_router.post("/panic")
async def panic_mode(request: PanicRequest, user_id: str = Depends(verify_session)):
    """PANIC MODE - Delete ALL user data immediately"""
    if not request.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")
    
    # Delete all user messages
    await db.messages.delete_many({
        "$or": [{"sender_id": user_id}, {"recipient_id": user_id}]
    })
    
    # Delete all user conversations
    await db.conversations.delete_many({"participants": user_id})
    
    # Delete all user sessions
    await db.sessions.delete_many({"user_id": user_id})
    
    # Delete all user invites
    await db.invites.delete_many({"created_by": user_id})
    
    # Delete user account
    await db.users.delete_one({"id": user_id})
    
    return {"message": "All data destroyed"}

# ==================== HEALTH CHECK ====================

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.utcnow()}

@api_router.get("/debug/db-status")
async def db_status():
    """Check database connection status"""
    try:
        # Try to ping the database
        result = await client.admin.command('ping')
        db_list = await client.list_database_names()
        return {
            "status": "connected",
            "ping": result,
            "db_name": db_name,
            "mongo_type": "atlas" if 'mongodb.net' in mongo_url or mongo_url.startswith('mongodb+srv') else "local",
            "databases": db_list
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "mongo_url_prefix": mongo_url[:25] + "..." if len(mongo_url) > 25 else "too_short",
            "db_name": db_name
        }

@api_router.get("/logo")
async def get_logo():
    """Get the GhostChat logo as base64"""
    import base64
    logo_path = "/app/frontend/assets/images/ghost-logo.png"
    try:
        with open(logo_path, "rb") as f:
            img_data = f.read()
            b64 = base64.b64encode(img_data).decode('utf-8')
            return {"logo": f"data:image/png;base64,{b64}"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Logo not found")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
