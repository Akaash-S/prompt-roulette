# AWS Builder Center — Weekend Challenge: "Build a Creative App"
## Project: Prompt Roulette

> Single source of truth for this project. Update the Log (§9) every session.
> Companion doc: `AGENT_BRIEF.md` — the exact brief to hand to the Antigravity agent.

---

## 0. Status / Open Items

- [ ] **Challenge post text pasted below** (§1) — original page is JS-rendered, could not
      be scraped directly. Plan below assumes the "build something + use ≥1 AWS service"
      variant based on sibling Weekend Challenge posts. Confirm and correct once pasted.
- [ ] Deadline confirmed (date + time zone)
- [ ] Submission mechanism confirmed
- [x] AWS CLI configured, region `ap-south-1`, non-root IAM dev user (`prompt-roulette-dev`)
- [x] Lambda execution role + scoped inline policies created (see §5a for exact names)
- [ ] Billing alarm / zero-spend budget live (still needed — see §9)
- [ ] Repo created (done by you) — `PROJECT.md` + `AGENT_BRIEF.md` dropped into it
- [ ] Word banks + templates written
- [ ] Lambda `generate` deployed + tested
- [ ] Lambda `gallery` (save/list/upvote) deployed + tested
- [ ] Frontend wheel UI built
- [ ] Gallery page built
- [ ] Deployed to GitHub Pages
- [ ] Demo recorded / screenshots taken
- [ ] Submitted to Builder Center before deadline

---

## 1. Source: Original Challenge Post

**URL:** https://builder.aws.com/content/3HkKlGRPcyks0rQpYVUVY9veCX0/weekend-challenge-build-a-creative-app

```
[PASTE THE FULL POST TEXT HERE — rules, dates, prize count, submission steps]
```

---

## 2. Constraints

| Constraint | Detail |
|---|---|
| Must use AWS | At least 1 AWS resource, per challenge rules |
| Budget | Free tier already used — must stay at **guaranteed $0** |
| Timeline | One weekend |
| Theme | "Creative app" |
| Vibe requirement (yours) | Must actually be **fun**, not just technically valid |

---

## 3. The Concept — Prompt Roulette

A spinning wheel of creative chaos. User spins → wheel lands on a category → app
instantly generates a quirky creative snippet (haiku, meme caption, plot twist, band
name, villain monologue line, weird invention). No LLM, no external AI API — a
template + curated word-bank engine running entirely inside one Lambda function.
Feels like magic, costs nothing.

### The fun mechanic: rarity tiers (loot-box feel)
Every spin rolls a rarity alongside the category:
- **Common (70%)** — solid, everyday result
- **Rare (25%)** — funnier/weirder combo, better visual flourish
- **Legendary (5%)** — confetti burst, gold border, pulls from your funniest
  hand-written lines

