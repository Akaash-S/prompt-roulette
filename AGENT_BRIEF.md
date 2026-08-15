# Agent Brief — Prompt Roulette

> Paste this whole document into Antigravity as the task brief. It is written to be
> self-contained: an agent reading only this file should be able to build the full
> project without guessing. Reference `PROJECT.md` in the same folder for the fuller
> narrative spec — this file is the actionable, unambiguous version.

---

## 0. Non-negotiable ground rules (read first)

1. **No paid AWS services, ever.** Only use: **AWS Lambda**, **Lambda Function URLs**,
   and **DynamoDB**. Do NOT provision API Gateway, S3, EC2, RDS, Bedrock, Rekognition,
   Polly, Comprehend, CloudFront, or anything not explicitly listed here — even if it
   seems like a small convenience. If a step seems to require one of those, STOP and
   surface the tradeoff instead of provisioning it.
2. **No LLM/external AI API calls of any kind** for content generation. All "creative"
   output must come from local template + word-bank logic running inside the Lambda
   function itself. This is a deliberate design choice, not a limitation to work around.
3. **IAM scoping — do not create new IAM users, roles, or policies.** They already
   exist (created manually by the human, see §2.1 for exact names/ARNs). Reuse them
   as-is. If a permission genuinely turns out to be missing, STOP and report exactly
   which action/resource is missing instead of creating a new role or widening an
   existing policy yourself.
4. **Single region.** Use `ap-south-1` (Mumbai) — this is already the default region
   via `aws configure` on this machine. Do not override it or create resources in any
   other region.
5. **Ask before deploying**, don't ask for style/wording choices. Concretely: don't stop
   to ask "should the wheel be blue or purple" — pick something and move on. DO stop and
   confirm before running any command that creates or modifies a real AWS resource, so
   the human can watch it happen and verify cost/region.
