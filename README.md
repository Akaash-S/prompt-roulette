# 🎰 Prompt Roulette

> **Spin-the-wheel creative prompt generator** built with pure template + word-bank logic running on AWS Lambda and DynamoDB. Guaranteed **$0 spend** architecture using AWS Always-Free tier services.

---

## 🌟 Overview

**Prompt Roulette** is a fun, interactive web application where users spin a physical-style wheel to land on one of 6 creative prompt categories:

1. 📜 **Haiku** — 3-line poetic observations.
2. 🎭 **Meme Caption** — Classic setup & punchline pairs.
3. 🌀 **Plot Twist** — Unexpected story escalations.
4. 🎸 **Band Name** — Unique musical ensemble names.
5. 🦹 **Villain Line** — Dramatic monologues & evil schemes.
6. 💡 **Weird Invention** — Absurd high-tech gadget descriptions.

### ✨ Rarity Drop Tiers
Every spin rolls a random rarity tier independent of category:
- ⚪ **Common (70%)** — Standard combinatorial template outputs.
- 🔵 **Rare (25%)** — High-variance prompt outputs with rare slot combinations.
- 🟡 **Legendary (5%)** — Gold-glowing card styling, custom confetti animation burst, and curated hand-written prompt lines.

Saved prompts appear in a shared public community gallery where users can upvote entries in real-time.

---

## 🏗️ Architecture & $0 Spend Design Rationale

```
  +-----------------------+
  |   Frontend Client     |
  |  (GitHub Pages / UI)  |
  +-----------+-----------+
              |
      +-------+-------+
      |               |
      v               v
  +-------+       +-------+
  | Lambda|       | Lambda|
  |Generate       |Gallery|
  +-------+       +---+---+
                      |
                      v
              +---------------+
              |   DynamoDB    |
              |     Table     |
              +---------------+
```

### 💸 Guaranteed $0 Cost Guarantee
Many "free tier" projects risk surprise charges when 12-month free trials expire or when paid services like API Gateway, S3, or LLM APIs are provisioned. **Prompt Roulette** avoids this completely by strictly adhering to AWS **Always-Free** tier resources:

1. **AWS Lambda (Compute)**: 1,000,000 requests/month perpetually free.
2. **Lambda Function URLs (HTTP Endpoint)**: Direct HTTPS endpoint built into Lambda. Replaces API Gateway ($0 perpetual cost).
3. **DynamoDB (`PromptRouletteEntries`)**: On-Demand (`PAY_PER_REQUEST`) billing mode. Fits inside 25 GB free storage & Always-Free read/write allowances.
4. **No LLM or External AI API Calls**: All creative text generation happens locally inside the `generate` Lambda function via Python combinatorial word-banks and template resolution.
5. **Static Hosting**: Hosted on GitHub Pages for zero hosting cost.

---

## 📂 Project Structure

```
prompt-roulette/
├── README.md
├── backend/
│   ├── generate/
│   │   ├── handler.py         # Lambda handler for prompt generation
│   │   ├── wordbanks.json     # Combinatorial candidate pools & legendary lines
│   │   └── templates.json     # Per-category text templates
│   ├── gallery/
│   │   └── handler.py         # Lambda handler for save, list, upvote
│   └── tests/
│       ├── unit/              # Unit test suite
│       └── integration/       # Live integration test suite
├── frontend/
│   ├── index.html             # Spin-the-wheel interactive UI
│   ├── gallery.html           # Public prompt gallery UI
│   ├── style.css              # Dark mode modern design system & animations
│   └── app.js                 # App controller & Lambda fetch integration
├── docs/
│   └── internal/              # Gitignored deployment notes & internal reports
```

---

## 🚀 Running Locally

No server setup or build step is required!

1. **Test Backend Logic Locally**:
   ```bash
   python -m unittest discover backend/tests/unit
   ```
2. **Preview Frontend**:
   Open `frontend/index.html` directly in any web browser or use a local dev server (e.g. `npx serve frontend`).

---

## 📡 API Specification

### `generate` Lambda (`POST /`)
- **Request Body**:
  ```json
  { "category": "haiku" }  // or "random" or missing
  ```
- **Response (200 OK)**:
  ```json
  {
    "id": "c1f7a070-5db9-4674-8d4e-128a1c97a5b3",
    "category": "haiku",
    "text": "Keyboard keys click fast\nhoping the unit tests will pass\nfinally it works",
    "rarity": "common",
    "created_at": "2026-08-15T17:34:00+00:00"
  }
  ```

### `gallery` Lambda (`POST /`)
- **Save Action**:
  ```json
  {
    "action": "save",
    "entry_id": "c1f7a070-5db9-4674-8d4e-128a1c97a5b3",
    "category": "haiku",
    "text": "...",
    "rarity": "common"
  }
  ```
- **List Action**:
  ```json
  { "action": "list" }
  ```
- **Upvote Action**:
  ```json
  {
    "action": "upvote",
    "entry_id": "c1f7a070-5db9-4674-8d4e-128a1c97a5b3"
  }
  ```

