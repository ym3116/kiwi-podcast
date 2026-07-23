# Kiwi App Developer Guide

> How to build an **external app** and plug it into Kiwi.
>
> This guide is written against the actual code on the `kiwi-apps-development`
> branch. File references point at the source of truth so you can verify every
> claim. If the code changes, update this doc.

---

## 1. Overview

Kiwi is a learning platform. A **Kiwi App** is a *separate web application you
build and host yourself* that Kiwi embeds inside its UI and grants controlled
access to its data and AI.

Think of it like an app store:

- **Kiwi** = the platform (the site students and instructors use).
- **Your app** = a third‑party app that wants to appear inside it.
- **Admin** = the store reviewer + device admin.
- **You (developer)** = the app author.

Your app does **not** live inside Kiwi's codebase. It runs at its own URL (e.g.
`http://localhost:8000`). Kiwi embeds it in an **`<iframe>`** and the two talk
over **`window.postMessage`**. With a scoped token your app can additionally
call Kiwi's **REST API** and **MCP** server.

### Three kinds of "app" in this repo — don't confuse them

| Kind | What it is | This guide? |
| --- | --- | --- |
| **External app** | Independent web app, embedded via iframe, registered through the backend | ✅ **Yes** |
| **Built‑in app** | React code bundled inside `kiwi-ui` (`src/apps/builtins/*`), uses the in‑page `window.kiwiApp` bridge | See `kiwi-ui/KIWI-APPS.md` |
| **MCP client** | A service that talks to Kiwi purely over MCP/JSON‑RPC | See `docs/MCP_DEVELOPER_GUIDE.md` |

---

## 2. How it works

```
                         Kiwi UI (kiwi-ui, :3001)
  ┌──────────────────────────────────────────────────────────┐
  │  Class page ▸ "My App" tab                                │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │  <iframe src="https://your-app/?classId=..&..">     │  │
  │  │                                                     │  │
  │  │     YOUR APP  (you host this, e.g. :8000)           │  │
  │  │                                                     │  │
  │  │   ── postMessage ──▶  kiwi:ready / kiwi:askAI / ... │  │
  │  │   ◀── postMessage ──  kiwi:context / kiwi:appToken  │  │
  │  └────────────────────────────────────────────────────┘  │
  └───────────────┬──────────────────────────────────────────┘
                  │  (host proxies AI;  app uses token directly)
                  ▼
            Kiwi backend (kiwi, :3000)
        /api/kiwi-apps/*   /mcp   /chat/stream   /analytics/*
```

The render path in code:

- Route `:classID/app/:appSlug` → `kiwi-ui/src/pages/ClassAppPage.tsx`
- `ClassAppPage` looks up the enabled app + its `class-tab` UI, then renders
  `kiwi-ui/src/pages/ClassAppView.tsx`, which is the iframe host and the
  postMessage hub.

---

## 3. Quick Start

This repo's app entrypoint is `apps/web`. It is a Vite React frontend backed by
the stateless Nest API in `apps/api`, and it keeps a built-in Simulator mode so
the app is still explorable when it is not embedded in Kiwi.

Run it from the repo root:

```bash
npm install
npm run infra:up
npm run db:generate -w apps/api
npm run dev
```

Then open `http://localhost:8000`.

The podcast API persists generated podcast metadata, scripts, job status, and
audio asset records in PostgreSQL. MP3 bytes are stored in a private MinIO
bucket and streamed through the API. PostgreSQL and MinIO run in Docker while
the web and API run locally. Start infrastructure with:

The production pipeline first builds one reference-voice anchor per host, then
requests bounded multi-speaker WAV chunks from TTS. The API validates the WAV
responses, preserves chunk order, inserts a short gap only between chunks,
concatenates a WAV master, and encodes one 192 kbps MP3. Its unique OS temporary
workspace is always removed after generation; stale workspaces from interrupted
processes are removed on the next run.

```bash
npm run infra:up
npm run dev
```

Docker Compose exposes PostgreSQL on `localhost:5433`, MinIO on
`localhost:9010`, and its optional console on `localhost:9011`. The local API
and web iframe app run on `http://localhost:8010` and `http://localhost:8000`.

A Kiwi App is just a web page that does the handshake. The smallest possible
version of the pattern looks like this:

