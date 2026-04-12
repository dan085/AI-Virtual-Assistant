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

```bash
# Functions + Firestore rules
firebase deploy --only functions,firestore

# Frontend
cd web && npm run build && cd ..
firebase deploy --only hosting
```

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

## Customizing the agent

The default agent persona is defined in
`functions/src/agent/agent.ts`. To build a vertical agent (e.g. a medical
assistant like DrPineapple.cl), create a document in the `agents` collection:

```
agents/dr-pineapple
  displayName: "Dr. Pineapple"
  systemPrompt: "You are Dr. Pineapple, a friendly health information assistant…"
```

Then pass `agentId: 'dr-pineapple'` when calling `chatWithAgent` from the
frontend.

## License

MIT (see LICENSE — add one if you plan to open-source).
