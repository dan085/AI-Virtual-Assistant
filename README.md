# AI Virtual Assistant

Conversational AI assistant + Instagram publishing platform, built on Firebase
(Auth, Firestore, Cloud Functions) with an Angular 20 frontend. The agent is
powered by Google Gemini via [Genkit](https://firebase.google.com/docs/genkit),
and Instagram publishing uses the Meta Graph API.

## ⚠️ Security — read this first

This repo contains **no** secrets. Service account private keys, Gemini API
keys, and Instagram access tokens must never be committed.

- Firebase Admin SDK in Functions uses the runtime's default credentials — you
  do **not** need to ship a `serviceAccount.json`.
- API keys and tokens are stored using `firebase functions:secrets:set`.
- `.gitignore` blocks `*serviceAccount*.json`, `.env`, `*.pem`, `*.key`.

If you ever accidentally paste or commit a service account private key:
1. **Revoke it** in Google Cloud Console → IAM → Service Accounts → Keys.
2. Generate a new key.
3. Rewrite git history (e.g. `git filter-repo`) and force-push if it reached
   a remote.

## Architecture

```
┌──────────────────┐      ┌────────────────────┐      ┌──────────────────┐
│  Angular 20 SPA  │────▶│  Cloud Functions   │────▶│  Gemini (Genkit) │
│  (Firebase Host) │      │  - chatWithAgent   │      └──────────────────┘
│                  │      │  - publishToIG     │      ┌──────────────────┐
│  Firebase Auth   │      │                    │────▶│ Instagram Graph  │
│  Firestore SDK   │      └────────────────────┘      │      API         │
└──────────────────┘              │                   └──────────────────┘
         │                        ▼
         │                  ┌──────────┐
         └────────────────▶│Firestore │
                            └──────────┘
```

### Repo layout

```
.
├── web/                    # Angular 20 app (standalone components, signals)
│   └── src/app/
│       ├── core/           # Auth, API, guards
│       └── features/       # chat · instagram · dashboard · auth
├── functions/              # Firebase Cloud Functions (TypeScript)
│   └── src/
│       ├── agent/          # Genkit + Gemini agent
│       ├── instagram/      # Instagram Graph API client
│       └── lib/            # Shared (admin init, errors)
├── firebase.json           # Emulators, hosting rewrites, functions config
├── firestore.rules         # Per-user isolation
└── firestore.indexes.json
```

## Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project (Blaze plan required for Cloud Functions + outbound HTTP)
- Google AI Studio API key for Gemini
- A Facebook App with Instagram Graph API access and an Instagram Business
  account linked to a Facebook Page

## Setup

### 1. Clone and install

```bash
git clone <this-repo>
cd AI-Virtual-Assistant

# Frontend
cd web && npm install && cd ..

# Functions
cd functions && npm install && cd ..
```

### 2. Configure your Firebase project

Edit `.firebaserc` and set your project id:

```json
{ "projects": { "default": "your-firebase-project-id" } }
```

Create a **Web App** in the Firebase console and copy the config into
`web/src/environments/environment.ts` and `environment.prod.ts`.

### 3. Set Functions secrets (production)

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set INSTAGRAM_ACCESS_TOKEN
firebase functions:secrets:set INSTAGRAM_BUSINESS_ID
```

The Instagram access token must be a **long-lived Page token** for a Facebook
user that administers the Page connected to your Instagram Business account.

### 4. Enable Firebase services

In the Firebase console:
- Authentication → Sign-in method → enable **Google**
- Firestore → create database (production mode)
- Functions → upgrade to Blaze plan if needed

### 5. Run locally with emulators

```bash
# Terminal 1 — emulators
firebase emulators:start

# Terminal 2 — Angular dev server
cd web && npm start
```

Open http://localhost:4200. The dev environment connects to the Auth,
Firestore, and Functions emulators automatically (see
`web/src/app/app.config.ts`).

> **Note on secrets + emulators**: Firebase secrets are not available in the
> emulator. For local development, either stub the agent/IG calls or set
> environment variables via `functions/.env` (which is gitignored).

### 6. Deploy

The hosting target is wired with **predeploy** and **postdeploy** hooks in
`firebase.json`, so a single command builds Angular, deploys it, and then
smoke-tests the live URL:

```bash
# Deploys everything (functions + firestore + hosting)
firebase deploy

# Or just the frontend — predeploy will install deps and build Angular,
# postdeploy will verify the URL and hit /api/health.
firebase deploy --only hosting
```

What happens automatically during `firebase deploy --only hosting`:

1. **predeploy** → `npm ci` in `web/` then `npm run build -- --configuration=production`
2. Firebase uploads `web/dist/web/browser` and updates routing rules
3. **postdeploy** → `node scripts/postdeploy.js` runs and:
   - Resolves the hosting URL from `.firebaserc` / Firebase CLI
   - Sends `GET /` and `GET /api/health` as a smoke test
   - Optionally POSTs a Slack/Discord-compatible payload to
     `DEPLOY_WEBHOOK_URL` if that env var is set
   - Exits non-zero if the root URL is not reachable

Convenience npm scripts (root `package.json`):

```bash
npm run install:all        # install web + functions deps
npm run build              # build both
npm run deploy             # firebase deploy
npm run deploy:hosting     # predeploy builds, postdeploy verifies
npm run emulators          # firebase emulators:start
npm run postdeploy:verify  # run the smoke test manually
```

### 7. Continuous deployment (GitHub Actions)

`.github/workflows/firebase-deploy.yml` runs on every push and PR:

- **Every PR** → builds web + functions, lints, and deploys to a
  **preview channel** that expires in 7 days. The channel URL is posted
  back on the PR automatically.
- **Push to `main`** → builds, deploys Firestore rules + Functions, then
  deploys Hosting (which triggers the postdeploy smoke test).

Required GitHub repository secrets:

| Secret | What it is |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | JSON of a **new** service account with `Firebase Hosting Admin` + `Cloud Functions Developer` + `Firebase Rules Admin` roles. **Never reuse a key you pasted anywhere in plaintext.** |
| `FIREBASE_PROJECT_ID` | e.g. `your-firebase-project-id` |
| `GEMINI_API_KEY` | for Functions runtime |
| `INSTAGRAM_ACCESS_TOKEN` | long-lived IG Graph token |
| `INSTAGRAM_BUSINESS_ID` | IG Business account id |
| `DEPLOY_WEBHOOK_URL` | *(optional)* Slack/Discord webhook URL for post-deploy notifications |

## Features

### Chat agent (`chatWithAgent` callable)

- Gemini 1.5 Flash via Genkit
- Per-user conversation history stored in Firestore
  (`users/{uid}/conversations/{conversationId}/messages`)
- System prompt can be overridden per `agentId` via the `agents/{agentId}`
  collection (read-only to clients, Functions can write)

### Instagram publisher (`publishToInstagram` callable)

- Two-step Graph API flow: create media container → publish
- Writes to `users/{uid}/instagramPosts/{postId}`
- Image URL must be publicly reachable (Firebase Storage signed URLs work)

## Agents & Skills

The platform ships with a small registry of **agents** (personas) and
**skills** (tools the LLM can call). Agents only see the skills they've
been explicitly granted — a scheduling agent cannot publish Instagram
posts, for example.

### Built-in agents

All definitions live in `functions/src/agent/registry.ts` and are seeded
to Firestore so they can be edited at runtime:

| Agent id | Display name | Purpose | Skills |
| --- | --- | --- | --- |
| `default` | **Emma** | Everyday general-purpose assistant | time, IG draft, reminders, knowledge |
| `dr-pineapple` | **Dr. Pineapple** | Servicio técnico iOS (iPhone/iPad/Mac/Watch/AirPods). Diagnóstico, troubleshooting seguro, y estimación de visita al taller. | time, reminders, knowledge |
| `social-manager` | **Nina** | Instagram co-pilot — drafts captions + hashtags | time, IG draft, knowledge |
| `scheduler` | **Chronos** | Reminder management only | time, reminders |

### Built-in skills

| Skill id | What it does |
| --- | --- |
| `getCurrentTime` | Returns the current date/time in an IANA timezone. |
| `createInstagramDraft` | Saves an Instagram post as a **draft** in `users/{uid}/instagramPosts`. Cannot publish — a human click in the UI is always required. |
| `createReminder` | Writes a pending reminder to `users/{uid}/reminders`. |
| `searchKnowledgeBase` | Keyword-searches the user's personal `users/{uid}/knowledge` docs. Swap for vector search once you have volume. |
| `searchWeb` | Google Custom Search (requires `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` secrets). |

### Seeding agents to Firestore

After your first deploy, run the seed script once so the `agents`
collection is populated:

```bash
cd functions
npm run seed:agents            # against the real project
# or
npm run seed:agents:emulator   # against a local emulator
```

Re-running is safe (idempotent `set({merge: true})`).

### Creating a new agent

Edit `functions/src/agent/registry.ts`, add an entry to `BUILTIN_AGENTS`,
rebuild Functions, and re-run the seed script. The frontend agent picker
will pick it up automatically via the `listAvailableAgents` callable.

### Safety rails

- `createInstagramDraft` can never publish — `publishToInstagram` is a
  separate callable that only fires from the Instagram UI after an
  explicit user click.
- `Dr. Pineapple` is instructed to **never** ask for Apple ID, passwords,
  verification codes, or card numbers.
- Tools are scoped per user: the `ToolContext` carries the Firebase Auth
  `uid` so writes always land under `users/{uid}/…`.

## License

MIT (see LICENSE — add one if you plan to open-source).