```html
<!doctype html>
<html>
  <body>
    <h1>Kiwi Podcast</h1>
    <pre id="ctx">waiting for context…</pre>

    <script>
      // 1) Tell Kiwi we are ready (parent origin unknown yet → "*")
      window.parent.postMessage({ type: 'kiwi:ready', payload: {} }, '*');

      // 2) Receive context and tokens from Kiwi
      window.addEventListener('message', (event) => {
        const { type, payload } = event.data || {};
        if (type === 'kiwi:context') {
          document.getElementById('ctx').textContent =
            JSON.stringify(payload, null, 2);
        }
      });
    </script>
  </body>
</html>
```

Host it anywhere reachable by the browser, register it (section 4), enable it in
a class (section 4.3), open the class — your page now appears as a tab and prints
the live class/user context.

> Tip: open the Vite app directly at `http://localhost:8000`. With no Kiwi
> embedding it, the page turns on a built-in Simulator that fakes Kiwi context,
> token, and podcast episodes so you can click through the app before standing up
> Kiwi.

---

## 4. Registration

Registration has a strict order. **An admin must whitelist your app before you
can register it.**

```
Admin: add to whitelist (approved) ──▶ You: POST /register ──▶ Admin/Instructor: enable in a class
```

### 4.1 Admin — whitelist the app

`POST /api/kiwi-apps/whitelist` (Admin only) — see
`src/kiwi-app/kiwi-app.controller.ts:67`.

```jsonc
{
  "slug": "kiwi-podcast",               // unique app id
  "registrationSecret": "dev-secret",   // stored bcrypt-hashed; you need the plaintext to register
  "baseUrl": "http://localhost:8000",   // optional, advisory
  "status": "approved",                 // MUST be "approved" before you can register
  "description": "Kiwi Podcast external app",
  "maxScopes": ["user:profile:read", "class:info:read", "class:enrollments:read", "class:materials:chunks:read"]
}
```

- `registrationSecret` is hashed with bcrypt before storage
  (`kiwi-app.service.ts:64`). The admin shares the **plaintext** with you out of band.
- `maxScopes` is the **ceiling** of permissions this app may ever request. See
  section 6 for which scope strings are actually enforced.

### 4.2 Developer — register your app

`POST /api/kiwi-apps/register` — **public endpoint** (no login), but it validates
the whitelist + secret. See `kiwi-app.controller.ts:119` and
`kiwi-app.service.ts:176`.

```jsonc
{
  "slug": "kiwi-podcast",
  "registrationSecret": "dev-secret",        // must match the whitelist entry
  "name": "kiwi-podcast",
  "description": "External Kiwi App for podcast learning workflows",
  "baseUrl": "http://localhost:8000",
  "appType": "frontend_only",                // or "full" (also exposes an MCP server)
  "capabilities": ["ai", "mcp"],             // "mcp" => Kiwi auto-sends an app token on ready
  "mcpServerUrl": "http://localhost:8000/mcp", // only for appType "full"
  "uis": [
    {
      "uiSlug": "student",
      "uiName": "kiwi-podcast",
      "uiUrl": "http://localhost:8000",
      "placement": "class-tab",              // class-tab | admin-panel | modal | dashboard-widget
      "allowedRoles": ["student", "ta", "instructor", "admin"],
      "tabOrder": 0
    }
  ],
  "prompts": [
    {
      "promptId": "hint",
      "name": "Coding Hint",
      "systemPrompt": "You are a tutor. Give a hint without revealing the answer.",
      "maxTokens": 500,
      "temperature": 0.7
    }
  ]
}
```

Notes:
- Re‑registering with the same `slug` **updates** the existing app (idempotent),
  so apps can self‑register on every startup (`kiwi-app.service.ts:200`).
- `prompts` you register are **inactive until an admin approves them**
  (`POST /api/kiwi-apps/:slug/prompts/:promptId/approve`). Until then the
  `llm:prompt:<id>` scope won't resolve.
- DTO definitions: `src/kiwi-app/dto/register-app.dto.ts`.

### 4.3 Admin/Instructor — enable the app in a class

`POST /api/classes/:classId/apps` — see `kiwi-app.controller.ts:350`.

```jsonc
{
  "appId": "<KiwiApp.id>",
  "tabLabel": "Podcast",
  "enabledScopes": ["user:profile:read", "class:info:read"]  // subset of maxScopes
}
```

> ⚠️ **Known gap:** the per‑class enable/disable/reorder handlers are not yet
> role‑guarded — see the `// TODO: Check if user is professor/admin` comments in
> `kiwi-app.controller.ts:360,374,388,400`. Treat these endpoints as
> "trusted caller only" until fixed.