This is the core addictive loop — people spin again chasing a Legendary. Zero
marginal cost (it's a weighted random pick).

### Categories (build 5–6)
| Category | Example shape |
|---|---|
| Haiku | Curated 5-7-5 phrase fragments stitched together |
| Meme Caption | "When you {situation} but {unexpected twist}" |
| Plot Twist | "{character} discovers {secret} right before {event}" |
| Band Name | adjective + noun + genre-flavored suffix |
| Villain Monologue Line | archetype + menace-template |
| Weird Invention | "A {device} that {absurd function}, powered by {silly power source}" |

**Combo Mode (stretch goal):** spin twice, mash two categories together
("Villain Haiku"). Cheap to build, very shareable.

---

## 4. Architecture

```
Browser (GitHub Pages, free, non-AWS)
        │  fetch() POST /generate  { category }
        ▼
AWS Lambda — Function URL (no API Gateway, avoids that charge risk)
        │  runs template engine, rolls rarity, returns JSON
        ▼
{ id, category, text, rarity, timestamp }
        │
        │  (on "Save")  →  PutItem
        ▼
AWS DynamoDB table: PromptRouletteEntries
        ▲
        │  GET /gallery  →  Scan + client-side sort
Browser — Gallery page
```

Two logical routes, simplest as **two separate Lambda functions** (avoids
routing logic inside one handler):
1. **`prompt-roulette-generate`** — pure compute, no AWS write
2. **`prompt-roulette-gallery`** — handles `save` (PutItem), `list` (Scan),
   `upvote` (UpdateItem) via an `action` field in the request body

---

## 4a. IAM & AWS Identity Reference

All created manually, already live — nothing here should be recreated by the agent.
Full detail and exact policy JSON: see conversation history / `AGENT_BRIEF.md` §5.

| Resource | Name | Purpose |
|---|---|---|
| Region | `ap-south-1` | Set as CLI default via `aws configure` |
| CLI dev user | `prompt-roulette-dev` | Identity used for all `aws` CLI deploy commands |
| Dev user policy | `prompt-roulette-dev-policy` | Lambda/DynamoDB manage actions + `iam:PassRole` scoped to exactly one role, exactly one service |
| Lambda execution role | `prompt-roulette-lambda-role` | Attached to both Lambda functions at deploy time |
| Execution role policy | `prompt-roulette-dynamodb-access` | Scoped to `PutItem`/`Scan`/`UpdateItem` on the `PromptRouletteEntries` table ARN only |

Get the account ID whenever an ARN is needed: `aws sts get-caller-identity --query Account --output text`

---

## 5. Data Model

**Table:** `PromptRouletteEntries`
- Partition key: `entry_id` (string, UUID)
- Attributes: `category` (string), `text` (string), `rarity` (string),
  `votes` (number, default 0), `created_at` (string, ISO-8601)

Hackathon scale (dozens–hundreds of items) → plain `Scan` + client-side sort.
No GSI needed. Keep it simple.

---

## 6. API Contract

### `POST /generate`
Request:
```json
{ "category": "haiku" }
```
Response:
```json
{
  "id": "b3f1...",
  "category": "haiku",
  "text": "...",
  "rarity": "rare",
  "created_at": "2026-08-15T10:00:00Z"
}
```
- `category` omitted or `"random"` → server picks a random category
- Unknown category → 400 with `{ "error": "unknown category" }`

### `POST /gallery` (action-based, single Lambda)
Save:
```json
{ "action": "save", "id": "...", "category": "...", "text": "...", "rarity": "..." }
```
List:
```json
{ "action": "list" }
```
→ `{ "items": [ {...}, {...} ] }` (most recent first, or top-voted — decide in UI)

Upvote:
```json
{ "action": "upvote", "entry_id": "..." }
```

CORS: both Lambdas must return
`Access-Control-Allow-Origin: https://<your-username>.github.io` (or `*` while
developing, tightened before submission).

---

## 7. Frontend UX Flow

1. Landing page: large spinning wheel (CSS `conic-gradient` or `<canvas>`),
   wedges = categories
2. **Spin** button → wheel animates → lands on a category → `fetch('/generate')`
   fires → result revealed with a typewriter effect
3. Rarity badge shown with matching color/animation; confetti (small client-side
   JS lib) on Legendary only
4. Action buttons: **Spin Again**, **Remix** (same category, reroll), **Save to
   Gallery**, **Copy/Share**
5. **Gallery** tab/page: saved community entries, sortable by votes/recency,
   upvote button per card

---

## 8. Build Plan (weekend checklist)

**Day 1 — write the creative content first, offline**
- [ ] Write word banks (JSON) for each category — nouns/adjectives/verbs/archetypes
- [ ] Write templates with `{slot}` placeholders per category
- [ ] Write the generation + rarity-roll logic as a plain local Python function,
      test it in isolation before touching AWS at all

**Day 1/2 — backend**
- [ ] Create IAM user/role scoped to: Lambda, DynamoDB (this table only),
      CloudWatch Logs — nothing broader
- [ ] Create `PromptRouletteEntries` DynamoDB table
- [ ] Deploy `prompt-roulette-generate` Lambda + Function URL, test with curl
- [ ] Deploy `prompt-roulette-gallery` Lambda + Function URL, test save/list/upvote

**Day 2 — frontend**
- [ ] Build wheel UI + spin animation + fetch wiring
- [ ] Typewriter reveal + rarity styling + confetti on Legendary
- [ ] Gallery page: list, sort, upvote
- [ ] Mobile responsiveness pass
- [ ] (Stretch) Combo Mode

**Day 2 — ship**
- [ ] Deploy frontend to GitHub Pages
- [ ] Tighten CORS to the real GitHub Pages origin
- [ ] Record short demo (GIF or <2 min video)
- [ ] Write README: what it does, AWS services used, architecture diagram
- [ ] Submit to the Builder Center post before deadline

---

## 9. Cost Guarantee

| Service | Tier | Expires? |
|---|---|---|
| Lambda | Always-Free: 1M requests/mo, 400k GB-s/mo | Never |
| Lambda Function URL | Free (no API Gateway) | Never |
| DynamoDB | Always-Free: 25GB, 25 RCU/WCU | Never |
| GitHub Pages | Free, not AWS | N/A |

Weekend-scale traffic will not come close to any of these ceilings.
**Net cost: $0.00, guaranteed.**

Safety net regardless:
- AWS Budgets → zero-spend budget template, alert at >$0.01
- CloudWatch alarm on `EstimatedCharges`, threshold $1
- Single region (`ap-south-1` — Mumbai, nearest to builder), scoped IAM, no root usage

---

## 10. Repo Structure (target)

```
prompt-roulette/
├── README.md
├── backend/
│   ├── generate/
│   │   ├── handler.py
│   │   ├── wordbanks.json
│   │   └── templates.json
│   └── gallery/
│       └── handler.py
├── frontend/
│   ├── index.html
│   ├── gallery.html
│   ├── style.css
│   └── app.js
└── infra/
    └── deploy-notes.md   (manual console steps or CLI commands used)
```

---

## 11. Log

| Date | Update |
|---|---|
| 2026-08-15 | Doc created; drafted zero-cost plan from sibling-challenge pattern. |
| 2026-08-15 | Locked in Option A → "Prompt Roulette" concept, full spec written, build checklist added. Handing off to Antigravity agent via `AGENT_BRIEF.md`. |
| 2026-08-15 | AWS CLI configured (region `ap-south-1`, non-root `prompt-roulette-dev` user). IAM role (`prompt-roulette-lambda-role`) + scoped inline policies created manually, with `iam:PassRole` locked to that one role/one service to avoid the wildcard-PassRole anti-pattern. Repo created. `AGENT_BRIEF.md` updated with exact resource names/ARNs so the agent reuses instead of recreating IAM. Still open: billing/zero-spend alarm. |
