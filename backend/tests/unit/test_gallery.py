import json
import unittest
from backend.gallery.handler import handler as gallery_handler

class TestGalleryHandlerValidation(unittest.TestCase):
    def test_missing_action(self):
        res = gallery_handler({"body": json.dumps({})})
        self.assertEqual(res["statusCode"], 400)

    def test_unknown_action(self):
        res = gallery_handler({"body": json.dumps({"action": "fly_to_moon"})})
        self.assertEqual(res["statusCode"], 400)

    def test_save_unauthorized_without_token(self):
        res = gallery_handler({"body": json.dumps({
            "action": "save",
            "entry_id": "test-id",
            "category": "haiku",
            "text": "sample text",
            "rarity": "common"
        })})
        self.assertEqual(res["statusCode"], 401)
        body = json.loads(res["body"])
        self.assertIn("unauthorized", body.get("error", ""))

    def test_save_missing_fields(self):
        res = gallery_handler({"body": json.dumps({
            "action": "save",
            "text": "hello",
            "token": "mock-user-123"
        })})
        self.assertEqual(res["statusCode"], 400)

    def test_save_text_length_cap(self):
        long_text = "x" * 501
        res = gallery_handler({"body": json.dumps({
            "action": "save",
            "entry_id": "test-id",
            "category": "haiku",
            "text": long_text,
            "rarity": "common",
            "token": "mock-user-123"
        })})
        self.assertEqual(res["statusCode"], 400)
        err = json.loads(res["body"]).get("error", "")
        self.assertIn("exceeds maximum length", err)

    def test_upvote_unauthorized_without_token(self):
        res = gallery_handler({"body": json.dumps({
            "action": "upvote",
            "entry_id": "test-id"
        })})
        self.assertEqual(res["statusCode"], 401)

if __name__ == "__main__":
    unittest.main()
