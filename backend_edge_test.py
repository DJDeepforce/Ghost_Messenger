#!/usr/bin/env python3
"""
GhostChat Backend API Edge Case Testing
Tests error handling, authentication, and edge cases
"""

import requests
import json
import time
import random
import string
from datetime import datetime

BASE_URL = "https://vault-talk-4.preview.emergentagent.com/api"

def test_auth_edge_cases():
    """Test authentication edge cases"""
    print("🔐 Testing Authentication Edge Cases...")
    
    # Test invalid credentials
    login_data = {
        "username": "nonexistent_user",
        "pin_hash": "invalid_hash"
    }
    
    response = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=10)
    if response.status_code == 401:
        print("✅ PASS: Invalid login rejected")
    else:
        print(f"❌ FAIL: Invalid login - Expected 401, got {response.status_code}")
    
    # Test duplicate username registration
    username = f"test_user_{int(time.time())}"
    user_data = {
        "username": username,
        "pin_hash": "test_hash",
        "public_key": "test_key"
    }
    
    # First registration
    response1 = requests.post(f"{BASE_URL}/auth/register", json=user_data, timeout=10)
    # Second registration with same username
    response2 = requests.post(f"{BASE_URL}/auth/register", json=user_data, timeout=10)
    
    if response1.status_code == 200 and response2.status_code == 400:
        print("✅ PASS: Duplicate username rejected")
    else:
        print(f"❌ FAIL: Duplicate username - First: {response1.status_code}, Second: {response2.status_code}")

def test_unauthorized_access():
    """Test unauthorized access to protected endpoints"""
    print("🚫 Testing Unauthorized Access...")
    
    protected_endpoints = [
        ("GET", "/auth/me"),
        ("GET", "/conversations"),
        ("POST", "/conversations", {"participant_id": "test"}),
        ("GET", "/messages/test_conv_id"),
        ("POST", "/messages", {"conversation_id": "test", "encrypted_content": "test", "recipient_id": "test"}),
        ("POST", "/panic", {"confirm": True}),
        ("GET", "/users/search?q=test")
    ]
    
    for method, endpoint, *data in protected_endpoints:
        try:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
            else:
                payload = data[0] if data else {}
                response = requests.post(f"{BASE_URL}{endpoint}", json=payload, timeout=10)
            
            if response.status_code == 401:
                print(f"✅ PASS: {method} {endpoint} - Unauthorized access blocked")
            else:
                print(f"❌ FAIL: {method} {endpoint} - Expected 401, got {response.status_code}")
                
        except Exception as e:
            print(f"❌ ERROR: {method} {endpoint} - {str(e)}")

def test_message_read_authorization():
    """Test message read authorization (only recipient can read)"""
    print("📨 Testing Message Read Authorization...")
    
    # This test requires creating users and messages, but for edge case testing
    # we can test with invalid message IDs and tokens
    
    # Test with invalid token
    headers = {"Authorization": "Bearer invalid_token"}
    response = requests.post(f"{BASE_URL}/messages/fake_msg_id/read", 
                           headers=headers, timeout=10)
    
    if response.status_code == 401:
        print("✅ PASS: Invalid token rejected for message read")
    else:
        print(f"❌ FAIL: Invalid token - Expected 401, got {response.status_code}")

def test_conversation_access_control():
    """Test conversation access control"""
    print("💬 Testing Conversation Access Control...")
    
    # Test accessing non-existent conversation
    headers = {"Authorization": "Bearer invalid_token"}
    response = requests.get(f"{BASE_URL}/conversations/nonexistent_conv/participant", 
                          headers=headers, timeout=10)
    
    if response.status_code == 401:
        print("✅ PASS: Invalid token rejected for conversation access")
    else:
        print(f"❌ FAIL: Invalid token - Expected 401, got {response.status_code}")

def test_input_validation():
    """Test input validation"""
    print("📝 Testing Input Validation...")
    
    # Test registration with missing fields
    incomplete_data = {"username": "test"}
    response = requests.post(f"{BASE_URL}/auth/register", json=incomplete_data, timeout=10)
    
    if response.status_code == 422:  # FastAPI validation error
        print("✅ PASS: Incomplete registration data rejected")
    else:
        print(f"❌ FAIL: Incomplete data - Expected 422, got {response.status_code}")
    
    # Test message creation with missing fields
    headers = {"Authorization": "Bearer fake_token"}
    incomplete_msg = {"conversation_id": "test"}
    response = requests.post(f"{BASE_URL}/messages", json=incomplete_msg, 
                           headers=headers, timeout=10)
    
    if response.status_code in [401, 422]:  # Auth error or validation error
        print("✅ PASS: Incomplete message data handled")
    else:
        print(f"❌ FAIL: Incomplete message - Expected 401/422, got {response.status_code}")

def main():
    """Run edge case tests"""
    print("🧪 Starting GhostChat Backend Edge Case Tests")
    print(f"Base URL: {BASE_URL}")
    print("=" * 50)
    
    test_auth_edge_cases()
    print()
    test_unauthorized_access()
    print()
    test_message_read_authorization()
    print()
    test_conversation_access_control()
    print()
    test_input_validation()
    
    print("\n" + "=" * 50)
    print("✅ Edge case testing completed")

if __name__ == "__main__":
    main()