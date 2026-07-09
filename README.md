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

## Run With Docker

Docker is the recommended way to run the full app locally. It keeps PostgreSQL,
API dependencies, generated audio, and database files inside Docker-managed
images, containers, and volumes instead of installing PostgreSQL directly on
your Mac.

```bash
docker compose up --build
```

This exposes:

- Web app: `http://localhost:8000`
- REST API: `http://localhost:8010`
- PostgreSQL: internal Docker service `postgres:5432`

Docker uses named volumes for persistent generated data:

- `kiwi-podcast_postgres-data`: PostgreSQL database files.
- `kiwi-podcast_podcast-audio`: generated MP3 files.

The API reads local demo chunks from `apps/api/demo-chunks` as a read-only bind
mount. Those chunks are source input for generation; generated podcast metadata
and audio are stored in Docker volumes.

For real podcast generation, create a root `.env` file with your model
credentials. Docker Compose reads this file automatically and passes the values
to the API container:

```text
LLM_BASE_URL=https://your-openai-compatible-provider.example
LLM_API_KEY=...
LLM_MODEL=...
TTS_API_KEY=...
```

Do not commit `.env`; it is ignored by git.

Stop the stack without deleting generated data:

```bash
docker compose down
```

Delete the Docker database and generated audio when you want a clean slate:

```bash
docker compose down -v
```

Run checks inside Docker instead of using local `node_modules`:

```bash
docker compose run --rm api npm run build -w apps/api
docker compose run --rm api npm run test -w apps/api
docker compose run --rm api npm run lint -w apps/api
docker compose run --rm web npm run build -w apps/web
docker compose run --rm web npm run test -w apps/web
docker compose run --rm web npm run lint -w apps/web
```

The first run may take longer because Docker builds the images and installs npm
dependencies inside those images.

Open Prisma Studio against the Docker PostgreSQL database:

```bash
docker compose run --rm -p 5555:5555 api npx prisma studio --schema apps/api/prisma/schema.prisma --hostname 0.0.0.0 --port 5555
```

Then open `http://localhost:5555`. Stop Prisma Studio with `Ctrl+C` in the
terminal running that command.

## Regenerate A Demo Podcast

The local generated podcast artifacts have been migrated into the Docker
PostgreSQL and audio volumes. The old local generated folders are no longer
needed by Docker.

Keep the local demo chunk file for document
`49d054f2-2a9c-44f1-9a9f-43d67d77a01a`; it is mounted read-only into the API
container as generation input.

After `docker compose up --build` is running, generate that podcast episode with
the same API path the app uses:

```bash
curl -X POST \
  -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/generate
```

Then check status:

```bash
curl -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/status
```

If generation succeeds, the DB rows are in the Docker PostgreSQL volume and the
MP3 is in the Docker audio volume. If generation fails because `TTS_API_KEY` or
LLM settings are missing, the failed job is still stored in PostgreSQL.

## Optional Non-Docker Checks

You do not need local Node dependencies to run the Docker app. If you want fast
local TypeScript/tests outside Docker, use:

```bash
npm install
npm run db:generate -w apps/api
npm run build
npm run test
npm run lint
```

For non-Docker API development with a local PostgreSQL server, set
`DATABASE_URL` and `PODCAST_AUDIO_DIR` in `apps/api/.env`, then run:

```bash
npm run db:migrate -w apps/api
npm run dev
```

When opened outside Kiwi, the app switches to Simulator mode and fakes Kiwi
context, token, and podcast episodes locally. This keeps frontend development
possible without running the Kiwi backend.

Useful single-workspace commands:

```bash
npm run dev:web
npm run dev:api
npm run db:generate -w apps/api
npm run db:migrate -w apps/api
npm run db:studio -w apps/api
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
| Storage | PostgreSQL + audio volume | Generated metadata/scripts/jobs live in PostgreSQL; MP3 files live in `PODCAST_AUDIO_DIR`. |

The API returns placeholder scripts until an episode is generated. Generation
uses the backend path to read chunks, create scripts/audio, persist metadata in
PostgreSQL, and serve MP3 files from the configured audio directory.

## Development Rules

- Preserve Simulator mode while replacing placeholder content with live
  generation.
- Keep app-token calls scoped and role-aware.
- Use `POST /mcp` for MCP calls, not obsolete wrapper endpoints.
- Update `KIWI_APP_DEVELOPER_GUIDE.md` when protocol behavior changes.

## Useful Checks

```bash
bash -n register.sh
npm run db:generate -w apps/api
npm run build
npm run test
```