Once enabled, the app shows up for that class via
`GET /api/classes/:classId/apps?placement=class-tab&userRole=student`
(`kiwi-app.service.ts:417`), filtered by `placement` and the viewer's role.

---

## 5. The Bridge Protocol (postMessage)

This is the heart of an external app and the single source of truth is
`kiwi-ui/src/pages/ClassAppView.tsx`. All messages are
`{ type: string, payload: object }`.

### Security model
- **Incoming (host → app):** the host posts to your iframe using **your app's
  origin** as `targetOrigin`. You should verify `event.origin` equals Kiwi's
  origin before trusting a message.
- **Outgoing (app → host):** the host only accepts messages whose
  `event.origin` matches your registered app URL (`ClassAppView.tsx:259`).
- The iframe is sandboxed:
  `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`
  (`ClassAppView.tsx:436`).

### Context params on the iframe URL
Kiwi appends these query params when loading your iframe (`ClassAppView.tsx:243`):
`?classId=<id>&appId=<id>&userId=<id>&uiSlug=<slug>`.

### App → Host

| `type` | `payload` | When / effect |
| --- | --- | --- |
| `kiwi:ready` | `{ preferredChatMode? }` | Send once on load. Triggers `kiwi:context`; if app has `mcp` capability, also triggers `kiwi:appToken`. `preferredChatMode` ∈ `modal \| sidepanel \| snap \| fullscreen`. |
| `kiwi:askAI` | `{ prompt, requestId }` | Ask Kiwi's AI. Host streams the answer back as `kiwi:aiChunk*` then `kiwi:aiComplete`. `requestId` correlates the stream. |
| `kiwi:updateContext` | `{ context }` | Set the text context that future `kiwi:askAI` calls (and the global chat) are grounded in. |
| `kiwi:requestToken` | _none_ | Explicitly (re)request an app token, e.g. after expiry. Works even without `mcp` capability (`ClassAppView.tsx:343`). |
| `kiwi:navigate` | `{ action?: 'back'\|'forward', path? }` | Ask Kiwi to navigate. `path` is restricted to the current class scope. |
| `kiwi:setChatDisplayMode` | `{ mode }` | Change Kiwi's chat panel layout. Same enum as `preferredChatMode`. |

### Host → App

| `type` | `payload` | Meaning |
| --- | --- | --- |
| `kiwi:context` | `{ classId, className, userId, username, userRole, appId, appSlug, uiSlug, capabilities }` | The runtime context. Sent in response to `kiwi:ready` (`ClassAppView.tsx:268`). |
| `kiwi:appToken` | `{ accessToken, scopes, expiresIn, appSlug }` | A scoped JWT (1h) to call Kiwi's API/MCP. See section 6. |
| `kiwi:aiChunk` | `{ requestId, chunk }` | A streaming token/segment of the AI answer. |
| `kiwi:aiComplete` | `{ requestId }` | The AI stream finished. |
| `kiwi:aiError` | `{ requestId, error }` | The AI request failed. |

> Unknown message types are ignored by the host (`ClassAppView.tsx:360`), so you
> may use your own `type` values for app‑internal messaging without collisions.

---

## 6. Permissions & Tokens

### Two locks
Accessing Kiwi data requires **both**:

1. **App scope** — your app token must carry the required scope. Scopes are
   computed as the **intersection** of whitelist `maxScopes` and the class's
   `enabledScopes`, plus active prompt scopes (`kiwi-app.service.ts:742`).
2. **User identity** — the token is issued **on behalf of the logged‑in user**
   (`payload.sub`). Many endpoints additionally check the *user's* role. Example:
   class analytics requires the user to be admin / class professor / assigned
   instructor (`src/mcp/resources/analytics.resource.ts`), regardless of scope.

So a student using your app cannot pull another student's data even if the app
has the scope — the user identity gate stops it.

### Getting a token
- If your app declared `capabilities: ["mcp"]`, Kiwi sends `kiwi:appToken`
  automatically right after `kiwi:ready` (`ClassAppView.tsx:308`).
- Otherwise (or after expiry) send `kiwi:requestToken`.
- Under the hood the host calls `POST /api/kiwi-apps/:slug/token` with the
  current `classId` (`kiwi-app.service.ts:800`). Token payload:
  `{ sub: userId, type: 'app_token', appSlug, classId, scopes }`, `expiresIn: 3600`.

### Using a token
Send it as `Authorization: Bearer <accessToken>` to Kiwi. The guard detects
`type === 'app_token'`, attaches `request.appContext = { appSlug, classId,
scopes, userId }`, and skips session checks (`src/auth/auth.guard.ts:609`).