6. If AWS CLI credentials aren't configured in the environment, stop and ask the human to
   run `aws configure` (or provide an IAM user's keys) rather than trying to work around it.

---

## 1. What we're building

**Prompt Roulette** — a spin-the-wheel web app. User spins, wheel lands on a category,
app returns a short generated creative snippet (haiku / meme caption / plot twist /
band name / villain line / weird invention) with a randomly rolled rarity
(Common 70% / Rare 25% / Legendary 5%). Legendary rolls get a distinct visual
treatment (confetti, gold styling) and pull from a smaller pool of hand-written,
funnier lines. Users can save results to a shared gallery and upvote others' entries.

Full narrative spec, UX flow, and rationale: see `PROJECT.md` §3–7 in this same folder.

---

## 2. Repo structure to create

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
    └── deploy-notes.md
```

`infra/deploy-notes.md` must end up containing the exact AWS CLI commands (or console
click-path, if CLI isn't used) that were run to create each resource, so the human can
tear it down or reproduce it later.

---

## 3. Backend — `generate` Lambda

**Runtime:** Python 3.12 (or latest available Lambda Python runtime)

**Input (via Lambda Function URL, POST body, JSON):**
```json
{ "category": "haiku" }
```
- `category` missing or `"random"` → pick uniformly at random from available categories
- `category` not recognized → return HTTP 400, `{"error": "unknown category"}`

**Output (HTTP 200, JSON):**
```json
{
  "id": "<uuid4>",
  "category": "haiku",
  "text": "<generated line(s)>",
  "rarity": "common | rare | legendary",
  "created_at": "<ISO-8601 UTC timestamp>"
}
```

**Logic requirements:**
1. Roll rarity first, independent of category: 70% common / 25% rare / 5% legendary
   (use `random.random()` with cumulative thresholds, or `random.choices` with weights).
2. Build the output using `templates.json` (per-category template strings with
   `{slot_name}` placeholders) filled from `wordbanks.json` (arrays of candidate values
   per slot, grouped by category).
3. On a **legendary** roll, prefer entries from a `legendary` array if the category's
   word bank defines one (curated, funnier hand-written lines); fall back to the normal
   pool if not defined for that category yet.
4. Build **at least 5 categories**: `haiku`, `meme_caption`, `plot_twist`, `band_name`,
   `villain_line`. Add `weird_invention` if time allows.
5. Each word bank needs enough entries per slot (aim for 15–30+) that repeat spins don't
   feel obviously repetitive within a short demo session.
6. Set CORS headers on every response (including error responses):
   `Access-Control-Allow-Origin: *` during development. Note in `deploy-notes.md` that
   this should be tightened to the actual GitHub Pages origin before final submission.
7. No DynamoDB access from this function — it's pure compute, keep it that way.

---

## 4. Backend — `gallery` Lambda

**Runtime:** same as above. Single function, `action`-based routing.

**Input (POST body, JSON), three shapes:**

Save:
```json
{ "action": "save", "id": "<uuid>", "category": "...", "text": "...", "rarity": "..." }
```
→ PutItem into `PromptRouletteEntries` with `votes: 0` and a server-generated
`created_at` timestamp. Ignore any client-supplied `created_at`/`votes`.

List:
```json
{ "action": "list" }
```
→ Scan the table, return `{"items": [...]}` sorted by `votes` descending, then
`created_at` descending as tiebreak. It's fine to sort client-side instead if simpler —
pick one and be consistent.

Upvote:
```json
{ "action": "upvote", "entry_id": "<uuid>" }
```
→ UpdateItem, `ADD votes :one`. Return the updated item.

**Validation:** missing/unknown `action` → HTTP 400 with `{"error": "unknown action"}`.
Missing required fields for a given action → HTTP 400 with a descriptive error.

**Table:** `PromptRouletteEntries`, partition key `entry_id` (string). Create with
on-demand (pay-per-request) billing mode — this keeps it inside the DynamoDB
Always-Free allowance at this scale without needing to think about provisioned
capacity units.

---

## 5. Existing AWS resources — reuse these exact names, do not recreate

All IAM setup is already done manually by the human. **Do not run any `iam create-role`,
`iam create-user`, `iam create-policy`, or `iam put-role-policy` commands.** These already
exist:

| Resource | Exact name | Notes |
|---|---|---|
| CLI dev user | `prompt-roulette-dev` | Already configured via `aws configure` on this machine, region `ap-south-1`. This is the identity the agent's AWS CLI calls run as. |
| Dev user inline policy | `prompt-roulette-dev-policy` | Grants `lambda:*`/`dynamodb:*` (create/update/delete/describe) plus a narrowly scoped `iam:PassRole` — see next row. |
| `iam:PassRole` scope | Locked to `arn:aws:iam::<ACCOUNT_ID>:role/prompt-roulette-lambda-role`, condition `iam:PassedToService = lambda.amazonaws.com` | The dev user can only hand this one role to Lambda — nothing else. This is why Lambda deploy commands must reference the exact role ARN below, not a role the agent invents. |
| Lambda execution role | `prompt-roulette-lambda-role` | ARN: `arn:aws:iam::<ACCOUNT_ID>:role/prompt-roulette-lambda-role`. Trust policy: `lambda.amazonaws.com`. Has `AWSLambdaBasicExecutionRole` (managed) attached. |
| Execution role inline policy | `prompt-roulette-dynamodb-access` | Grants `dynamodb:PutItem`, `dynamodb:Scan`, `dynamodb:UpdateItem` scoped to `arn:aws:dynamodb:ap-south-1:<ACCOUNT_ID>:table/PromptRouletteEntries` only. Already attached to the execution role above. |

**Get the real account ID before deploying** (needed to build ARNs in commands below):
```
aws sts get-caller-identity --query Account --output text
```
Substitute the result everywhere `<ACCOUNT_ID>` appears in this document.

**Both Lambda functions use the same execution role** (`prompt-roulette-lambda-role`) —
even though `generate` doesn't touch DynamoDB, using one role for both keeps this simple.
The role's DynamoDB permissions being unused by `generate` is not a security issue since
`generate` never calls those APIs — it's fine to leave as-is.

---

## 6. AWS provisioning steps (agent runs these, confirming with human first)

1. **Do not touch IAM.** The role and both inline policies from §5 already exist —
   verify with `aws iam get-role --role-name prompt-roulette-lambda-role` before
   proceeding, and stop to ask the human if it's missing rather than creating it.
2. Create the DynamoDB table:
   ```
   aws dynamodb create-table \
     --table-name PromptRouletteEntries \
     --attribute-definitions AttributeName=entry_id,AttributeType=S \
     --key-schema AttributeName=entry_id,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region ap-south-1
   ```
3. Zip and deploy `backend/generate` as Lambda function `prompt-roulette-generate`,
   using `--role arn:aws:iam::<ACCOUNT_ID>:role/prompt-roulette-lambda-role` (this exact
   ARN — the dev user's `PassRole` permission only allows this one).
4. Zip and deploy `backend/gallery` as Lambda function `prompt-roulette-gallery`, same
   role ARN.
5. Enable a **Function URL** on each (auth type `NONE` for simplicity of a public demo —
   note this tradeoff explicitly in `deploy-notes.md`; it's acceptable for a weekend
   hackathon project with no sensitive data, but flag it).
6. Record both Function URLs — the frontend needs them.
7. Record every command actually run in `infra/deploy-notes.md`, including the teardown
   commands (`aws lambda delete-function`, `aws dynamodb delete-table`) for later cleanup.
   Also record the real `<ACCOUNT_ID>` value used, so the notes are reproducible.

---

## 6. Frontend

Plain HTML/CSS/JS, no build step, no framework dependency required (keep it deployable
as static files with zero config). If a framework genuinely speeds things up and stays
buildable to static output, that's fine — but default to plain JS first.

**`index.html` / `app.js`:**
- Wheel UI (CSS `conic-gradient` wedges is simplest; `<canvas>` if more control wanted)
  with each configured category as a wedge
- `Spin` button: animate wheel rotation, then call `POST <generate-function-url>`
- Reveal result with a typewriter-style text animation
- Rarity badge: distinct color per tier; trigger a lightweight client-side confetti
  effect only on `legendary` (small vanilla-JS confetti snippet is fine, no heavy lib)
- Buttons: `Spin Again`, `Remix` (re-roll same category), `Save to Gallery` (calls
  gallery function with `action: "save"`), `Copy result`

**`gallery.html`:**
- On load, call gallery function with `action: "list"`, render cards (category, text,
  rarity styling, vote count, upvote button)
- Upvote button calls `action: "upvote"` and updates the count optimistically

**`style.css`:** keep it simple but give it actual personality — this is a "fun" app,
so lean into playful color/motion rather than a generic Bootstrap look. Mobile-responsive.

**Config:** put the two Function URLs in a single `const API = {...}` block at the top
of `app.js` so they're easy to find and swap after deployment.

---

## 7. Deployment

- Frontend: push `frontend/` contents to GitHub Pages (root or `/docs`, whichever the
  human's repo setup prefers — ask if unclear).
- After the real GitHub Pages URL is known, go back and tighten the `generate` and
  `gallery` Lambda CORS headers from `*` to that exact origin, redeploy both functions.

---

## 8. Done-criteria checklist

- [ ] `generate` Lambda deployed, returns valid JSON for all 5+ categories and for
      `random`, correctly rejects unknown categories with 400
- [ ] Rarity distribution roughly matches 70/25/5 over many test calls (spot check with
      a quick loop of ~100 calls, don't need to be exact)
- [ ] `gallery` Lambda: save/list/upvote all verified working via curl or Postman before
      wiring up the frontend
- [ ] Wheel spins, lands convincingly on the category the backend actually returned (no
      mismatch between animation landing spot and actual result)
- [ ] Legendary roll visibly looks different (confetti + styling)
- [ ] Save → item appears in gallery → upvote persists across a page reload
- [ ] Works on a mobile viewport width
- [ ] CORS tightened to real origin before calling this "done"
- [ ] `infra/deploy-notes.md` has real commands/steps, not placeholders
- [ ] `README.md` explains: what it does, which AWS services are used and why, how to
      run/deploy it, and a note on the $0-cost design (Always-Free Lambda + DynamoDB,
      no API Gateway, no external AI API)

---

## 9. If something doesn't fit these constraints

If at any point the "obvious" solution to a problem would require a service outside
Lambda + DynamoDB, or would call an external API, stop and report the tradeoff back
instead of quietly working around the constraint — the whole point of this project is
staying inside a guaranteed-$0 architecture.
