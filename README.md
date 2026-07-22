# Kiwi Podcast

Kiwi Podcast is an external Kiwi App. Kiwi embeds the React app in an iframe,
sends context through `window.postMessage`, and the app's Nest API stores
generated podcast metadata in PostgreSQL.

## Recommended Dev Setup

For local development, run PostgreSQL and private MinIO object storage in Docker,
then run the web/API locally with npm. PostgreSQL stores structured podcast data;
MinIO stores generated MP3 objects. The app services have one supported local
runtime and keep fast reloads and local `node_modules`.

### First-Time Setup

1. Start Docker Desktop.

2. Install npm dependencies:

```bash
npm install
```

Install FFmpeg if it is not already available. On macOS:

```bash
brew install ffmpeg
```

Podcast audio uses the TTS service's two-phase multi-speaker protocol. The API
builds one reference-voice anchor for each host, sends complete alternating
turns in bounded multi-speaker chunks, validates and concatenates the returned
WAV files, then encodes one 192 kbps MP3 for MinIO delivery. Temporary audio is
removed after both successful and failed generation.

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

5. Start infrastructure:

```bash
npm run infra:up
```

This exposes:

```text
PostgreSQL: localhost:5433
MinIO API:  localhost:9010
MinIO UI:   http://localhost:9011
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
npm run infra:up
npm run dev
```

Stop infrastructure without deleting data:

```bash
npm run infra:down
```

Health check:

```bash
curl http://localhost:8010/health
```

The health response includes MinIO bucket availability. `docker compose down -v`
is destructive: it deletes both PostgreSQL rows and all generated MP3 objects.

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
npm run infra:up
npm run dev
```

4. Register and enable the app:

```bash
ADMIN_TOKEN='<admin-jwt>' \
KIWI_COOKIE='connect.sid=s%3A...' \
CLASS_ID='<class-id>' \
SECRET='<registration-secret>' \
APP_URL=http://localhost:8000 \
./register.sh
```

This Kiwi build requires its browser-backed admin session as well as the JWT
for admin routes. Copy the `connect.sid` value from browser DevTools under
Application → Cookies → the Kiwi API origin and pass the full
`connect.sid=<value>` string as `KIWI_COOKIE`.

Registration order:

```text
admin whitelist -> public app register -> admin/instructor enable in class
```

Then open the class in Kiwi and use the `Podcast` tab.

The registration helper creates or updates `podcast:manage` and
`class:info:read` in both the whitelist and class enablement. The embedded frontend probes the protected
management API after receiving `kiwi:context` and `kiwi:appToken`; the
**Manage** tab appears only when the API verifies a global admin or active class
professor/instructor. Students and TAs receive `403`, so the tab remains hidden.

## Class Podcast Management

The real-Kiwi **Manage** tab synchronizes eligible class-material documents from
Kiwi and maintains one regeneratable class podcast per real Kiwi document ID.
Professors can rename an episode, generate or manually edit a `host:` /
`speaker:` script, configure class voice defaults and episode overrides, render
an authenticated preview, and explicitly publish it. A new draft or preview
does not replace the version currently available to students.

Kiwi supplies the class, user, role, token scopes, and canonical document
metadata. Until Kiwi exposes extracted document text to this app, automatic
draft generation reads only chunk text and optional page numbers from:

```text
apps/api/demo-chunks/<real-kiwi-document-id>.json
```

The file may declare `classId` and must identify the requested `documentId`.
Mismatched identifiers are rejected, and its document name/material type never
replace live Kiwi metadata. If no export exists, automatic draft generation
returns a clear error; manual script editing, rendering, and publishing remain
available.

Apply the management migration before opening the tab:

```bash
npm run db:generate -w apps/api
npm run db:migrate -w apps/api
```

Render jobs keep immutable script/voice snapshots and job-specific MinIO
objects. Only the explicit published-job pointer feeds the student script and
audio endpoints. Deleting a class podcast clears generated jobs, scripts,
audio, and publication state while retaining its source document, title, draft,
and voice configuration for regeneration.

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

After pulling this version, apply the database migrations:

```bash
npm run db:generate -w apps/api
npm run db:migrate -w apps/api
```

List the local creator catalog:

```bash
curl -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/demo-class/creator/materials
```

Check an episode's published/generation status:

```bash
curl -H "Authorization: Bearer local-dev-token" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/status
```

## Runtime Architecture

The React/Vite frontend and Nest API run only through `npm run dev`. Docker
Compose contains infrastructure only: PostgreSQL and MinIO. When Nest starts,
its storage service idempotently creates the private `kiwi-podcasts` bucket.
Audio is streamed through Nest; the browser never receives MinIO credentials.

Chunk exports remain local and ignored at
`apps/api/demo-chunks/*.json`. Place approved Kiwi chunk exports there before
starting the creator or generating a managed class draft. The personal creator
continues to discover its local material catalog independently.

## Checks

```bash
npm run build
npm run test
npm run lint
npm run clean
```

## Notes

- Generated podcast metadata, scripts, and jobs live in PostgreSQL.
- MP3 objects live in the private MinIO `kiwi-podcasts` bucket and persist in
  the Docker `minio-data` volume.
- Intermediate WAV files use a unique OS temporary directory and are deleted in
  a `finally` cleanup on success or failure. Generation also removes abandoned
  Kiwi audio workspaces older than six hours to recover from process crashes.
- `apps/api/dist` and `apps/web/dist` are ignored, disposable build output.
- Standalone Simulator mode still works when opening `http://localhost:8000`
  outside Kiwi.
- Do not commit `.env`, JWTs, registration secrets, or API keys.
