import json
import os
import random
import uuid
from datetime import datetime, timezone

# Load template and word bank data once at module cold start
DIR_PATH = os.path.dirname(os.path.realpath(__file__))

with open(os.path.join(DIR_PATH, "templates.json"), "r", encoding="utf-8") as f:
    TEMPLATES = json.load(f)

with open(os.path.join(DIR_PATH, "wordbanks.json"), "r", encoding="utf-8") as f:
    WORDBANKS = json.load(f)

VALID_CATEGORIES = list(TEMPLATES.keys())

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST"
}

def roll_rarity():
    """
    Rarity probability:
    - Common: 70% (0.00 <= val < 0.70)
    - Rare: 25% (0.70 <= val < 0.95)
    - Legendary: 5% (0.95 <= val <= 1.00)
    """
    val = random.random()
    if val < 0.70:
        return "common"
    elif val < 0.95:
        return "rare"
    else:
        return "legendary"

def generate_text(category, rarity):
    bank = WORDBANKS.get(category, {})
    
    # On legendary roll, attempt to pick from legendary hand-written array if available
    if rarity == "legendary" and "legendary" in bank and bank["legendary"]:
        return random.choice(bank["legendary"])
    
    template = TEMPLATES.get(category, "")
    slots = {}
    for key, choices in bank.items():
        if key == "legendary":
            continue
        if isinstance(choices, list) and choices:
            slots[key] = random.choice(choices)
            
    try:
        return template.format(**slots)
    except KeyError:
        return f"Generated {category} prompt."

def handler(event, context=None):
    # Handle CORS OPTIONS preflight
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"message": "CORS preflight OK"})
        }

    # Parse request body
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

    req_category = body.get("category") if isinstance(body, dict) else None

    if not req_category or req_category == "random":
        category = random.choice(VALID_CATEGORIES)
    elif req_category in VALID_CATEGORIES:
        category = req_category
    else:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "unknown category"})
        }

    rarity = roll_rarity()
    generated_prompt = generate_text(category, rarity)
    now_iso = datetime.now(timezone.utc).isoformat()

    response_payload = {
        "id": str(uuid.uuid4()),
        "category": category,
        "text": generated_prompt,
        "rarity": rarity,
        "created_at": now_iso
    }

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps(response_payload)
    }
