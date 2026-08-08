# Global Chat — Design Spec

Date: 2026-07-08
Status: Approved (pending spec review)

## Goal

Turn the existing "Global Chat Coming soon..." placeholder on the StartPage
([frontend/src/components/StartingPage.jsx](../../../frontend/src/components/StartingPage.jsx))
into a working public chat room. All logged-in users share one live feed.
Primary requirement: the room must be **moderated** — abusive/profane messages
are blocked before broadcast.

## Non-Goals

- No private/DM within global chat.
- No full message history in DB (only flagged messages are persisted).
- No changes to existing 1:1 matchmaking or WebRTC flow.
- No enabling of the commented-out socket `io.use` auth middleware.

## Moderation (two-gate: filter + AI fallback)

Chosen approach: local word-list first, Groq AI second.

New file `backend/moderation.js`, exporting:

```
async function moderateMessage(text, { groqClient } = {}) -> { ok, reason, category }
```

- **Gate 1 — word-list:** message checked against a local bad-words array
  (normalized: lowercase, strip repeated chars/leetspeak best-effort). Match →
  `{ ok: false, reason: "profanity", category: "wordlist" }`. No network call.
- **Gate 2 — Groq AI:** messages that pass Gate 1 are sent to Groq
  (`meta-llama/llama-guard-4-12b`, OpenAI-compatible endpoint
  `https://api.groq.com/openai/v1/chat/completions`) via `axios`. Llama Guard
  returns `safe` or `unsafe\n<category-code>`. Unsafe →
  `{ ok: false, reason: "flagged: <category>", category }`.
- **Failure handling — fail-open:** Groq timeout (>2s) or error → allow the
  message (Gate 1 already ran), log the error server-side. Rationale: keep chat
  usable if Groq is down; the hard word-list still applies.
- `groqClient` is injectable so unit tests run without network.

Env: `GROQ_API_KEY` added to `backend/.env` and documented in README.

## Persistence — memory feed + log flagged only

- **Live feed:** in-memory array `globalMessages` in `server.js`, capped at the
  last 50 messages. Sent to each socket on connect. Lost on restart (acceptable).
- **Flagged log:** new model `backend/models/FlaggedMessage.js`:
  `{ email, text, reason, category, socketId, createdAt }`. Only blocked messages
  are written — an abuse record for monitoring. Clean messages are NOT persisted.

## Backend — server.js additions

- `globalMessages` array (RAM, last 50).
- **Sender identity (isolated auth):** inside the global-message handler,
  read `socket.handshake.auth.token`, `jwt.verify` once, cache result on
  `socket.userEmail`. No token → message rejected. This authenticates global
  chat without touching the commented-out `io.use` matchmaking auth, so
  matchmaking is unaffected.
- **Rate limit:** per-socket, ~1 message / 1500ms. Faster → dropped with a
  `globalMessageBlocked` notice ("Slow down").
- **Message flow:**
  1. identify sender (token) — reject if absent.
  2. rate-limit check.
  3. `moderateMessage(text)`.
  4. blocked → write `FlaggedMessage`, emit `globalMessageBlocked` to sender only
     (`{ reason }`); do NOT broadcast.
  5. clean → build `{ id, email, name, text, timestamp }`, push + trim to 50,
     `io.emit("globalMessage", msg)`.
- On `connection`: emit `globalHistory` (current `globalMessages`) to that socket.

Socket events (new):
- client → server: `globalMessage` (text)
- server → client: `globalHistory` (array), `globalMessage` (msg),
  `globalMessageBlocked` ({ reason })

## Frontend

### App.jsx (state lifted here — socket listeners already live here)

- State: `globalMessages` (array), `globalBlockNotice` (string|null).
- Listeners: `globalHistory` → set; `globalMessage` → append;
  `globalMessageBlocked` → set notice.
- Handler `handleSendGlobal(text)` → `socket.emit("globalMessage", text)`.
- Pass `globalMessages`, `onSendGlobal`, `blockNotice` to StartPage.

### StartingPage.jsx (wire existing box, lines 70–80)

- `messages-container`: map `globalMessages` → rows (sender name + text). Own
  messages (match `socket.id`) right-aligned/styled.
- Form: controlled `textarea`; enable `send-button` (currently
  `disabled="true"`). Submit → `onSendGlobal`, clear textarea. Enter-to-send.
- Blocked → red inline notice from `blockNotice`; textarea keeps its text.
- Sender display name = email prefix (before `@`).
- Rendered on both `start` and `waiting` screens (unchanged), visible on landing
  after login.
- No new frontend dependencies.

## Testing

- `moderation.js` unit tests (injected fake Groq client, no network):
  - bad word → blocked at Gate 1.
  - Gate 1 pass + mocked `unsafe` → blocked.
  - Gate 1 pass + mocked `safe` → ok.
  - Groq throws/timeout → fail-open (ok) + error logged.
- Rate-limit: 2nd rapid message rejected.
- Manual: two browsers — verify broadcast, history on join, a blocked word,
  fail-open when `GROQ_API_KEY` unset/invalid.
- Repo has no test runner yet; plan adds minimal `node:test` for `moderation.js`.

## Open decisions (defaults chosen)

- Fail-open on Groq error (vs fail-closed) — chosen for availability.
- Display name = email prefix (vs full email) — chosen for privacy.
