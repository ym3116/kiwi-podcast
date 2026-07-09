# Kiwi Podcast

Kiwi Podcast is an external Kiwi App. Kiwi embeds the React app in an iframe,
sends context through `window.postMessage`, and the app's Nest API stores
generated podcast metadata in PostgreSQL with MP3 files in a Docker volume.

## Project Layout

- `apps/web`: React/Vite iframe frontend.
- `apps/api`: NestJS API, Prisma schema, and podcast generation code.
- `docker-compose.yml`: local Docker stack for web, API, and PostgreSQL.
- `register.sh`: helper for Kiwi whitelist/register/class-enable.
- `KIWI_APP_DEVELOPER_GUIDE.md`: Kiwi App protocol reference.

## First-Time Setup

1. Start Docker Desktop.

2. Pull base images:

```bash
docker pull postgres:16-alpine
docker pull node:20-bookworm-slim
```

3. Optional: create a root `.env` file for real podcast generation:

```text
LLM_BASE_URL=https://your-openai-compatible-provider.example
LLM_API_KEY=...
LLM_MODEL=...
TTS_API_KEY=...
```

Without these keys, the app can run and inspect existing data, but new
generation will fail and record a failed job.

4. Build and start everything:

```bash
docker compose up --build
```

This starts:

- Web: `http://localhost:8000`
- API: `http://localhost:8010`
- PostgreSQL: internal Docker service `postgres:5432`

## Daily Run

Start:

```bash
docker compose up
```

Stop but keep DB/audio data:

```bash
docker compose down
```

Delete Docker DB/audio data and start fresh:

```bash
docker compose down -v
```

Health check:

```bash
curl http://localhost:8010/health
```

## Prisma Studio

Open Prisma Studio against the Docker PostgreSQL database:

```bash
docker compose run --rm -p 5555:5555 api npx prisma studio --schema apps/api/prisma/schema.prisma --hostname 0.0.0.0 --port 5555
```

Then open:

```text
http://localhost:5555
```

Stop Prisma Studio with `Ctrl+C`.

## Run Embedded In Kiwi

1. Start this app:

```bash
docker compose up
```

2. In the Kiwi backend config, allow the app origins, then restart Kiwi:

```text
FRONTEND_URL="http://localhost:3001,http://localhost:8000,http://localhost:8010"
```

3. Register and enable the app:

```bash
ADMIN_TOKEN='<admin-jwt>' \
CLASS_ID='<class-id>' \
SECRET='<registration-secret>' \
APP_URL=http://localhost:8000 \
./register.sh
```

Registration order is:

```text
admin whitelist -> public app register -> admin/instructor enable in class
```

Then open the class in Kiwi and use the `Podcast` tab.

## Demo Podcast API

Check the migrated demo episode:

```bash
curl -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/status
```

Regenerate it from the mounted demo chunk source:

```bash
curl -X POST \
  -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/generate
```

## Checks

Run checks inside Docker:

```bash
docker compose run --rm api npm run build -w apps/api
docker compose run --rm api npm run test -w apps/api
docker compose run --rm api npm run lint -w apps/api
docker compose run --rm web npm run build -w apps/web
docker compose run --rm web npm run test -w apps/web
docker compose run --rm web npm run lint -w apps/web
```

## Notes

- Generated podcast metadata/scripts/jobs live in PostgreSQL.
- MP3 files live in the Docker volume `kiwi-podcast_podcast-audio`.
- PostgreSQL files live in the Docker volume `kiwi-podcast_postgres-data`.
- Local Simulator mode still works when opening `http://localhost:8000` outside
  Kiwi.
- Do not commit `.env`, JWTs, registration secrets, or API keys.
