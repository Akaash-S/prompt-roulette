import json
import unittest
from collections import Counter
from backend.generate.handler import handler as generate_handler

class TestGenerateHandler(unittest.TestCase):
    def test_cors_options(self):
        res = generate_handler({"requestContext": {"http": {"method": "OPTIONS"}}})
        self.assertEqual(res["statusCode"], 200)

    def test_unknown_category(self):
        res = generate_handler({"body": json.dumps({"category": "invalid_cat"})})
        self.assertEqual(res["statusCode"], 400)
        body = json.loads(res["body"])
        self.assertEqual(body.get("error"), "unknown category")

    def test_specific_category(self):
        res = generate_handler({"body": json.dumps({"category": "haiku"})})
        self.assertEqual(res["statusCode"], 200)
        data = json.loads(res["body"])
        self.assertEqual(data["category"], "haiku")
        self.assertIn("id", data)
        self.assertIn("rarity", data)
        self.assertIn("text", data)

    def test_random_category(self):
        # Explicit "random" category
        res_random = generate_handler({"body": json.dumps({"category": "random"})})
        self.assertEqual(res_random["statusCode"], 200)
        data_random = json.loads(res_random["body"])
        self.assertIn("category", data_random)
        self.assertIn(data_random["category"], ["haiku", "meme_caption", "plot_twist", "band_name", "villain_line", "weird_invention"])

        # Omitted category -> defaults to random
        res_omitted = generate_handler({"body": json.dumps({})})
        self.assertEqual(res_omitted["statusCode"], 200)
        data_omitted = json.loads(res_omitted["body"])
        self.assertIn("category", data_omitted)

    def test_rarity_distribution(self):
        rarities = Counter()
        total_spins = 1000
        for _ in range(total_spins):
            res = generate_handler({"body": json.dumps({"category": "random"})})
            d = json.loads(res["body"])
            rarities[d["rarity"]] += 1
        
        self.assertTrue(650 <= rarities["common"] <= 750, f"Common count out of range: {rarities['common']}")
        self.assertTrue(200 <= rarities["rare"] <= 300, f"Rare count out of range: {rarities['rare']}")
        self.assertTrue(30 <= rarities["legendary"] <= 70, f"Legendary count out of range: {rarities['legendary']}")

if __name__ == "__main__":
    unittest.main()
