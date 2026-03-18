#!/usr/bin/env python3
"""
GhostChat Backend API Testing
Tests secure messaging backend APIs with two-user simulation
"""

import requests
import json
import time
import random
import string
from datetime import datetime
import base64
from nacl.public import PrivateKey, PublicKey, Box
from nacl.encoding import Base64Encoder

# Base URL from environment
BASE_URL = "https://vault-talk-4.preview.emergentagent.com/api"

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def log_pass(self, test_name):
        print(f"✅ PASS: {test_name}")
        self.passed += 1
        
    def log_fail(self, test_name, error):
        print(f"❌ FAIL: {test_name} - {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        
    def summary(self):
        print(f"\n=== TEST SUMMARY ===")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Total: {self.passed + self.failed}")
        if self.errors:
            print("\n❌ FAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")

# Test helper functions
def generate_username():
    """Generate random username"""
    return f"user_{random.randint(1000, 9999)}_{int(time.time())}"

def generate_pin_hash():
    """Generate random PIN hash (simulating client-side hashing)"""
    pin = ''.join(random.choices(string.digits, k=6))
    return f"pin_hash_{pin}_{random.randint(1000, 9999)}"

def generate_keypair():
    """Generate NaCl keypair for E2E encryption"""
    private_key = PrivateKey.generate()
    public_key = private_key.public_key
    return private_key, public_key.encode(Base64Encoder).decode()

def encrypt_message(sender_private_key, recipient_public_key_str, message):
    """Encrypt message for E2E"""
    recipient_public_key = PublicKey(recipient_public_key_str, Base64Encoder)
    box = Box(sender_private_key, recipient_public_key)
    encrypted = box.encrypt(message.encode())
    return base64.b64encode(encrypted).decode()

def test_health_check(result):
    """Test health endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        if response.status_code == 200:
            result.log_pass("Health check")
        else:
            result.log_fail("Health check", f"Status {response.status_code}")
    except Exception as e:
        result.log_fail("Health check", str(e))

def test_user_registration_flow(result):
    """Test user registration and login flow"""
    users = []
    
    # Create two test users
    for i in range(2):
        try:
            # Generate credentials
            username = generate_username()
            pin_hash = generate_pin_hash()
            private_key, public_key = generate_keypair()
            
            # Register user
            register_data = {
                "username": username,
                "pin_hash": pin_hash,
                "public_key": public_key
            }
            
            response = requests.post(f"{BASE_URL}/auth/register", 
                                   json=register_data, timeout=10)
            
            if response.status_code != 200:
                result.log_fail(f"User {i+1} registration", 
                              f"Status {response.status_code}: {response.text}")
                continue
                
            user_data = response.json()
            result.log_pass(f"User {i+1} registration")
            
            # Test login
            login_data = {
                "username": username,
                "pin_hash": pin_hash
            }
            
            response = requests.post(f"{BASE_URL}/auth/login", 
                                   json=login_data, timeout=10)
            
            if response.status_code != 200:
                result.log_fail(f"User {i+1} login", 
                              f"Status {response.status_code}: {response.text}")
                continue
                
            login_response = response.json()
            result.log_pass(f"User {i+1} login")
            
            # Test /auth/me endpoint
            headers = {"Authorization": f"Bearer {login_response['token']}"}
            response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
            
            if response.status_code == 200:
                result.log_pass(f"User {i+1} auth/me")
            else:
                result.log_fail(f"User {i+1} auth/me", 
                              f"Status {response.status_code}: {response.text}")
            
            users.append({
                "username": username,
                "pin_hash": pin_hash,
                "private_key": private_key,
                "public_key": public_key,
                "user_id": user_data["id"],
                "token": login_response["token"]
            })
            
        except Exception as e:
            result.log_fail(f"User {i+1} registration/login flow", str(e))
    
    return users

def test_user_search(result, users):
    """Test user search functionality"""
    if len(users) < 2:
        result.log_fail("User search", "Need at least 2 users for testing")
        return
        
    try:
        user1 = users[0]
        user2 = users[1]
        
        # Search for user2 from user1's account
        headers = {"Authorization": f"Bearer {user1['token']}"}
        search_query = user2['username'][:4]  # Search by partial username
        
        response = requests.get(f"{BASE_URL}/users/search?q={search_query}", 
                              headers=headers, timeout=10)
        
        if response.status_code == 200:
            search_results = response.json()
            # Check if user2 is in results
            found = any(u["username"] == user2["username"] for u in search_results)
            if found:
                result.log_pass("User search")
            else:
                result.log_fail("User search", "Target user not found in results")
        else:
            result.log_fail("User search", f"Status {response.status_code}: {response.text}")
            
    except Exception as e:
        result.log_fail("User search", str(e))

def test_conversations_crud(result, users):
    """Test conversation CRUD operations"""
    if len(users) < 2:
        result.log_fail("Conversations CRUD", "Need at least 2 users for testing")
        return None
        
    try:
        user1 = users[0]
        user2 = users[1]
        
        # Create conversation
        headers1 = {"Authorization": f"Bearer {user1['token']}"}
        conv_data = {"participant_id": user2["user_id"]}
        
        response = requests.post(f"{BASE_URL}/conversations", 
                               json=conv_data, headers=headers1, timeout=10)
        
        if response.status_code != 200:
            result.log_fail("Create conversation", 
                          f"Status {response.status_code}: {response.text}")
            return None
            
        conversation = response.json()
        conv_id = conversation["id"]
        result.log_pass("Create conversation")
        
        # List conversations for user1
        response = requests.get(f"{BASE_URL}/conversations", 
                              headers=headers1, timeout=10)
        
        if response.status_code == 200:
            convs = response.json()
            found = any(c["id"] == conv_id for c in convs)
            if found:
                result.log_pass("List conversations")
            else:
                result.log_fail("List conversations", "Created conversation not found")
        else:
            result.log_fail("List conversations", 
                          f"Status {response.status_code}: {response.text}")
        
        # Get conversation participant
        response = requests.get(f"{BASE_URL}/conversations/{conv_id}/participant", 
                              headers=headers1, timeout=10)
        
        if response.status_code == 200:
            participant = response.json()
            if participant["id"] == user2["user_id"]:
                result.log_pass("Get conversation participant")
            else:
                result.log_fail("Get conversation participant", "Wrong participant returned")
        else:
            result.log_fail("Get conversation participant", 
                          f"Status {response.status_code}: {response.text}")
        
        return conv_id
        
    except Exception as e:
        result.log_fail("Conversations CRUD", str(e))
        return None

def test_messages_e2e_ephemeral(result, users, conv_id):
    """Test encrypted messaging with ephemeral deletion"""
    if not conv_id or len(users) < 2:
        result.log_fail("Messages E2E", "Need conversation and 2 users")
        return
        
    try:
        user1 = users[0]
        user2 = users[1]
        
        # Send encrypted message from user1 to user2
        message_text = f"Test message at {datetime.now().isoformat()}"
        encrypted_content = encrypt_message(
            user1["private_key"], 
            user2["public_key"], 
            message_text
        )
        
        headers1 = {"Authorization": f"Bearer {user1['token']}"}
        message_data = {
            "conversation_id": conv_id,
            "encrypted_content": encrypted_content,
            "content_type": "text",
            "recipient_id": user2["user_id"]
        }
        
        response = requests.post(f"{BASE_URL}/messages", 
                               json=message_data, headers=headers1, timeout=10)
        
        if response.status_code != 200:
            result.log_fail("Send encrypted message", 
                          f"Status {response.status_code}: {response.text}")
            return
            
        sent_message = response.json()
        msg_id = sent_message["id"]
        result.log_pass("Send encrypted message")
        
        # Get messages for conversation (as user2)
        headers2 = {"Authorization": f"Bearer {user2['token']}"}
        response = requests.get(f"{BASE_URL}/messages/{conv_id}", 
                              headers=headers2, timeout=10)
        
        if response.status_code == 200:
            messages = response.json()
            found_msg = next((m for m in messages if m["id"] == msg_id), None)
            if found_msg and found_msg["encrypted_content"] == encrypted_content:
                result.log_pass("Retrieve encrypted message")
            else:
                result.log_fail("Retrieve encrypted message", "Message not found or corrupted")
        else:
            result.log_fail("Retrieve encrypted message", 
                          f"Status {response.status_code}: {response.text}")
            return
        
        # Mark message as read (should delete it - ephemeral)
        response = requests.post(f"{BASE_URL}/messages/{msg_id}/read", 
                               headers=headers2, timeout=10)
        
        if response.status_code == 200:
            result.log_pass("Mark message as read")
        else:
            result.log_fail("Mark message as read", 
                          f"Status {response.status_code}: {response.text}")
            return
        
        # Verify message is deleted (ephemeral behavior)
        response = requests.get(f"{BASE_URL}/messages/{conv_id}", 
                              headers=headers2, timeout=10)
        
        if response.status_code == 200:
            messages = response.json()
            found_msg = next((m for m in messages if m["id"] == msg_id), None)
            if not found_msg:
                result.log_pass("Message ephemeral deletion")
            else:
                result.log_fail("Message ephemeral deletion", "Message still exists after reading")
        else:
            result.log_fail("Message ephemeral deletion verification", 
                          f"Status {response.status_code}: {response.text}")
        
    except Exception as e:
        result.log_fail("Messages E2E ephemeral", str(e))

def test_panic_mode(result, users):
    """Test panic mode - delete ALL user data"""
    if len(users) < 1:
        result.log_fail("Panic mode", "Need at least 1 user")
        return
        
    try:
        # Use the first user for panic mode test
        user = users[0]
        headers = {"Authorization": f"Bearer {user['token']}"}
        
        # Trigger panic mode
        panic_data = {"confirm": True}
        response = requests.post(f"{BASE_URL}/panic", 
                               json=panic_data, headers=headers, timeout=10)
        
        if response.status_code == 200:
            result.log_pass("Panic mode execution")
        else:
            result.log_fail("Panic mode execution", 
                          f"Status {response.status_code}: {response.text}")
            return
        
        # Verify user data is deleted - try to access user info
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        
        if response.status_code == 401:
            result.log_pass("Panic mode data deletion verification")
        else:
            result.log_fail("Panic mode data deletion", 
                          "User data still accessible after panic mode")
        
    except Exception as e:
        result.log_fail("Panic mode", str(e))

def main():
    """Run all backend tests"""
    print("🚀 Starting GhostChat Backend API Tests")
    print(f"Base URL: {BASE_URL}")
    print("=" * 50)
    
    result = TestResult()
    
    # Test health check first
    test_health_check(result)
    
    # Test user registration and login
    print("\n📝 Testing User Registration & Login Flow...")
    users = test_user_registration_flow(result)
    
    if len(users) < 2:
        print("⚠️  Insufficient users created, skipping interaction tests")
        result.summary()
        return
    
    # Test user search
    print("\n🔍 Testing User Search...")
    test_user_search(result, users)
    
    # Test conversations
    print("\n💬 Testing Conversations CRUD...")
    conv_id = test_conversations_crud(result, users)
    
    # Test messages with E2E encryption and ephemeral deletion
    print("\n🔐 Testing Messages with E2E Encryption & Ephemeral Deletion...")
    test_messages_e2e_ephemeral(result, users, conv_id)
    
    # Test panic mode (uses first user)
    print("\n🚨 Testing Panic Mode...")
    test_panic_mode(result, [users[0]])  # Only test with first user
    
    # Final summary
    print("\n" + "=" * 50)
    result.summary()
    
    # Return exit code based on results
    return 0 if result.failed == 0 else 1

if __name__ == "__main__":
    exit(main())