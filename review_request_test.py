#!/usr/bin/env python3
"""
GhostChat Backend API Testing - Review Request Specific Tests
Tests the exact flow requested in the review request for critical bug fix verification.
"""

import requests
import json
import sys
from datetime import datetime
import pymongo
import base64

# Configuration
BACKEND_URL = "https://phantom-msg-4.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

# Exact test data from review request
TEST_USER_1 = {
    "username": "BackendTestUser",
    "pin_hash": "dGVzdHBpbg==",  # base64 encoded "testpin"
    "public_key": "dGVzdGtleQ=="  # base64 encoded "testkey"
}

TEST_USER_2 = {
    "username": "BackendTestUser2", 
    "pin_hash": "dGVzdHBpbjI=",  # base64 encoded "testpin2"
    "public_key": "dGVzdGtleTI="  # base64 encoded "testkey2"
}

class ReviewRequestTester:
    def __init__(self):
        self.session = requests.Session()
        self.user1_token = None
        self.user2_token = None
        self.user1_id = None
        self.user2_id = None
        self.conversation_id = None
        self.test_results = []
        
    def log_test(self, test_name, success, details=""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def cleanup_test_users(self):
        """Clean up test users from MongoDB as requested"""
        try:
            client = pymongo.MongoClient(MONGO_URL)
            db = client[DB_NAME]
            
            # Delete test users from users collection
            result1 = db.users.delete_many({"username": {"$in": [TEST_USER_1["username"], TEST_USER_2["username"]]}})
            
            # Clean up related data if user IDs are available
            if self.user1_id or self.user2_id:
                user_ids = [uid for uid in [self.user1_id, self.user2_id] if uid]
                result2 = db.sessions.delete_many({"user_id": {"$in": user_ids}})
                result3 = db.conversations.delete_many({"participants": {"$in": user_ids}})
                result4 = db.messages.delete_many({"$or": [
                    {"sender_id": {"$in": user_ids}},
                    {"recipient_id": {"$in": user_ids}}
                ]})
                print(f"Cleanup: Deleted {result1.deleted_count} users, {result2.deleted_count} sessions, {result3.deleted_count} conversations, {result4.deleted_count} messages")
            else:
                print(f"Cleanup: Deleted {result1.deleted_count} users")
            
            client.close()
            
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    def test_1_health_check(self):
        """Test 1: GET /api/health - Health check"""
        try:
            response = self.session.get(f"{API_BASE}/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "status" in data and data["status"] == "ok":
                    self.log_test("1. Health Check", True, f"Status: {data['status']}")
                    return True
                else:
                    self.log_test("1. Health Check", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("1. Health Check", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("1. Health Check", False, f"Exception: {e}")
            return False
    
    def test_2_register_user1(self):
        """Test 2: POST /api/auth/register - Register BackendTestUser"""
        try:
            response = self.session.post(
                f"{API_BASE}/auth/register",
                json=TEST_USER_1,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "username" in data and data["username"] == TEST_USER_1["username"]:
                    self.user1_id = data["id"]
                    self.log_test("2. Register BackendTestUser", True, f"User ID: {self.user1_id}")
                    return True
                else:
                    self.log_test("2. Register BackendTestUser", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("2. Register BackendTestUser", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("2. Register BackendTestUser", False, f"Exception: {e}")
            return False
    
    def test_3_login_user1(self):
        """Test 3: POST /api/auth/login - Login with same credentials"""
        try:
            login_data = {
                "username": TEST_USER_1["username"],
                "pin_hash": TEST_USER_1["pin_hash"]
            }
            
            response = self.session.post(
                f"{API_BASE}/auth/login",
                json=login_data,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user_id" in data:
                    self.user1_token = data["token"]
                    self.log_test("3. Login BackendTestUser", True, f"Token received, User ID: {data['user_id']}")
                    return True
                else:
                    self.log_test("3. Login BackendTestUser", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("3. Login BackendTestUser", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("3. Login BackendTestUser", False, f"Exception: {e}")
            return False
    
    def test_4_verify_token_conversations(self):
        """Test 4: GET /api/conversations - Verify token works"""
        try:
            headers = {"Authorization": f"Bearer {self.user1_token}"}
            response = self.session.get(f"{API_BASE}/conversations", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("4. Verify Token with /api/conversations", True, f"Retrieved {len(data)} conversations")
                    return True
                else:
                    self.log_test("4. Verify Token with /api/conversations", False, f"Invalid response format: {data}")
                    return False
            else:
                self.log_test("4. Verify Token with /api/conversations", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("4. Verify Token with /api/conversations", False, f"Exception: {e}")
            return False
    
    def test_5_register_user2(self):
        """Test 5: Register a second user to test conversation creation"""
        try:
            response = self.session.post(
                f"{API_BASE}/auth/register",
                json=TEST_USER_2,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "username" in data and data["username"] == TEST_USER_2["username"]:
                    self.user2_id = data["id"]
                    self.log_test("5. Register Second User", True, f"User ID: {self.user2_id}")
                    return True
                else:
                    self.log_test("5. Register Second User", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("5. Register Second User", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("5. Register Second User", False, f"Exception: {e}")
            return False
    
    def test_6_login_user2(self):
        """Test 6: Login second user"""
        try:
            login_data = {
                "username": TEST_USER_2["username"],
                "pin_hash": TEST_USER_2["pin_hash"]
            }
            
            response = self.session.post(
                f"{API_BASE}/auth/login",
                json=login_data,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user_id" in data:
                    self.user2_token = data["token"]
                    self.log_test("6. Login Second User", True, f"Token received, User ID: {data['user_id']}")
                    return True
                else:
                    self.log_test("6. Login Second User", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("6. Login Second User", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("6. Login Second User", False, f"Exception: {e}")
            return False
    
    def test_7_create_conversation(self):
        """Test 7: Create conversation between users"""
        try:
            headers = {"Authorization": f"Bearer {self.user1_token}"}
            conv_data = {"participant_id": self.user2_id}
            
            response = self.session.post(
                f"{API_BASE}/conversations",
                json=conv_data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "participants" in data:
                    self.conversation_id = data["id"]
                    self.log_test("7. Create Conversation", True, f"Conversation ID: {self.conversation_id}")
                    return True
                else:
                    self.log_test("7. Create Conversation", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("7. Create Conversation", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("7. Create Conversation", False, f"Exception: {e}")
            return False
    
    def test_8_send_message(self):
        """Test 8: POST /api/messages - Send encrypted message"""
        try:
            headers = {"Authorization": f"Bearer {self.user1_token}"}
            message_data = {
                "conversation_id": self.conversation_id,
                "encrypted_content": base64.b64encode("Hello from review request test!".encode()).decode(),
                "content_type": "text",
                "recipient_id": self.user2_id
            }
            
            response = self.session.post(
                f"{API_BASE}/messages",
                json=message_data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "encrypted_content" in data:
                    self.log_test("8. Send Message", True, f"Message ID: {data['id']}")
                    return True
                else:
                    self.log_test("8. Send Message", False, f"Invalid response: {data}")
                    return False
            else:
                self.log_test("8. Send Message", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("8. Send Message", False, f"Exception: {e}")
            return False
    
    def run_review_request_tests(self):
        """Run the exact test flow from the review request"""
        print("=" * 70)
        print("GhostChat Backend API Testing - Review Request Verification")
        print("=" * 70)
        print(f"Backend URL: {BACKEND_URL}")
        print(f"API Base: {API_BASE}")
        print(f"MongoDB: {MONGO_URL}, Database: {DB_NAME}")
        print()
        print("Testing exact flow from review request:")
        print("1. Health check")
        print("2. Register BackendTestUser with pin_hash 'dGVzdHBpbg==' and public_key 'dGVzdGtleQ=='")
        print("3. Login with same credentials")
        print("4. Verify token works for /api/conversations")
        print("5. Register a second user to test conversation creation")
        print("6. Clean up: Delete test users from MongoDB")
        print()
        
        # Clean up any existing test data first
        self.cleanup_test_users()
        
        # Run tests in exact order from review request
        tests = [
            self.test_1_health_check,
            self.test_2_register_user1,
            self.test_3_login_user1,
            self.test_4_verify_token_conversations,
            self.test_5_register_user2,
            self.test_6_login_user2,
            self.test_7_create_conversation,
            self.test_8_send_message
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed += 1
                print()  # Add spacing between tests
            except Exception as e:
                print(f"Test failed with exception: {e}")
                print()
        
        # Clean up test data as requested
        print("Performing cleanup as requested...")
        self.cleanup_test_users()
        
        # Summary
        print("=" * 70)
        print("REVIEW REQUEST TEST SUMMARY")
        print("=" * 70)
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if passed == total:
            print("\n🎉 ALL REVIEW REQUEST TESTS PASSED!")
            print("✅ Registration and login work correctly")
            print("✅ Critical bug fix verification: SUCCESS")
            return True
        else:
            print(f"\n⚠️  {total - passed} test(s) failed.")
            print("❌ Critical bug fix verification: FAILED")
            
            # Show failed tests
            failed_tests = [r for r in self.test_results if not r["success"]]
            if failed_tests:
                print("\nFailed tests:")
                for test in failed_tests:
                    print(f"  - {test['test']}: {test['details']}")
            
            return False

if __name__ == "__main__":
    tester = ReviewRequestTester()
    success = tester.run_review_request_tests()
    sys.exit(0 if success else 1)