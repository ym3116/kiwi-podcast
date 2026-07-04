# Kiwi Podcast

Kiwi Podcast is an external Kiwi App for podcast-based learning workflows. Kiwi
embeds the app in an iframe, sends class/user context through
`window.postMessage`, and grants a scoped app token when the app is enabled with
the `mcp` capability.

This repo is an npm workspace monorepo for the actual podcast app, not a
hello-world example.

## Workspace

- `apps/web`: React/Vite iframe frontend.
- `apps/api`: NestJS REST API used by the frontend.
- `register.sh`: helper for whitelist, registration, and class-enable steps.
- `KIWI_APP_DEVELOPER_GUIDE.md`: detailed Kiwi App protocol notes.
- `AGENTS.md`: repo-level instructions for coding agents.

## Run Locally

From the repo root:

```bash
npm install
npm run dev
```

This starts:

- Web app: `http://localhost:8000`
- REST API: `http://localhost:8010`

When opened outside Kiwi, the app switches to Simulator mode and fakes Kiwi
context, token, and podcast episodes locally. This keeps frontend development
possible without running the Kiwi backend.

Useful single-workspace commands:

```bash
npm run dev:web
npm run dev:api
npm run build
npm run test
npm run lint
```

## Run Embedded In Kiwi

1. Start the podcast app:

```bash
npm run dev
```

2. Allow the app origins in the Kiwi backend CORS config, then restart Kiwi:

```text
FRONTEND_URL="http://localhost:3001,http://localhost:8000,http://localhost:8010"
```

3. Register the app:

```bash
SLUG=kiwi-podcast \
SECRET='<registration-secret>' \
APP_URL=http://localhost:8000 \
./register.sh
```

With an admin token and class id, the same script can also whitelist and enable
the app:

```bash
ADMIN_TOKEN='<admin-jwt>' \
CLASS_ID='<class-id>' \
SECRET='<registration-secret>' \
APP_URL=http://localhost:8000 \
./register.sh
```

The registration order is:

```text
admin whitelist -> public app register -> admin/instructor enable in class
```

Do not commit registration secrets, JWTs, or local `.env` files.

## Current Integration Surface

The app uses these Kiwi integration pieces:

| Area | Mechanism | Notes |
| --- | --- | --- |
| Embed handshake | `kiwi:ready` -> `kiwi:context` | Kiwi sends class/user/app context to the iframe. |
| Runtime token | `kiwi:appToken` / `kiwi:requestToken` | Token is scoped to the user, class, and app. |
| Context grounding | `kiwi:updateContext` | Sends app state to Kiwi for future AI grounding. |
| REST | `GET /api/podcast/classes/:classId` | Frontend calls the local podcast API with the app token. |
| MCP | Kiwi `POST /mcp` Streamable HTTP | The podcast API initializes an MCP session and reads class materials/documents. |

The first version returns placeholder scripts and no audio. Future podcast
generation can use the same backend path to read document embeddings, generate
scripts/audio, and add persistence.

## Development Rules

- Preserve Simulator mode while replacing placeholder content with live
  generation.
- Keep app-token calls scoped and role-aware.
- Use `POST /mcp` for MCP calls, not obsolete wrapper endpoints.
- Update `KIWI_APP_DEVELOPER_GUIDE.md` when protocol behavior changes.

## Useful Checks

```bash
bash -n register.sh
npm run build
npm run test
```
