# AGENTS.md

## Project Overview

This repository contains the external Kiwi Podcast app. A Kiwi App is a
separately hosted web app that Kiwi embeds in an iframe. The app talks to Kiwi
through `window.postMessage` and, when granted a scoped app token, through
Kiwi's REST and MCP APIs.

This repo currently contains:

- `KIWI_APP_DEVELOPER_GUIDE.md`: the authoritative Kiwi App specification.
- `apps/web`: the React/Vite Kiwi Podcast iframe frontend with standalone Simulator mode.
- `apps/api`: the NestJS REST API that proxies Kiwi MCP data and returns podcast episodes.
- `register.sh`: a reproducible registration helper.

## Source Of Truth

- Read `KIWI_APP_DEVELOPER_GUIDE.md` before changing Kiwi App behavior.
- When this file and `KIWI_APP_DEVELOPER_GUIDE.md` disagree, the developer guide
  wins.
- Use `apps/web` and `apps/api` as the current Kiwi Podcast implementation.
- Keep documentation and examples aligned with the actual protocol described in
  the guide.

## Scope

These instructions are for external Kiwi Apps only.

Do not apply this workflow to:

- Built-in Kiwi apps bundled inside Kiwi's own frontend.
- Pure MCP clients that talk to Kiwi only over JSON-RPC.

If the user's request is about either of those, say that this repo is scoped to
external iframe-based Kiwi Apps and ask for the correct target context.

## Build And Run

The current app is an npm workspace monorepo.

```bash
npm install
npm run dev
```

Then open `http://localhost:8000`. The API runs on `http://localhost:8010`.

When the app is not embedded by Kiwi, it must switch to Simulator mode and fake
Kiwi replies locally.

## Kiwi App Implementation Rules

- Implement the bridge handshake first: post `kiwi:ready` on load, then render
  `kiwi:context` when it arrives.
- Preserve standalone Simulator mode. New examples should remain demoable
  without a Kiwi backend.
- Once Kiwi's origin is known, verify `event.origin` before trusting host
  messages.
- Use bridge AI first for simple AI features: send `kiwi:askAI`, accumulate
  `kiwi:aiChunk` events by `requestId`, and finish on `kiwi:aiComplete`.
- Use `kiwi:updateContext` when the app has useful state that should ground
  future bridge AI or global chat responses.
- For iframe apps that need MCP, use Kiwi's Streamable HTTP MCP endpoint
  `POST /mcp` with the app token and an MCP initialize/session flow.
- Send app tokens as `Authorization: Bearer <accessToken>`.
- Remember that app-token access is gated by both token scopes and the logged-in
  user's Kiwi role.
- Use enforced colon-form scopes such as `class:info:read`; avoid hyphen-form
  examples unless documenting platform naming inconsistencies.

## Registration Rules

Registration order is strict:

```text
admin whitelist -> app register -> admin/instructor enable in class
```

- Copy and adapt `register.sh` for new apps.
- `POST /api/kiwi-apps/register` is idempotent by slug, so startup
  self-registration is acceptable when the app has the registration secret.
- Requested scopes must stay within the whitelisted `maxScopes`.
- Class-enabled scopes must be a subset of the app's `maxScopes`.
- Register the exact origin the app is served from. Origin mismatches commonly
  cause missing `kiwi:context` messages.

## Known Platform Notes

- REST and MCP calls from an iframe require the app origin to be allowed by the
  Kiwi backend CORS configuration.
- Bridge AI (`kiwi:askAI`) does not need CORS because Kiwi proxies it through
  the host session.
- Some branches may have documented gaps around non-admin bridge AI or stale MCP
  endpoint examples. Treat the developer guide's known-issues section as
  authoritative before debugging those as app bugs.

## Verification Checklist

Before finishing a change:

- The app posts `kiwi:ready` on load.
- The app renders `kiwi:context` when received.
- Host messages are origin-checked when running embedded.
- Standalone Simulator mode still works.
- Registration remains reproducible through a `register.sh`-style script.
- REST/MCP calls use the intended MCP surface and token scopes.
- Relevant docs are updated when protocol behavior or run instructions change.

## Agent Guidance

- Keep this file concise and durable. Put detailed protocol explanations in
  `KIWI_APP_DEVELOPER_GUIDE.md`.
- Prefer editing existing examples over inventing a second reference pattern.
- Do not remove the Simulator path when adding live Kiwi features.
- Avoid committing secrets, JWTs, app registration secrets, or local `.env`
  files.
