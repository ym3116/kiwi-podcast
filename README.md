# Kiwi Podcast

Kiwi Podcast is an external Kiwi App. Kiwi embeds the React app in an iframe,
sends context through `window.postMessage`, and the app's Nest API stores
generated podcast metadata in PostgreSQL.

## Recommended Dev Setup

For local development, run only PostgreSQL in Docker and run the web/API with
npm. This gives faster reloads and avoids Docker networking surprises.

### First-Time Setup

1. Start Docker Desktop.

2. Install npm dependencies:

```bash
npm install
```

3. Create `apps/api/.env`:

```bash
cp apps/api/.env.example apps/api/.env
```

4. Optional: add generation keys to `apps/api/.env`:

```text
LLM_BASE_URL=https://your-openai-compatible-provider.example
LLM_API_KEY=...
LLM_MODEL=...
TTS_API_KEY=...
```

5. Start PostgreSQL:

```bash
npm run db:up
```

This exposes PostgreSQL on:

```text
localhost:5433
```

6. Generate Prisma client and apply migrations:

```bash
npm run db:generate -w apps/api
npm run db:migrate -w apps/api
```

7. Start web and API locally:

```bash
npm run dev
```

Open:

- Web: `http://localhost:8000`
- API: `http://localhost:8010`

### Daily Run

```bash
npm run db:up
npm run dev
```

Stop PostgreSQL:

```bash
npm run db:down
```

Health check:

```bash
curl http://localhost:8010/health
```

## Prisma Studio

With PostgreSQL running:

```bash
npm run db:studio -w apps/api
```

Then open the URL printed by Prisma, usually:

```text
http://localhost:5555
```

## Run Embedded In Kiwi

1. Start Kiwi frontend/backend.

2. In the Kiwi backend config, allow the podcast app origins, then restart Kiwi:

```text
FRONTEND_URL="http://localhost:3001,http://localhost:8000,http://localhost:8010"
```

3. Start this app:

```bash
npm run db:up
npm run dev
```

4. Register and enable the app:

```bash
ADMIN_TOKEN='<admin-jwt>' \
CLASS_ID='<class-id>' \
SECRET='<registration-secret>' \
APP_URL=http://localhost:8000 \
./register.sh
```

Registration order:

```text
admin whitelist -> public app register -> admin/instructor enable in class
```

Then open the class in Kiwi and use the `Podcast` tab.

## Demo Podcast API

### Guided personal podcasts

The `My Podcasts` tab provides a guided creator for a prompt, one to five local
materials, a 5/10/15-minute target, and beginner/intermediate/advanced
difficulty. Generation runs as a staged background job and the UI polls its
persisted progress through script generation, TTS, and saving.

Creator materials are discovered from `apps/api/demo-chunks/*.json`. Each file
must contain `documentId`, `documentName`, and a non-empty `chunks` array. Adding
another exported Kiwi chunk JSON file automatically makes it selectable; the
creator does not read live Kiwi embeddings or material contents yet.

After pulling this version, apply the personal-podcast migration:

```bash
npm run db:generate -w apps/api
npm run db:migrate -w apps/api
```

List the local creator catalog:

```bash
curl -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/demo-class/creator/materials
```

Check the migrated demo episode:

```bash
curl -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/status
```

Regenerate it from the local demo chunk source:

```bash
curl -X POST \
  -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/generate
```

## Optional Full Docker Stack

You can still run web, API, and PostgreSQL all in Docker:

```bash
npm run docker:up
```

Stop it:

```bash
npm run docker:down
```

Use this for container smoke tests, not normal frontend/backend development.

## Checks

```bash
npm run build
npm run test
npm run lint
```

## Notes

- Generated podcast metadata/scripts/jobs live in PostgreSQL.
- MP3 files live in `PODCAST_AUDIO_DIR`.
- Standalone Simulator mode still works when opening `http://localhost:8000`
  outside Kiwi.
- Do not commit `.env`, JWTs, registration secrets, or API keys.
