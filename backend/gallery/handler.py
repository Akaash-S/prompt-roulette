import json
import os
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError

TABLE_NAME = os.environ.get("TABLE_NAME", "PromptRouletteEntries")
REGION = os.environ.get("AWS_REGION", "ap-south-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Content-Type": "application/json"
}

MAX_TEXT_LENGTH = 500

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

    if action == "save":
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

        # Server-side length cap guard
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

    elif action == "list":
        try:
            response = table.scan()
            items = response.get("Items", [])
            
            # Convert any Decimal to int/float for JSON serialization
            for item in items:
                if "votes" in item:
                    item["votes"] = int(item["votes"])

            # Sort by votes descending, then created_at descending
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

    elif action == "upvote":
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
                UpdateExpression="ADD votes :one",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="ALL_NEW"
            )
            updated_item = res.get("Attributes", {})
            if "votes" in updated_item:
                updated_item["votes"] = int(updated_item["votes"])

            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({"message": "upvoted successfully", "item": updated_item})
            }
        except ClientError as e:
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
