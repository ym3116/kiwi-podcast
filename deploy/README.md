# Production deployment files

The production stack builds and runs the complete Kiwi Podcast application with
Docker Compose:

- `caddy`: Route53-backed TLS, reverse proxy, and the compiled React frontend.
- `api`: the Nest API with Node.js and FFmpeg.
- `migrate`: a one-shot Prisma migration target built from the API Dockerfile.
- `postgres`: podcast metadata and job state.
- `minio`: private generated-audio object storage.

Only Caddy publishes a host port. PostgreSQL, MinIO, and the API are reachable
only on the Compose network.

## Secret files

Never commit real environment files. On the EC2 server, create:

```text
/opt/kiwi-podcast/
├── app/                       repository source transferred with rsync
└── secrets/
    ├── compose.env            database/storage credentials and env-file paths
    ├── api.env                Kiwi, LLM, TTS, and API configuration
    └── caddy.env              Route53 certificate credentials
```

Create the directory and protect it before adding values:

```bash
sudo mkdir -p /opt/kiwi-podcast/app /opt/kiwi-podcast/secrets
sudo chown -R annie:annie /opt/kiwi-podcast
chmod 700 /opt/kiwi-podcast/secrets
```

Copy the three `*.env.example` files as starting points, remove placeholder
values, and set each resulting secret file to mode `600`.

Generate different URL-safe secrets for PostgreSQL and MinIO:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use hexadecimal values for `POSTGRES_PASSWORD`; this prevents punctuation from
breaking the generated `DATABASE_URL`.

### `compose.env`

This file is consumed by the Compose CLI before services start.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_DB` | PostgreSQL database name; keep `kiwi_podcast`. |
| `POSTGRES_USER` | PostgreSQL application user; keep `kiwi_podcast`. |
| `POSTGRES_PASSWORD` | A new random hexadecimal password. |
| `MINIO_ROOT_USER` | Private MinIO access key; use a non-public value. |
| `MINIO_ROOT_PASSWORD` | A different random hexadecimal secret. |
| `KIWI_PODCAST_API_ENV_FILE` | Set to `../secrets/api.env` on EC2. |
| `KIWI_PODCAST_CADDY_ENV_FILE` | Set to `../secrets/caddy.env` on EC2. |

### `api.env`

Compose supplies `DATABASE_URL`, the MinIO endpoint, and MinIO credentials
directly. `api.env` supplies application/provider configuration.

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Allowed browser origins. Keep both assigned HTTPS domains. |
| `KIWI_API_BASE` | Production Kiwi backend base URL supplied by the Kiwi operator. |
| `PODCAST_PUBLIC_API_BASE` | Keep `https://podcast.apps.kiwiai.org`. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | OpenAI-compatible script-generation provider. |
| `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL` | Text-to-speech provider. |
| `FFMPEG_PATH` | Keep `/usr/bin/ffmpeg`; FFmpeg is installed in the API image. |
| `MINIO_REGION`, `MINIO_BUCKET` | Keep the example values unless storage is deliberately migrated. |
| `PODCAST_*` and voice variables | Audio-generation tuning; begin with the tested example values. |

Do not guess `KIWI_API_BASE`, LLM credentials, or TTS credentials. Obtain them
over a secure channel from the operator.

### `caddy.env`

Copy the four values from the handed-over `.env.aws` file:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_HOSTED_ZONE_ID
```

These credentials are loaded only into Caddy and are not present in the
frontend or API images.

## Local validation

The checked-in examples are intentionally non-secret and can validate the
Compose structure:

```bash
docker compose \
  --env-file deploy/compose.env.example \
  -f compose.production.yml \
  config --quiet

docker compose \
  --env-file deploy/compose.env.example \
  -f compose.production.yml \
  build api caddy
```

Do not start this example configuration: provider values are placeholders.

## EC2 startup sequence

From `/opt/kiwi-podcast/app`:

```bash
docker compose \
  --env-file ../secrets/compose.env \
  -f compose.production.yml \
  config --quiet

docker compose \
  --env-file ../secrets/compose.env \
  -f compose.production.yml \
  build api caddy migrate

docker compose \
  --env-file ../secrets/compose.env \
  -f compose.production.yml \
  up -d postgres minio

docker compose \
  --env-file ../secrets/compose.env \
  -f compose.production.yml \
  run --rm migrate

docker compose \
  --env-file ../secrets/compose.env \
  -f compose.production.yml \
  up -d api caddy
```

Verify container state and readiness:

```bash
docker compose \
  --env-file ../secrets/compose.env \
  -f compose.production.yml \
  ps

curl -fsS https://podcast.apps-server.kiwiai.org/health/ready
curl -fsS https://podcast.apps.kiwiai.org/health/ready
```

The Caddy site block intentionally includes both domains. CloudFront connects
to the `apps-server` hostname while preserving the public viewer `Host` header.

