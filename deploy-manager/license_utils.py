import base64
import json
import hashlib
import os
import subprocess
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

# Master Key used for encryption (must match .env in the web app)
DEFAULT_MASTER_KEY = "ZAPATO_ROJO_MASTER_KEY_2026"

def get_evp_key_iv(password, salt, key_len=32, iv_len=16):
    """
    Replicates OpenSSL's EVP_BytesToKey for CryptoJS compatibility.
    Derives key and IV from a password and salt using MD5.
    """
    password = password.encode('utf-8')
    d = d_i = b''
    while len(d) < key_len + iv_len:
        d_i = hashlib.md5(d_i + password + salt).digest()
        d += d_i
    return d[:key_len], d[key_len:key_len + iv_len]

def encrypt_license(payload, password=DEFAULT_MASTER_KEY):
    """
    Encrypts a dictionary into a CryptoJS-compatible AES string.
    """
    data = json.dumps(payload).encode('utf-8')
    salt = os.urandom(8)
    key, iv = get_evp_key_iv(password, salt)
    
    cipher = AES.new(key, AES.MODE_CBC, iv)
    # CryptoJS uses PKCS7 padding
    padded_data = pad(data, AES.block_size)
    encrypted = cipher.encrypt(padded_data)
    
    # Prepend Salted__ prefix + salt
    result = b'Salted__' + salt + encrypted
    return base64.b64encode(result).decode('utf-8')

def decrypt_license(token, password=DEFAULT_MASTER_KEY):
    """
    Decrypts a CryptoJS-compatible AES string back into a dictionary.
    """
    try:
        data = base64.b64decode(token)
        if data[:8] != b'Salted__':
            return None
        
        salt = data[8:16]
        encrypted = data[16:]
        
        key, iv = get_evp_key_iv(password, salt)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        
        decrypted_padded = cipher.decrypt(encrypted)
        decrypted = unpad(decrypted_padded, AES.block_size)
        
        return json.loads(decrypted.decode('utf-8'))
    except Exception as e:
        print(f"Error decrypting license: {e}")
        return None

def install_license_to_firebase(project_id, token):
    """
    Uses Firebase CLI to set the license token in Firestore.
    Command: firebase firestore:set settings/license "{\"token\": \"...\"}" --project {project_id}
    """
    try:
        # 1. Try to get the access token from the config file directly (robust on Windows)
        access_token = None
        
        config_paths = [
            os.path.join(os.environ.get('USERPROFILE', ''), '.config', 'configstore', 'firebase-tools.json'),
            os.path.join(os.environ.get('APPDATA', ''), 'configstore', 'firebase-tools.json'),
            os.path.join(os.path.expanduser('~'), '.config', 'configstore', 'firebase-tools.json')
        ]
        
        for path in config_paths:
            if os.path.exists(path):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        tokens = data.get('tokens', {})
                        # Try to get access_token or fallback to refresh_token
                        access_token = tokens.get('access_token') or tokens.get('refresh_token')
                        if access_token:
                            break
                except Exception:
                    continue
        
        # Fallback to CLI commands if file reading failed
        if not access_token:
            for cmd_name in ["auth:print-access-token", "auth:token"]:
                token_cmd = f"firebase {cmd_name} --project {project_id}"
                token_res = subprocess.run(token_cmd, shell=True, capture_output=True, text=True)
                if token_res.returncode == 0:
                    access_token = token_res.stdout.strip()
                    break

        if not access_token:
            return False, "No se encontró sesión activa de Firebase. Por favor verifica que 'firebase login' funcione en tu terminal."

        # 2. Prepare the Firestore REST API URL
        # We use a PATCH request to create/update the document
        url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/settings/license?updateMask.fieldPaths=token"
        
        # 3. Prepare the JSON payload in the required Google API format
        payload = {
            "fields": {
                "token": {"stringValue": token.strip()}
            }
        }
        
        # Use curl (built-in in Windows 10+) to send the request
        import json as j
        payload_str = j.dumps(payload).replace('"', '\\"')
        curl_cmd = f'curl -X PATCH -H "Authorization: Bearer {access_token}" -H "Content-Type: application/json" -d "{payload_str}" "{url}"'
        
        result = subprocess.run(curl_cmd, shell=True, capture_output=True, text=True, check=True)
        
        # Check if the result contains an error (REST API might return 200 with error inside or 400)
        if '"error"' in result.stdout.lower():
            return False, result.stdout
            
        return True, "Licencia sincronizada exitosamente con el servidor del cliente."
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or "") + (e.stdout or "")
        return False, detail or f"Error de conexión (exit code {e.returncode})"
    except Exception as e:
        return False, str(e)
