import json
import urllib.request
import urllib.error

GENERATE_URL = "https://xu27tiuthkyvoruzrrfym4y56y0zjvhm.lambda-url.ap-south-1.on.aws/"
GALLERY_URL = "https://jyqdnepdyt7ryji7aacrhsrmnu0qjpod.lambda-url.ap-south-1.on.aws/"

def call_api(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            return status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, parsed

def run_tests():
    print("=== LIVE ENDPOINT VERIFICATION SUITE ===\n")
    
    # 1. Generate: explicit categories
    categories = ["haiku", "meme_caption", "plot_twist", "band_name", "villain_line", "weird_invention"]
    last_generated_item = None

    for cat in categories:
        status, res = call_api(GENERATE_URL, {"category": cat})
        print(f"[GENERATE - {cat.upper()}] HTTP {status}")
        print(f"Response: {json.dumps(res, indent=2)}\n")
        assert status == 200
        assert res["category"] == cat
        assert "id" in res and "text" in res and "rarity" in res
        last_generated_item = res

    # 1b. Generate: explicit "random" category
    status, res = call_api(GENERATE_URL, {"category": "random"})
    print(f"[GENERATE - RANDOM CATEGORY] HTTP {status}")
    print(f"Response: {json.dumps(res, indent=2)}\n")
    assert status == 200
    assert res["category"] in categories
    assert "id" in res and "text" in res and "rarity" in res

    # 1c. Generate: omitted category (defaults to random)
    status, res = call_api(GENERATE_URL, {})
    print(f"[GENERATE - OMITTED CATEGORY (RANDOM)] HTTP {status}")
    print(f"Response: {json.dumps(res, indent=2)}\n")
    assert status == 200
    assert res["category"] in categories
    assert "id" in res and "text" in res and "rarity" in res

    # 1d. Invalid Category -> 400
    status, res = call_api(GENERATE_URL, {"category": "invalid_category_xyz"})
    print(f"[GENERATE - INVALID CATEGORY] HTTP {status}")
    print(f"Response: {json.dumps(res, indent=2)}\n")
    assert status == 400
    assert "error" in res

    # 2. Gallery: Save Action
    print("--- GALLERY ACTIONS ---")
    save_payload = {
        "action": "save",
        "entry_id": last_generated_item["id"],
        "category": last_generated_item["category"],
        "text": last_generated_item["text"],
        "rarity": last_generated_item["rarity"]
    }
    status, res = call_api(GALLERY_URL, save_payload)
    print(f"[GALLERY - SAVE] HTTP {status}")
    print(f"Response: {json.dumps(res, indent=2)}\n")
    assert status == 200
    assert res.get("message") == "saved successfully"

    # 3. Gallery: List Action
    status, res = call_api(GALLERY_URL, {"action": "list"})
    print(f"[GALLERY - LIST] HTTP {status}")
    items = res.get("items", [])
    print(f"Returned {len(items)} items. Top items:")
    for item in items[:3]:
        print(f"  - [{item['category']}] ({item['rarity']}) votes: {item['votes']} id: {item['entry_id']}")
    print()
    assert status == 200
    found = any(i["entry_id"] == last_generated_item["id"] for i in items)
    assert found, "Saved item not found in gallery list response!"

    # 4. Gallery: Upvote Action
    status, res = call_api(GALLERY_URL, {"action": "upvote", "entry_id": last_generated_item["id"]})
    print(f"[GALLERY - UPVOTE] HTTP {status}")
    print(f"Response: {json.dumps(res, indent=2)}\n")
    assert status == 200
    updated_item = res.get("item", {})
    assert "votes" in updated_item

    print("=== ALL LIVE ENDPOINT TESTS PASSED 100% ===")

if __name__ == "__main__":
    run_tests()
