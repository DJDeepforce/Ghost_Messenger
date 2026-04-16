from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
import hashlib
import secrets
import certifi

ROOT_DIR = Path(__file__).parent
env_path = ROOT_DIR / '.env'
if env_path.exists():
    load_dotenv(env_path, override=False)

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'ghostchat_db')

_masked_url = mongo_url[:20] + '...' if len(mongo_url) > 20 else mongo_url
print(f"[STARTUP] Connecting to MongoDB: {_masked_url}")
print(f"[STARTUP] Database name: {db_name}")

if mongo_url.startswith('mongodb+srv') or 'mongodb.net' in mongo_url:
    client = AsyncIOMotorClient(
        mongo_url,
        tlsCAFile=certifi.where(),
        tls=True,
        tlsAllowInvalidCertificates=False,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000,
    )
else:
    client = AsyncIOMotorClient(mongo_url)

db = client[db_name]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    username: str
    pin_hash: str
    public_key: str
    duress_pin_hash: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    pin_hash: str

class UserResponse(BaseModel):
    id: str
    username: str
    public_key: str
    created_at: datetime

class InviteCodeCreate(BaseModel):
    code: str

class ConversationCreate(BaseModel):
    participant_id: str

class ConversationResponse(BaseModel):
    id: str
    participants: List[str]
    created_at: datetime
    last_activity: datetime

class MessageCreate(BaseModel):
    conversation_id: str
    encrypted_content: str
    content_type: str = "text"
    recipient_id: str

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    encrypted_content: str
    content_type: str
    timestamp: datetime
    is_read: bool = False

class PanicRequest(BaseModel):
    confirm: bool = True

class ChangePinRequest(BaseModel):
    current_pin_hash: str
    new_pin_hash: str

class ChangeDuressPinRequest(BaseModel):
    current_pin_hash: str
    duress_pin_hash: str

# ==================== SECURITY HELPERS ====================

def generate_session_token() -> str:
    return secrets.token_urlsafe(64)

