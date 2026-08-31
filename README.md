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
removed after both successful and failed generation. Chunk durations are also
measured and apportioned back to the original speaker turns so generated class
and personal podcasts carry synchronized transcript timing.

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

4. Register the app and, optionally, enable its class tab:

```bash
ADMIN_TOKEN='<admin-jwt>' \
KIWI_COOKIE='connect.sid=s%3A...' \
SECRET='<registration-secret>' \
APP_URL=http://localhost:8000 \
./register.sh
```

Omit `CLASS_ID` when you only need the global admin panel. Add
`CLASS_ID='<class-id>'` to the same command when the class tab also needs to be
enabled.

This Kiwi build requires its browser-backed admin session as well as the JWT
for admin routes. Copy the `connect.sid` value from browser DevTools under
Application → Cookies → the Kiwi API origin and pass the full
`connect.sid=<value>` string as `KIWI_COOKIE`.

Registration order:

```text
admin whitelist -> public app register -> admin/instructor enable in class
```

Then open the class in Kiwi and use the `Podcast` tab, or open the system-wide
Podcast admin panel at:

```text
http://localhost:3001/admin/app/kiwi-podcast
```

If the local Kiwi host cannot mint a classless admin token, the panel asks for
an authorization class ID and opens Kiwi's existing class-context admin route:

```text
http://localhost:3001/admin/app/kiwi-podcast/class/<class-id>
```

The selected class supplies authentication only. The page still reads and
writes the singleton global settings record, so every class without an explicit
class or episode override inherits the saved voices. Podcast must be enabled in
the authorization class with `podcast:manage`.

Podcast Admin currently contains two internal pages:

- **Global Defaults** edits the inherited host and speaker voices.
- **All Classes** is a read-only overview with Podcast enablement, effective
  voice source, published episode count, and latest Podcast activity. It lists
  the classes returned by Kiwi's `kiwi://classes` resource for the authenticated
  admin identity, so a Kiwi deployment that restricts that resource may expose
  fewer classes than exist system-wide.

The overview is served by `GET /api/podcast/admin/classes`. Podcast checks each
class through Kiwi's existing app-scope inspection endpoint and combines that
state with local Podcast records; no Kiwi code or database changes are needed.

The registration contains two UIs under the same app slug: `student` uses the
`class-tab` placement, while `global-admin` uses `admin-panel` and loads
`http://localhost:8000/admin`. Re-running `register.sh` upserts both UIs.

The registration helper creates or updates `podcast:manage`,
`class:info:read`, and `class:materials:chunks:read` in both the whitelist and
class enablement. The embedded frontend probes the protected
management API after receiving `kiwi:context` and `kiwi:appToken`; the
**Manage** tab appears only when the API verifies a global admin or active class
professor/instructor. Students and TAs receive `403`, so the tab remains hidden.

The global admin panel prefers a classless Kiwi app token. The Podcast API also
accepts a class-scoped token as a compatibility fallback, but only when Kiwi
verifies the token subject as a **system admin**. Both paths require
`appSlug=kiwi-podcast` and `podcast:manage`; the accepted claim pairs are
`tokenScope=admin` with `classId=null`, or `tokenScope=class` with a non-empty
`classId`. Class tokens from older Kiwi builds that predate `tokenScope` are
also accepted when they have a non-empty `classId`; Kiwi verification, system
admin role, app slug, expiry, subject, and scope checks still apply. Professors
and instructors cannot use a class token to change global settings. Apply
database migrations before opening the panel:

```bash
npm run db:deploy -w apps/api
npm run db:generate -w apps/api
```

## Student Transcript And Ask Kiwi

Ready class and personal podcasts show a synchronized transcript in an embedded
scroll reader. The active turn follows playback until the student scrolls or
selects another turn; **Locate current line** restores follow mode. New renders
use their stored, chunk-measured timing, while older untimed podcasts receive a
word-weighted estimate bounded by the audio duration.

**Ask Kiwi** pauses playback and sends the selected turn, neighboring turns,
episode and class details, source-material names, and Podcast capability limits
to the global chat with `kiwi:updateContext`. The app then requests the
`sidepanel` chat layout with `kiwi:setChatDisplayMode`. It neither prefills nor
submits a student message. Standalone Simulator mode demonstrates the selection
flow without claiming that Kiwi Chat received the context.

## Access Control

The Podcast API treats the Kiwi app token, rather than browser-supplied IDs, as
the source of truth for identity and class access:

- Published **Class Podcast** episodes are shared with authenticated members of
  that class. Unpublished episode rows, draft titles, scripts, and preview audio
  are omitted from the class feed.
- **My Podcasts** rows and audio are filtered by the token's verified `sub`
  user ID and `classId`. Personal routes do not accept `ownerUserId`.
- **Manage** requires `class:info:read`, `podcast:manage`, and an effective Kiwi
  role of admin, professor, or instructor.
