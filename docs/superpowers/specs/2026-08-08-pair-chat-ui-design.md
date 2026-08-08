# 1:1 Chat — UI Parity with the Public Room — Design Spec

Date: 2026-08-08
Status: Approved (pending spec review)

Follows on from [2026-08-08-global-chat-ui-reactions-design.md](./2026-08-08-global-chat-ui-reactions-design.md),
which rebuilt the public room. This spec brings the same chat experience to the
1:1 video chat page and consolidates the two implementations into one.

## Goal

Give the 1:1 chat on the video call page the same look and behaviour as the
public room — bubbles, grouping, timestamps, delivery state, typing indicator,
emoji reactions, and correct scroll containment — **without** giving up the
anonymity that random pairing depends on.

## Non-Goals

- No identity in 1:1 chat. No names, no avatars, no `uid`.
- No AI moderation on 1:1 messages (word-list only — see Moderation).
- No message history for 1:1. Messages remain per-pairing and are discarded when
  the pairing ends, as they are today.
- No changes to matchmaking, WebRTC signalling, or the public room's behaviour.
- No renaming of the `gc-` CSS prefix.

## Findings that shaped this design

**`senderEmail` is already in the 1:1 payload.** [server.js:170](../../../backend/server.js#L170)
emits `senderEmail: userInfo?.email || "Anonymous"` on every 1:1 message. It
resolves to `"Anonymous"` today only because `authenticatedUsers` is never
populated: it is filled from `socket.userId`, which is set only inside
`socketAuthMiddleware`, which is commented out at
[server.js:95](../../../backend/server.js#L95) with the note "uncomment to
require auth". The moment that line is uncommented — which the comment says is
intended — every 1:1 message begins delivering the partner's real email address
to a stranger's browser. Since 1:1 is anonymous, the field is removed outright.

**`timestamp` is already in the payload** and is discarded by the frontend.
Timestamps therefore need no backend change.

**`VideoChat.jsx` is the last consumer of the colliding class names.** After the
public-room rebuild, `.messages-container`, `.message-form` and `.send-button`
are used by exactly one file. Migrating it lets those unscoped rules be deleted
from `videochat.css`, permanently closing the collision that caused the original
layout bug.

**Two `scrollIntoView` calls are still live** on this page —
[ChatRoom.jsx:20](../../../frontend/src/components/ChatRoom.jsx#L20) and
[VideoChat.jsx:276](../../../frontend/src/components/VideoChat.jsx#L276). Both
scroll every ancestor including the window.

## Identity model

1:1 chat shows no identity whatsoever. Alignment comes from
`message.sender === socket.id`, which is how it already works.

Socket ids are an acceptable identity key here, unlike in the public room: a
reconnect tears down the pairing (`partnerLeft`), so there is no case where a
stale socket id must still resolve to the right side of the conversation.

## Component consolidation

The public room's components are generalised rather than copied. Copying is what
produced the colliding stylesheets in the first place.

- `frontend/src/components/globalchat/` is renamed to
  `frontend/src/components/chat/`.
- `groupMessages(messages)` becomes `groupMessages(messages, keyOf)`, where
  `keyOf` extracts the grouping identity. The public room passes
  `(m) => m.uid`; the 1:1 chat passes `(m) => m.sender`. The function stays pure
  and framework-free.
- `GlobalChat.jsx` becomes `ChatPanel.jsx`, gaining two props:
  - `showIdentity` (default `true`) — when false, `MessageRow` renders neither
    the avatar slot nor the group name label.
  - `emptyText` — the placeholder for an empty conversation.
- `MessageRow` takes `showIdentity` and omits the avatar slot entirely when
  false, so bubbles sit flush rather than leaving a 32px gutter.

The `gc-` selector prefix is kept. Renaming ~30 selectors serves nothing and
risks reintroducing a collision.

Both pages then render the same `ChatPanel`, against one stylesheet, with one
scroll implementation.

## Socket contract

### Changed

`sendMessage` (c→s) accepts `{ text, clientId }`. A bare string is still
accepted via one destructuring line so a stale client cannot break mid-deploy.

`message` (s→c) payload becomes:

```js
{ id, clientId, sender, text, timestamp, reactions: {} }
```

`senderEmail` is removed. `id` is a `uuidv4`, needed so reactions can address a
message. `reactions` is emitted as `{}` purely so the shape matches what
`MessageRow` already expects; the server never updates it, and it is maintained
client-side thereafter (see Reactions).

### Added

| Dir | Event | Payload |
|-----|-------|---------|
| s→c | `pairMessageBlocked` | `{ clientId, reason }` |
| c→s | `pairReact` | `{ messageId, emoji }` |
| s→c | `pairReaction` | `{ messageId, emoji, from }` |
| c→s | `pairTyping` | `{ typing }` |
| s→c | `pairTyping` | `{ typing }` |

`pairTyping` relays to the partner only, not the sender.

All pair events are no-ops when the socket is not currently in a `chatPairs`
entry.

## Moderation

1:1 messages are currently unmoderated. They gain **Gate 1 only** — `wordListHit`
from `moderation.js`. It is local and synchronous, so it adds no latency to a
live back-and-forth. No Groq call is made on this path.

Blocked messages are written to `FlaggedMessage` with `socketId` = the sender's
socket id, `category` = `"wordlist"`, and `reason` = `"profanity"`. The model
gains no new fields.

The `email` field needs the sender's identity, which the 1:1 path does not
currently resolve — `authenticatedUsers` is always empty. An abuse log with no
identity is worthless, so the sender is resolved server-side using the same JWT
logic the public room uses. `resolveGlobalSender` therefore moves out of
`globalchat.js` into a shared `backend/socketIdentity.js` and is imported by
both, rather than being duplicated.

**This resolved email is used for the abuse log only and is never emitted to any
client.** That distinction is the whole point of removing `senderEmail` from the
payload, and the implementation must not undo it.

The sender receives `pairMessageBlocked { clientId, reason }` and the message is
not relayed to the partner.

This is a deliberate step down from the public room's two gates. Rationale:
Gate 2 costs up to 2s per message, which is unacceptable in a real-time
one-to-one conversation, and the word list catches the slurs and profanity that
make up most of what needs blocking.

## Reactions without server state

The server holds no per-pair message buffer. It relays only:

1. Client emits `pairReact { messageId, emoji }`.
2. Server rejects any emoji outside `ALLOWED_EMOJI`, applies a per-socket rate
   limit, and confirms the socket is in a pairing.
3. Server emits `pairReaction { messageId, emoji, from: socket.id }` to **both**
   sockets in the room.
4. Each client toggles `from` in its local set for that message.

Because both clients receive the identical event and apply the identical toggle
to identical state, they converge without a server-side source of truth. A
client's own reaction is the one where `from === socket.id`.

This avoids introducing a keyed map with a lifecycle — the failure mode that has
already produced two leaks in this codebase. Reaction state lives in the
frontend `messages` array and dies with the existing `setMessages([])` on
`next`, `partnerLeft`, and call end.

The per-socket reaction rate-limit map is cleaned on `disconnect`, alongside the
existing pair cleanup.

## Frontend state

`App.jsx`'s `messages` array changes from `{ text, type }` to the full server
object plus a client-side `status` and `reactions`:

```js
{ id, clientId, sender, text, timestamp, reactions, status? }
```

`type` is dropped; `isOwn` is computed at render from `sender`.

Delivery state mirrors the public room: an optimistic row with a `clientId` and
`status: "sending"`, swapped for the server's copy on echo (`"delivered"`), or
flipped to `"blocked"` with the reason attached when `pairMessageBlocked`
carries a matching `clientId`.

Unlike the public room, no history resync exists for 1:1, so the merge-on-resync
logic is not needed here.

## Removals

- `senderEmail` from the `message` payload in `server.js`.
- From `videochat.css`: `.messages-container`, `.message`, `.user-message`,
  `.partner-message`, `.message-form`, `.message-form textarea`,
  `.message-form textarea:focus`, `.send-button` and its `:hover`/`:active`
  states, and the `.message-form textarea` rule inside the 768px media query.
  These have no remaining consumers once `VideoChat.jsx` migrates.
- The chat markup in `VideoChat.jsx` (the `.text-chat-section` block), its
  `message` state, `handleSubmit`, and `messagesEndRef`.
- `messagesEndRef` and the `scrollIntoView` effect in `ChatRoom.jsx`.

`.text-chat-section` itself is retained as the layout wrapper but must be given
`min-height: 0` so `ChatPanel` can contain its own scroll — the same defect that
made the public room grow the page.

## Testing

Frontend (vitest):
- `groupMessages` gains tests for the `keyOf` extractor: grouping by `sender`,
  and the existing `uid` tests updated to pass the extractor explicitly.

Backend (`node:test`):
- A pair message containing a word-list hit is blocked and not relayed.
- A clean pair message is relayed with `id`, `clientId` and `timestamp`, and
  with no `senderEmail` field.
- `pairReact` with a non-whitelisted emoji is dropped.
- Pair events from a socket with no `chatPairs` entry are no-ops.

Layout (Playwright harness):
- The existing harness gains a 1:1 variant that floods the panel with 42
  messages and asserts the list scrolls, the page does not grow, and there is no
  horizontal overflow — the check that the public room initially failed.

Manual:
- Two browsers paired into a call. Send both ways; check bubbles, alignment,
  grouping, timestamps.
- Confirm no name or avatar appears anywhere in the 1:1 chat.
- Open devtools on the partner's browser and confirm no `senderEmail` field
  appears in any `message` payload.
- React from both sides; counts converge and own reactions are marked.
- Type on one side; the indicator appears on the other and clears.
- Send a word-list hit; the sender sees it blocked, the partner never receives
  it, and a `flaggedmessages` row appears.
- Send 40+ messages; the panel scrolls and the page does not grow.
- Click Next; messages and reactions reset for the new pairing.

## Decisions taken

- Anonymous 1:1 — no names, no avatars, no uid. Preserves what random pairing
  depends on.
- Generalise the shared components rather than duplicate them. Duplication is
  the original cause of the collision bug this project has been unwinding.
- Word-list moderation only on 1:1, no AI gate. Latency matters more than recall
  in a live conversation.
- Relay-only reactions with no server buffer. Avoids another keyed map with a
  lifecycle to leak.
- Keep the `gc-` CSS prefix through the rename.
- `pairTyping` relays to the partner only.
