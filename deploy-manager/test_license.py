import license_utils

payload = {
    "maxEmployees": 50,
    "bufferPercentage": 10,
    "expirationDate": "2026-12-31",
    "providerName": "Test Provider",
    "providerPhone": "123456",
    "issueDate": "2024-01-01"
}

token = license_utils.encrypt_license(payload)
print(f"Generated Token: {token}")

decrypted = license_utils.decrypt_license(token)
print(f"Decrypted Payload: {decrypted}")

if payload == decrypted:
    print("Success: Encryption and Decryption are working correctly in Python.")
else:
    print("Error: Decrypted payload does not match original.")