- **Global Defaults** requires `podcast:manage` and a Kiwi-verified system admin.
  A selected class may provide the token context, but does not narrow or relocate
  the global settings record.
- **All Classes** uses the same global-admin authorization. Its episode count
  includes published class episodes only, and its last-activity value is the
  newest local class-settings, published-episode, or generation-job update.
- Class and personal audio endpoints require the bearer token. The web app
  downloads protected MP3s with `fetch`, creates one temporary browser Blob URL,
  and revokes it when the track changes.

The API verifies real app tokens through Kiwi's authenticated
`get_authenticated_user` MCP tool, checks the token app/class/scopes, and
confirms the user's effective class role. Missing or invalid authentication
returns `401`; a valid token without class or scope access returns `403`; asking
for another user's personal podcast returns `404`.

Standalone Simulator mode keeps its exact demo token, but that token is limited
to `PODCAST_SIMULATOR_CLASS_ID`, `PODCAST_SIMULATOR_USER_ID`, local fixture
materials, and student-level scopes. It cannot read live class podcast,
generation-status, class-audio, or management endpoints.

## Class Podcast Management

The real-Kiwi **Manage** tab synchronizes eligible class-material documents from
Kiwi and maintains one regeneratable class podcast per real Kiwi document ID.
Professors can rename an episode, generate or manually edit a `host:` /
`speaker:` script, configure class voice defaults and episode overrides, render
an authenticated preview, and explicitly publish it. A new draft or preview
does not replace the version currently available to students.

Voice forms show preset selection only in Preset mode and description/seed only
in Custom Prompt mode. A custom seed makes a generated custom voice repeatable:
the same description and seed should produce a similar anchor, while changing
the seed explores another voice variation. All management previews share one
toggleable audio player, so starting one stops any other podcast or preview.
Published class runtimes are measured from the final rendered master audio and
displayed as `m:ss`; they are not estimated from a requested target length.

Kiwi supplies the class, user, role, token scopes, canonical document metadata,
and parsed document text. Automatic draft generation requests the selected
document in real time from
`GET /api/kiwi-apps/classes/:classId/document-chunks`, follows its opaque
cursor until complete, and uses only text plus optional page numbers. The
request is filtered to the canonical student-facing document ID and requires
`class:materials:chunks:read`; raw chunks and app tokens are never stored in the
Podcast database.

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

The `My Podcasts` tab provides a guided creator for a prompt, one to five live Kiwi
materials, a 5/10/15-minute target, and beginner/intermediate/advanced
difficulty. Generation runs as a staged background job and the UI polls its
persisted progress through script generation, TTS, and saving.

Creator materials come from Kiwi's canonical class-document resource and are
enriched with live chunk counts, page counts, and previews. Generation
re-fetches the selected documents, so a retry uses the newest text available in
Kiwi. Chunk requests are always filtered to canonical document IDs; this avoids
requesting unrelated variants such as answer-key documents.

After pulling this version, apply the database migrations:

```bash
npm run db:generate -w apps/api
npm run db:migrate -w apps/api
```

List the live creator catalog with a Kiwi app token:

```bash
curl -H "Authorization: Bearer $KIWI_APP_TOKEN" \
  http://localhost:8010/api/podcast/classes/demo-class/creator/materials
```

Check an episode's published/generation status:

```bash
curl -H "Authorization: Bearer $KIWI_APP_TOKEN" \
  http://localhost:8010/api/podcast/classes/1ef1daa0-6f00-4c52-b13f-fa85b65b3e31/episodes/49d054f2-2a9c-44f1-9a9f-43d67d77a01a/status
```

## Runtime Architecture

For local development, the React/Vite frontend and Nest API run through
`npm run dev`; the default Docker Compose file contains only PostgreSQL and
MinIO.

Production uses `compose.production.yml` for the complete stack. A custom Caddy
image terminates TLS for both assigned hostnames, serves the compiled frontend,
and proxies `/api/*` and `/health/*` to the private Nest container. PostgreSQL,
MinIO, and the API do not publish host ports. See
[`deploy/README.md`](deploy/README.md) for the production files, required
environment variables, and startup sequence.

When Nest starts, its storage service idempotently creates the private
`kiwi-podcasts` bucket. Audio is streamed through Nest; the browser never
receives MinIO credentials.

Chunk exports remain local and ignored at `apps/api/demo-chunks/*.json`, but
they are used only by standalone Simulator mode. The exact simulator token
selects that fixture source; all real Kiwi app tokens use the live REST
endpoint.

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
- On an API restart, in-process generation jobs are marked failed so users can
  retry instead of seeing a permanently stuck job.
- `apps/api/dist` and `apps/web/dist` are ignored, disposable build output.
- Standalone Simulator mode still works when opening `http://localhost:8000`
  outside Kiwi.
- Do not commit `.env`, JWTs, registration secrets, or API keys.
