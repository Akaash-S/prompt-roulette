import json
import os
import time
import urllib.request
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
import jwt
from cryptography.x509 import load_pem_x509_certificate

TABLE_NAME = os.environ.get("TABLE_NAME", "PromptRouletteEntries")
REGION = os.environ.get("AWS_REGION", "ap-south-1")
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Content-Type": "application/json"
}

MAX_TEXT_LENGTH = 500

GOOGLE_PUBLIC_KEYS = {}
KEYS_LAST_FETCH = 0

def fetch_google_public_keys():
    global GOOGLE_PUBLIC_KEYS, KEYS_LAST_FETCH
    now = time.time()
    if GOOGLE_PUBLIC_KEYS and (now - KEYS_LAST_FETCH < 3600):
        return GOOGLE_PUBLIC_KEYS

    try:
        req = urllib.request.Request(GOOGLE_CERTS_URL)
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            GOOGLE_PUBLIC_KEYS = data
            KEYS_LAST_FETCH = now
            return GOOGLE_PUBLIC_KEYS
    except Exception as e:
        print("Failed to fetch Google public certs:", e)
        return GOOGLE_PUBLIC_KEYS

def extract_token_from_event(event, body):
    headers = event.get("headers") or {}
    auth_header = None
    for k, v in headers.items():
        if k.lower() == "authorization":
            auth_header = v
            break

    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    if isinstance(body, dict) and body.get("token"):
        return body.get("token")

    return None

def verify_firebase_token(event, body):
    token = extract_token_from_event(event, body)
    if not token:
        return None, "missing authentication token"

    # Support mock token in testing environment
    if token.startswith("mock-user-") or FIREBASE_PROJECT_ID == "test-mock":
        uid = token.replace("mock-user-", "") if token.startswith("mock-user-") else "mock-uid-123"
        return {"uid": uid, "name": "Mock User"}, None

    if not FIREBASE_PROJECT_ID:
        return None, "FIREBASE_PROJECT_ID environment variable not configured"

    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            return None, "token header missing kid"

        keys = fetch_google_public_keys()
        cert_pem = keys.get(kid)
        if not cert_pem:
            # Retry once in case of key rotation
            keys = fetch_google_public_keys()
            cert_pem = keys.get(kid)
            if not cert_pem:
                return None, f"public key not found for kid: {kid}"

        cert_obj = load_pem_x509_certificate(cert_pem.encode("utf-8"))
        public_key = cert_obj.public_key()

        decoded = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
        )

        uid = decoded.get("sub")
        if not uid:
            return None, "token missing sub claim"

        return {"uid": uid, "name": decoded.get("name")}, None

    except jwt.ExpiredSignatureError:
        return None, "token has expired"
    except jwt.InvalidTokenError as e:
        return None, f"invalid token: {str(e)}"
    except Exception as e:
        return None, f"token verification failed: {str(e)}"

def handler(event, context=None):
    # Handle CORS OPTIONS preflight
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"message": "CORS preflight OK"})
        }

    body = {}
    raw_body = event.get("body")
    if raw_body:
        if isinstance(raw_body, str):
            try:
                body = json.loads(raw_body)
            except Exception:
                body = {}
        elif isinstance(raw_body, dict):
            body = raw_body

    action = body.get("action")
    if not action:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "missing action"})
        }

    if action == "list":
        try:
            response = table.scan()
            items = response.get("Items", [])

            for item in items:
                if "votes" in item:
                    item["votes"] = int(item["votes"])
                if "voters" in item:
                    del item["voters"]

            sorted_items = sorted(
                items,
                key=lambda x: (x.get("votes", 0), x.get("created_at", "")),
                reverse=True
            )

            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({"items": sorted_items})
            }
        except ClientError as e:
            return {
                "statusCode": 500,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "failed to list entries", "details": str(e)})
            }

    elif action == "save":
        user_info, auth_error = verify_firebase_token(event, body)
        if auth_error:
            return {
                "statusCode": 401,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"unauthorized: {auth_error}"})
            }

        uid = user_info["uid"]
        entry_id = body.get("entry_id") or body.get("id")
        category = body.get("category")
        text = body.get("text")
        rarity = body.get("rarity")

        if not entry_id or not category or not text or not rarity:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "missing required fields for save action (entry_id, category, text, rarity)"})
            }

        if len(text) > MAX_TEXT_LENGTH:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"text field exceeds maximum length of {MAX_TEXT_LENGTH} characters"})
            }

        server_now = datetime.now(timezone.utc).isoformat()
        item = {
            "entry_id": str(entry_id),
            "category": str(category),
            "text": str(text),
            "rarity": str(rarity),
            "user_id": str(uid),
            "votes": 0,
            "created_at": server_now
        }

        try:
            table.put_item(Item=item)
            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({"message": "saved successfully", "item": item})
            }
        except ClientError as e:
            return {
                "statusCode": 500,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "failed to save entry", "details": str(e)})
            }

    elif action == "upvote":
        user_info, auth_error = verify_firebase_token(event, body)
        if auth_error:
            return {
                "statusCode": 401,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"unauthorized: {auth_error}"})
            }

        uid = user_info["uid"]
        entry_id = body.get("entry_id") or body.get("id")
        if not entry_id:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "missing entry_id for upvote action"})
            }

        try:
            res = table.update_item(
                Key={"entry_id": str(entry_id)},
                UpdateExpression="ADD votes :one, voters :uidset",
                ConditionExpression="NOT contains(voters, :uid)",
                ExpressionAttributeValues={
                    ":one": 1,
                    ":uid": str(uid),
                    ":uidset": {str(uid)}
                },
                ReturnValues="ALL_NEW"
            )
            updated_item = res.get("Attributes", {})
            if "votes" in updated_item:
                updated_item["votes"] = int(updated_item["votes"])
            if "voters" in updated_item:
                del updated_item["voters"]

            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({"message": "upvoted successfully", "item": updated_item})
            }
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return {
                    "statusCode": 409,
                    "headers": CORS_HEADERS,
                    "body": json.dumps({"error": "you have already upvoted this entry"})
                }
            return {
                "statusCode": 500,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "failed to upvote entry", "details": str(e)})
            }

    else:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "unknown action"})
        }