### Which scopes are actually enforced today
`maxScopes` is a free‑form string array, but only these are currently checked via
`requireScope()` (`src/mcp/utils/scope-check.ts`, grep `requireScope`):

| Scope | Gates (resource URI) |
| --- | --- |
| `user:profile:read` | MCP resource `kiwi://users/{userId}` (`user.resource.ts:45`) |
| `class:info:read` | MCP resource `kiwi://users/{userId}/role/{classId}` (`user.resource.ts:130`) |
| `class:enrollments:read` | MCP resource `kiwi://users/{userId}/enrollments` (`user.resource.ts:205`) |
| `class:materials:chunks:read` | REST `GET /api/kiwi-apps/classes/:classId/document-chunks` |
| `context:student_learning:read` | REST `POST /api/kiwi-apps/:slug/contextual-chat` together with `llm:prompt:<promptId>` |
| `llm:prompt:<promptId>` | MCP tool `kiwi_app_chat` for an approved prompt (`kiwi-app-chat.tool.ts:87`) |

Kiwi Podcast additionally registers the free-form `podcast:manage` scope. Kiwi
includes it in the app token only when it is present in both whitelist
`maxScopes` and class `enabledScopes`; the external Podcast API then enforces it
alongside `class:info:read`, the verified app/class token claims, and Kiwi's
effective class role. It is an application-owned authorization scope, not a
built-in Kiwi MCP resource scope.

> Scope checks are shared by Kiwi's MCP tools and App REST API. Iframe apps use
> Streamable HTTP at `POST /mcp` for MCP operations and normal bearer-authenticated
> HTTP for App REST endpoints such as document chunks.

Wildcards are supported (`class:*` matches `class:info:read`) — see
`scope-check.ts:25`. Other endpoints (analytics, permissions) gate on **user
role**, not scope. See section 11 for the known scope‑naming inconsistency.

---

## 7. Capability Catalog (scope ↔ how to call it)

MCP entries below are called through Kiwi's Streamable HTTP MCP endpoint
(`POST /mcp`). The app must initialize an MCP session first, then send JSON-RPC
requests with the app token.

| You want… | Gate | How to call it |
| --- | --- | --- |
| Current user's role in a class | _(none; public)_ | REST `GET /api/permissions/class-role?userId&classId` |
| Current authenticated user (id/email/role) | app token | MCP `tools/call get_authenticated_user` |
| User's enrolled classes | app token | MCP `resources/read kiwi://classes` |
| Documents for a class | enrolled in class | MCP `resources/read kiwi://class/{classId}/documents` |
| Parsed text chunks for selected documents | `class:materials:chunks:read` | REST `GET /api/kiwi-apps/classes/{classId}/document-chunks?documentIds=<id,...>&limit=200` |
| Run an approved prompt over private learning context | `context:student_learning:read` + `llm:prompt:<id>` | REST `POST /api/kiwi-apps/{slug}/contextual-chat`; user/class come from the app token |
| Use Kiwi's AI (streaming) | _(none; host‑proxied)_ | bridge `kiwi:askAI` |
| Use Kiwi's AI (one shot, with token) | app token | MCP `tools/call chat { input }` |
| User profile | `user:profile:read` | MCP resource `kiwi://users/{userId}` |
| User's class role/info | `class:info:read` | MCP resource `kiwi://users/{userId}/role/{classId}` |
| User enrollments | `class:enrollments:read` | MCP resource `kiwi://users/{userId}/enrollments` |
| Class analytics / engagement | user is admin/prof/instructor | MCP resource `kiwi://analytics/class/{classId}` |
| Run an approved app prompt | `llm:prompt:<id>` | MCP tool `kiwi_app_chat` |
| Class roster / add users | role‑gated | MCP tools `get_class_roster`, `add_users_to_class` |
| Upload / fetch documents | role‑gated | MCP tools `upload_document`, `get_document_signed_url` |

> The REST analytics endpoints (`GET /analytics/all`, `POST /analytics/user`)
> are **session + admin‑only** (`AnalyticsAdminGuard` reads `request.session`), so
> an **app token cannot call them** — use the `kiwi://analytics/*` MCP resources
> on the full server instead, which gate on the user's role.

Full MCP tool/resource/prompt reference + JSON‑RPC examples:
`docs/MCP_DEVELOPER_GUIDE.md`.

---

## 8. Calling Kiwi