def hash_data(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()

async def verify_session(authorization: Optional[str] = Header(None)) -> str:
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
    try:
        existing = await db.users.find_one({"username": user.username})
        if existing:
            raise HTTPException(status_code=400, detail="Username taken")
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "username": user.username,
            "pin_hash": hash_data(user.pin_hash),
            "duress_pin_hash": hash_data(user.duress_pin_hash) if user.duress_pin_hash else None,
            "public_key": user.public_key,
            "created_at": datetime.utcnow(),
            "is_active": True,
        }
        await db.users.insert_one(user_doc)
        return UserResponse(
            id=user_id,
            username=user.username,
            public_key=user.public_key,
            created_at=user_doc["created_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

@api_router.post("/auth/login")
async def login_user(user: UserLogin):
    try:
        existing = await db.users.find_one({"username": user.username, "is_active": True})
        if not existing:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if existing["pin_hash"] != hash_data(user.pin_hash):
            # Duress PIN — silently wipe everything and return a fake token
            if existing.get("duress_pin_hash") and existing["duress_pin_hash"] == hash_data(user.pin_hash):
                uid = existing["id"]
                await db.messages.delete_many({"$or": [{"sender_id": uid}, {"recipient_id": uid}]})
                await db.conversations.delete_many({"participants": uid})
                await db.sessions.delete_many({"user_id": uid})
                await db.users.delete_one({"id": uid})
                return {
                    "token": secrets.token_urlsafe(64),
                    "user_id": uid,
                    "username": user.username,
                    "public_key": existing["public_key"],
                }
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = generate_session_token()
        await db.sessions.insert_one({
            "token": token,
            "user_id": existing["id"],
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
        })
        return {
            "token": token,
            "user_id": existing["id"],
            "username": existing["username"],
            "public_key": existing["public_key"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

@api_router.post("/auth/logout")
async def logout_user(
    authorization: Optional[str] = Header(None),
    user_id: str = Depends(verify_session),
):
    if authorization:
        token = authorization.replace("Bearer ", "")
        await db.sessions.delete_one({"token": token})
    return {"message": "Logged out"}

@api_router.post("/auth/change-pin")
async def change_pin(request: ChangePinRequest, user_id: str = Depends(verify_session)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user["pin_hash"] != hash_data(request.current_pin_hash):
        raise HTTPException(status_code=401, detail="PIN actuel incorrect")
    await db.users.update_one({"id": user_id}, {"$set": {"pin_hash": hash_data(request.new_pin_hash)}})
    return {"message": "PIN modifié avec succès"}

@api_router.post("/auth/change-duress-pin")
async def change_duress_pin(request: ChangeDuressPinRequest, user_id: str = Depends(verify_session)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user["pin_hash"] != hash_data(request.current_pin_hash):
        raise HTTPException(status_code=401, detail="PIN principal incorrect")
    await db.users.update_one({"id": user_id}, {"$set": {"duress_pin_hash": hash_data(request.duress_pin_hash)}})
    return {"message": "PIN de détresse modifié"}

# ==================== INVITE CODES ====================

@api_router.post("/invites/create")
async def create_invite(invite: InviteCodeCreate, user_id: str = Depends(verify_session)):
    await db.invites.insert_one({
        "id": str(uuid.uuid4()),
        "code": hash_data(invite.code),
        "created_by": user_id,
        "created_at": datetime.utcnow(),
        "used": False,
        "used_by": None,
    })
    return {"message": "Invite created", "code": invite.code}

@api_router.post("/invites/verify")
async def verify_invite(invite: InviteCodeCreate):
    doc = await db.invites.find_one({"code": hash_data(invite.code), "used": False})
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or used invite code")
    return {"valid": True}

@api_router.post("/invites/use")
async def use_invite(invite: InviteCodeCreate, user_id: str = Depends(verify_session)):
    result = await db.invites.update_one(
        {"code": hash_data(invite.code), "used": False},
        {"$set": {"used": True, "used_by": user_id, "used_at": datetime.utcnow()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Invalid or already used invite")
    return {"message": "Invite used successfully"}

# ==================== USERS ====================

@api_router.get("/users/search")
async def search_users(q: str, user_id: str = Depends(verify_session)):
    users = await db.users.find({
        "username": {"$regex": q, "$options": "i"},
        "id": {"$ne": user_id},
        "is_active": True,
    }).limit(20).to_list(20)
    return [
        UserResponse(id=u["id"], username=u["username"], public_key=u["public_key"], created_at=u["created_at"])
        for u in users
    ]

@api_router.get("/users/{user_id_param}/public-key")
async def get_user_public_key(user_id_param: str, user_id: str = Depends(verify_session)):
    user = await db.users.find_one({"id": user_id_param, "is_active": True})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"public_key": user["public_key"]}

# ==================== CONVERSATIONS ====================

@api_router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(conv: ConversationCreate, user_id: str = Depends(verify_session)):
    existing = await db.conversations.find_one({"participants": {"$all": [user_id, conv.participant_id]}})
    if existing:
        return ConversationResponse(
            id=existing["id"], participants=existing["participants"],
            created_at=existing["created_at"], last_activity=existing["last_activity"],
        )
    conv_id = str(uuid.uuid4())
    now = datetime.utcnow()
    await db.conversations.insert_one({
        "id": conv_id, "participants": [user_id, conv.participant_id],
        "created_at": now, "last_activity": now,
    })
    return ConversationResponse(id=conv_id, participants=[user_id, conv.participant_id], created_at=now, last_activity=now)

@api_router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(user_id: str = Depends(verify_session)):
    convs = await db.conversations.find({"participants": user_id}).sort("last_activity", -1).to_list(100)
    return [
        ConversationResponse(id=c["id"], participants=c["participants"], created_at=c["created_at"], last_activity=c["last_activity"])
        for c in convs
    ]

@api_router.get("/conversations/{conv_id}/participant")
async def get_conversation_participant(conv_id: str, user_id: str = Depends(verify_session)):
    conv = await db.conversations.find_one({"id": conv_id, "participants": user_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    other_id = next(p for p in conv["participants"] if p != user_id)
    user = await db.users.find_one({"id": other_id})
    if not user:
        raise HTTPException(status_code=404, detail="Participant not found")
    return UserResponse(id=user["id"], username=user["username"], public_key=user["public_key"], created_at=user["created_at"])

# ==================== MESSAGES (HTTP — kept for image fallback) ====================

@api_router.post("/messages", response_model=MessageResponse)
async def send_message(msg: MessageCreate, user_id: str = Depends(verify_session)):
    conv = await db.conversations.find_one({"id": msg.conversation_id, "participants": user_id})
    if not conv:
        raise HTTPException(status_code=403, detail="Not in this conversation")
    msg_id = str(uuid.uuid4())
    now = datetime.utcnow()
    await db.messages.insert_one({
        "id": msg_id, "conversation_id": msg.conversation_id,
        "sender_id": user_id, "recipient_id": msg.recipient_id,
        "encrypted_content": msg.encrypted_content,
        "content_type": msg.content_type, "timestamp": now, "is_read": False,
    })
    await db.conversations.update_one({"id": msg.conversation_id}, {"$set": {"last_activity": now}})
    return MessageResponse(
        id=msg_id, conversation_id=msg.conversation_id, sender_id=user_id,
        encrypted_content=msg.encrypted_content, content_type=msg.content_type,
        timestamp=now, is_read=False,
    )

@api_router.get("/messages/{conv_id}", response_model=List[MessageResponse])
async def get_messages(conv_id: str, user_id: str = Depends(verify_session)):
    conv = await db.conversations.find_one({"id": conv_id, "participants": user_id})
    if not conv:
        raise HTTPException(status_code=403, detail="Not in this conversation")
    msgs = await db.messages.find({"conversation_id": conv_id}).sort("timestamp", 1).to_list(1000)
    return [
        MessageResponse(
            id=m["id"], conversation_id=m["conversation_id"], sender_id=m["sender_id"],
            encrypted_content=m["encrypted_content"], content_type=m["content_type"],
            timestamp=m["timestamp"], is_read=m.get("is_read", False),
        )
        for m in msgs
    ]

@api_router.post("/messages/{msg_id}/read")
async def mark_message_read(msg_id: str, user_id: str = Depends(verify_session)):
    msg = await db.messages.find_one({"id": msg_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg["recipient_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not the recipient")
    await db.messages.delete_one({"id": msg_id})
    return {"message": "Message read and destroyed"}

@api_router.delete("/messages/{msg_id}")
async def delete_message(msg_id: str, user_id: str = Depends(verify_session)):
    result = await db.messages.delete_one({
        "id": msg_id,
        "$or": [{"sender_id": user_id}, {"recipient_id": user_id}],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found or not authorized")
    return {"message": "Message deleted"}

# ==================== PANIC MODE ====================

@api_router.post("/panic")
async def panic_mode(request: PanicRequest, user_id: str = Depends(verify_session)):
    if not request.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")
    await db.messages.delete_many({"$or": [{"sender_id": user_id}, {"recipient_id": user_id}]})
    await db.conversations.delete_many({"participants": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    await db.invites.delete_many({"created_by": user_id})
    await db.users.delete_one({"id": user_id})
    return {"message": "All data destroyed"}

# ==================== HEALTH ====================

@api_router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow()}

@api_router.get("/debug/db-status")
async def db_status():
    try:
        result = await client.admin.command('ping')
        db_list = await client.list_database_names()
        return {
            "status": "connected", "ping": result, "db_name": db_name,
            "mongo_type": "atlas" if ('mongodb.net' in mongo_url or mongo_url.startswith('mongodb+srv')) else "local",
            "databases": db_list,
        }
    except Exception as e:
        return {
            "status": "error", "error": str(e),
            "mongo_url_prefix": (mongo_url[:25] + "...") if len(mongo_url) > 25 else mongo_url,
            "db_name": db_name,
        }

# ==================== WEBSOCKET — PHASE 2 ====================
# Messages are ephemeral: stored in memory only, never written to MongoDB.
# Room is auto-destroyed when the last client disconnects.

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms.setdefault(room_id, []).append(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        if room_id not in self.rooms:
            return
        try:
            self.rooms[room_id].remove(websocket)
        except ValueError:
            pass
        if not self.rooms[room_id]:
            del self.rooms[room_id]  # room auto-destroys when empty

    async def broadcast(self, room_id: str, message: dict, exclude: WebSocket) -> None:
        if room_id not in self.rooms:
            return
        dead: List[WebSocket] = []
        for ws in list(self.rooms[room_id]):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)

room_manager = RoomManager()

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: Optional[str] = Query(default=None),
):
    # Authenticate via token query param
    if not token:
        await websocket.close(code=4001, reason="No token")
        return
    session = await db.sessions.find_one({
        "token": token,
        "expires_at": {"$gt": datetime.utcnow()},
    })
    if not session:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    sender_id = session["user_id"]
    await room_manager.connect(room_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            # Server stamps sender_id from the verified session — client cannot forge it.
            # The encrypted payload is relayed as-is; server never sees plaintext.
            data["sender_id"] = sender_id
            data["server_ts"] = datetime.utcnow().isoformat()
            await room_manager.broadcast(room_id, data, exclude=websocket)
    except WebSocketDisconnect:
        room_manager.disconnect(room_id, websocket)

# ==================== REGISTER ROUTER & MIDDLEWARE ====================

app.include_router(api_router)

# CORS: read allowed origins from CORS_ORIGINS env var (comma-separated).
# allow_credentials=True requires explicit origins — cannot be used with "*".
_cors_env = os.environ.get('CORS_ORIGINS', '').strip()
if _cors_env and _cors_env != '*':
    _cors_origins = [o.strip() for o in _cors_env.split(',') if o.strip()]
    _allow_credentials = True
else:
    _cors_origins = ['*']
    _allow_credentials = False  # credentials + wildcard is invalid per CORS spec

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
