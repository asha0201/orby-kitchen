# Orby

A personalised household app for Asha and Prabha. **Orby Kitchen** is the first module: profiles and onboarding, a recipe library, a monthly meal plan, pantry tracking, shopping lists, household memory, reminders, and a feature-request log.

Design, data model, and the phased plan are in [`docs/FEASIBILITY.md`](docs/FEASIBILITY.md).

## What runs today

| Area | Status |
|---|---|
| Sign-in: one PIN per person, server sessions, lockout after 5 wrong tries | Built |
| Profiles and onboarding (editable; seeded from the initial brief; plan locked until required items are answered) | Built |
| Recipe library (add, edit, archive, delete; ingredients, steps, air-fryer, storage, nutrition with source and uncertainty) | Built |
| Per-person portions and protein estimate (uses the portion factor you set) | Built |
| Monthly plan (breakfast, lunch, dinner, snack) with rotation, lock, swap, "repeat yesterday", conflict warnings | Built |
| Cooking: step-by-step view, proposed pantry deductions you can correct, undo | Built |
| Pantry: quantities, units, confirmed vs estimated, paste-a-list import | Built |
| Shopping: missing items from the next 7 days of plan, purchase ticks, move bought items to pantry | Built |
| Memory: lasting and one-time rules, pause/edit/delete; used by the plan | Built |
| Feedback on recipes (rating, who, what changed; recipe is not overwritten) | Built |
| Reminders: 08:00 briefing and 20:00 prep reminder, in-app | Built |
| Feature requests with draft specification | Built |
| Browser push, camera or receipt scanning, conversational/Tamil input | Not built (needs provider decisions) |
| WhatsApp sharing, Alexa, Home Assistant, Govee, Europa lock, desk bot | Not built (see feasibility) |

Nothing is invented: the recipe library starts empty, nutrition fields are blank until entered, and Prabha's protein target is left for him to confirm.

## Requirements

- Node.js 22.13 or newer (uses the built-in `node:sqlite`; no native build).
- npm, for one runtime dependency (Express 5).

## Run it locally

```bash
cd orby
npm install
cp .env.example .env        # then edit TZ_NAME to your time zone
npm start                   # http://localhost:3000
```

Open the app on a phone on the same network by using the computer's address, or put it behind HTTPS (see below) for "Add to Home Screen" on iPhone.

### First run

1. Open the app. Set a PIN for Asha and a PIN for Prabha (4 to 8 digits).
2. Sign in as either person. The Today screen shows the onboarding gate.
3. Go to **More → Profiles**. Answer the open items. Type "none" or "not sure" where that is true. The plan stays locked until every required item has an answer.
4. Go to **Recipes → Add recipe** and add the household's own recipes. Orby does not ship a recipe catalogue.
5. Go to **Plan → Fill empty slots**.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/orby.db` | SQLite file. Back this up. |
| `TZ_NAME` | `UTC` | IANA time zone for "today", the 08:00 briefing and the 20:00 prep reminder. Set this to the household's zone. |
| `SECURE_COOKIES` | `0` | Set to `1` when served over HTTPS, so the session cookie is sent only over HTTPS. |

Environment variables override `.env`. Keep real values out of version control.

## Tests

```bash
npm test
```

Covers the onboarding gate, PIN hashing and lockout, plan rules (allergies, one-time and lasting memories, weekday time limit, rotation, locked entries), pantry deductions and undo, missing-item and shopping logic, notification deduplication, and the HTTP API (including the JSON-only write check).

A browser smoke test at iPhone size (setup → onboarding → recipe → plan → cook → pantry → shopping → memory) passed during the build. It is not part of `npm test`; it needs Playwright.

## Backup, restore and rollback

- **Back up:** copy the SQLite file while the app is running, e.g. `sqlite3 data/orby.db ".backup data/orby-backup.db"` (or stop the app and copy `data/orby.db` and any `-wal`/`-shm` files).
- **Migrations** are ordered and forward-only in `server/db.js`. Each runs in a transaction and is recorded in `schema_migrations`.
- **Rollback:** stop the app, restore the backup file to `DB_PATH`, and start the previous build. Migrations never drop columns, so an older build can usually read a newer file, but restoring a backup taken before the upgrade is the safe route.

## Security notes

- PINs are hashed with scrypt. Sessions are random tokens stored only as SHA-256 hashes; sessions last 30 days.
- After 5 wrong PINs, a person is locked out for 15 minutes.
- Writes must be JSON. This blocks simple cross-site form posts.
- Both members have equal access to all household data. This is a deliberate choice for two people; tell me if you want per-person permissions.
- The app is designed for a private household on a trusted network or behind HTTPS. It is not a managed identity provider. Do not expose it publicly without HTTPS and a review.

## Health information

Asha's postpartum, breastfeeding, hair-fall and supplement details are stored as context only. Orby does not diagnose, prescribe supplements, or set weight targets. The app prompts for clinician review where the brief asks for it.

## Known limitations

- Ingredient matching is by name and unit. "Tomato" and "tomatoes" are different items; correct them in the pantry.
- Dislikes (for example, seafood for Asha) produce warnings on shared meals rather than exclusions, because the household shares meals. Allergies are exclusions.
- Keyword memories match substrings of recipe names, tags and ingredients (for example, "chicken" matches "chicken thigh"). A "prawn" dish is not matched by "seafood" unless it is tagged.
- The scheduler runs inside the app process. Run one instance only. Notifications appear in the app; they are not pushed to a phone.
- Recipe quantities are assumed to cover one batch for the whole household.

## Project layout

```
server/index.js        startup, scheduler, shutdown
server/app.js          HTTP routes and security headers
server/domain.js       recipes, plan, pantry, cooking, shopping, memory, briefings
server/onboarding.js   onboarding items, completeness rules, seeded facts
server/auth.js         PINs, sessions, lockout
server/db.js           SQLite connection and migrations
public/                mobile-first web app (plain HTML, CSS and JavaScript)
test/orby.test.js      backend tests
docs/FEASIBILITY.md    feasibility study, data model, phased plan
```

## Open questions (not assumed)

From the brief, to answer in the app's Profiles screen or in conversation:

- Other cooking appliances; weekday cooking-time limit; batch-prep preference.
- Allergies, further dislikes, meal frequency, portion preferences, food budget.
- Asha: postpartum stage, breastfeeding pattern, height, clinician review. Prabha: exact fitness goal and protein target.
- Hosting and backend choice; GitHub repository; Alexa and WhatsApp test configuration.
- Exact Govee and Europa model numbers, for later integrations.

## Next steps

1. Decide hosting (a small always-on machine, or a hosting provider with a persistent disk). The app needs one process and one writable disk path.
2. Create the private GitHub repository and push this project.
3. Decide on conversational input (which LLM provider, if any) and on receipt/photo scanning.
4. Plan WhatsApp sharing once a Meta app, verified test recipients, and an approved template are in place.