### 8.1 AI via the bridge (simplest — no token, no CORS)
```js
const requestId = crypto.randomUUID();
window.parent.postMessage({ type: 'kiwi:askAI', payload: { prompt, requestId } }, KIWI_ORIGIN);
// collect kiwi:aiChunk by requestId, finish on kiwi:aiComplete
```
The host proxies this to a Kiwi chat endpoint using the *user's* session, so your
app needs neither a token nor CORS for AI (`ClassAppView.tsx:106`).

> ⚠️ **Host‑wiring caveat (this branch).** `ClassAppView.tsx:129` currently posts
> to `${basePath}/chat/stream`, but the only matching route is the admin‑guarded
> `ChatController` (`src/common/chat/chat.controller.ts:39`, body `{ input, image }`),
> not the student agent (`POST /student/chat/v2`, body `UnifiedChatRequest`). So
> `kiwi:askAI` may 401/403 for non‑admins until the host proxy is pointed at the
> student endpoint. Your app code stays the same regardless — and you can always
> use the token‑based MCP `chat` tool (§8.3) as a fallback, which the reference
> app demonstrates.

### 8.2 REST with the app token
```js
const res = await fetch(`${KIWI_ORIGIN}/api/permissions/class-role?userId=${userId}&classId=${classId}`, {
  headers: { Authorization: `Bearer ${appToken}` },
});
```

Document chunks use document IDs, not material IDs. The request has no body:

```js
const params = new URLSearchParams({
  documentIds: ['doc-1', 'doc-2'].join(','),
  limit: '200',
});
const res = await fetch(
  `${KIWI_ORIGIN}/api/kiwi-apps/classes/${classId}/document-chunks?${params}`,
  { headers: { Authorization: `Bearer ${appToken}` } },
);
const page = await res.json();
// { classId, documents: [{ documentId, fileName, totalChunks, chunks }],
//   nextCursor, hasMore }
```

When `hasMore` is true, repeat the same filtered request with
`cursor=nextCursor`. Treat the cursor as opaque. Use IDs from the canonical
class documents resource rather than requesting the endpoint without a filter:
the backend currently tracks a known issue where all variants under a material
can include answer-key documents. Apps should keep raw chunks in memory only
and persist derived artifacts or compact source counts, not the chunk text.

### 8.3 MCP over Streamable HTTP

Iframe apps call Kiwi's MCP server at `POST /mcp`. This is the standard MCP
Streamable HTTP transport, so the app performs an `initialize` request first,
stores the returned `mcp-session-id` header when Kiwi provides one, sends
`notifications/initialized`, then sends normal MCP JSON-RPC requests.

```js
let nextId = 1;
let mcpSessionId = null;

async function mcpPost(message) {
  const res = await fetch(`${KIWI_ORIGIN}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2024-11-05',
      'Authorization': `Bearer ${appToken}`,
      ...(mcpSessionId ? { 'mcp-session-id': mcpSessionId } : {}),
    },
    body: JSON.stringify(message),
  });
  mcpSessionId = res.headers.get('mcp-session-id') || mcpSessionId;
  return res.json();
}

await mcpPost({
  jsonrpc: '2.0',
  id: nextId++,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'kiwi-podcast', version: '0.1.0' },
  },
});

await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

const tools = await mcpPost({
  jsonrpc: '2.0',
  id: nextId++,
  method: 'tools/list',
  params: {},
});
```

Useful calls after initialization:

```js
{ method: 'tools/list', params: {} }
{ method: 'resources/list', params: {} }
{ method: 'tools/call', params: { name: 'get_authenticated_user', arguments: {} } }
{ method: 'tools/call', params: { name: 'chat', arguments: { input: 'hello' } } }
{ method: 'resources/read', params: { uri: 'kiwi://classes' } }
```

The exact resources/tools available are controlled by the Kiwi backend MCP
server (`src/mcp/mcp.module.ts`, `src/mcp/resources/*`, `src/mcp/tools/*`) and
the app token's effective scopes.

### 8.4 Expose your own MCP server (appType `full`)
Register with `appType: "full"` and `mcpServerUrl`. Kiwi's agent can then call
*your* tools (reverse direction). Implement the MCP server in your app.

---

## 9. Lifecycle & Ops

| Action | Endpoint | Notes |
| --- | --- | --- |
| Heartbeat | `POST /api/kiwi-apps/:slug/heartbeat` (public) | Updates `lastSeenAt`. Call periodically. `kiwi-app.controller.ts:211` |
| Re‑register / update | `POST /api/kiwi-apps/register` | Idempotent by slug. |
| Report user action (audit) | `POST /api/kiwi-apps/:slug/audit/context-update` | Writes `KiwiAppAuditLog` for accountability. `kiwi-app.controller.ts:283` |
| Inspect scopes | `GET /api/kiwi-apps/:slug/scopes`, `GET /api/kiwi-apps/:slug/scopes/:classId` | Debug what your app can do. |

---

## 10. Local Dev & Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| REST/MCP call from the iframe blocked by CORS | Backend only allows `FRONTEND_URL` origins (`app.module.ts:84`). Default is just `http://localhost:3001`. | Add your app origins: `FRONTEND_URL="http://localhost:3001,http://localhost:8000,http://localhost:8010"` in `kiwi/.env`, restart backend. |
| `App "x" is not in the whitelist` / `not approved` | No whitelist row, or `status != approved`. | Admin adds/approves it (4.1). |
| `Invalid registration secret` | Plaintext ≠ stored bcrypt hash. | Use the exact secret the admin set. |
| App never appears as a tab | Not enabled for the class, or no `class-tab` UI matching the viewer's role. | Enable (4.3); check `placement`/`allowedRoles`. |
| `kiwi:context` never arrives | `event.origin` mismatch — your `uiUrl` origin ≠ where the iframe is actually served. | Register the exact origin you serve from. |
| `Missing required scope: …` | App token lacks the scope. | Add to `maxScopes` (whitelist) **and** `enabledScopes` (class). |
| AI works but data calls 401/403 | AI is proxied (user session); data calls need the **app token** + the user's role. | Request a token; ensure the user has rights. |
| Iframe blank / refused to connect | Your app server sends `X-Frame-Options: DENY` or restrictive CSP. | Allow framing from Kiwi's origin. |

---

## 11. Reference & Known Issues

### Source of truth
- Bridge & iframe host: `kiwi-ui/src/pages/ClassAppView.tsx`
- Route/lookup: `kiwi-ui/src/pages/ClassAppPage.tsx`
- Backend controller: `kiwi/src/kiwi-app/kiwi-app.controller.ts`
- Backend service: `kiwi/src/kiwi-app/kiwi-app.service.ts`
- DTOs: `kiwi/src/kiwi-app/dto/*`
- Data model: `kiwi/prisma/schema.prisma` (`KiwiApp*`, `ClassKiwiApp`, `WidgetState`, `KiwiAppAuditLog`)
- Scope enforcement: `kiwi/src/mcp/utils/scope-check.ts`
- MCP server: `kiwi/src/mcp/*`

### Known issues worth fixing (DX / security)
1. **No JS SDK for external apps** — every app hand‑rolls the postMessage
   handshake, token handling and AI streaming. A thin `@kiwi/app-sdk`
   (`kiwi.ready()`, `kiwi.onContext()`, `kiwi.askAI()`, `kiwi.getToken()`) would
   remove most boilerplate.
2. **Scope naming is inconsistent.** Enforced scopes use the colon form
   (`class:info:read`), but MCP resource *names* and many whitelist examples use
   hyphen form (`class-analytics`, `user-profile`). A developer cannot guess the
   right string. Standardize on one convention and publish a canonical list.
3. **Analytics gates on role, not scope** — so `maxScopes` for analytics is
   advisory only. Either enforce a scope (`class:analytics:read`) or document
   clearly that role is the gate.
4. **Per‑class app management is unguarded** — `// TODO` role checks in
   `ClassKiwiAppController` (enable/disable/update/reorder). Security gap.
5. **Secret distribution is manual/undocumented** — define how the registration
   secret reaches the developer.
6. **Older examples may mention obsolete MCP wrapper endpoints.** The current
   iframe-app path uses the Streamable HTTP MCP endpoint at `POST /mcp`, with an
   initialize/session flow and app-token authorization.
7. **AI bridge proxy target is mismatched.** `ClassAppView.tsx:129` posts
   `kiwi:askAI` to `/chat/stream` (admin‑guarded, `{ input, image }`) instead of
   the student agent (`POST /student/chat/v2`, `UnifiedChatRequest`). Point the
   host proxy at the student endpoint so `kiwi:askAI` works for non‑admins. See §8.1.
8. **Document chunk variants need tighter backend gating.** The App REST chunks
   endpoint can return multiple documents under one material, including answer
   keys. Until Kiwi issue #219 is resolved, external apps should first obtain
   canonical student-facing document IDs and always pass them through the
   `documentIds` filter.
