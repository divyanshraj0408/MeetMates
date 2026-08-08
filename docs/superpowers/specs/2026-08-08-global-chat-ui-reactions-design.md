# Global Chat — UI Rebuild + Reactions — Design Spec

Date: 2026-08-08
Status: Approved (pending spec review)

Follows on from [2026-07-08-global-chat-design.md](./2026-07-08-global-chat-design.md),
which shipped the working moderated room. This spec fixes that room's layout
defects and rebuilds its presentation.

## Goal

Three things, in this order:

1. Fix the layout bugs that make the StartPage unusable once ~12 messages exist —
   the chat box grows with its content instead of scrolling, and the window
   scrolls itself upward on every new message.
2. Rebuild the chat's appearance to match a bubble-and-avatar reference: grouped
   messages, initials avatars, per-message delivery state, timestamps.
3. Add emoji reactions.

## Non-Goals

- No shadcn/ui adoption. The reference look is rebuilt in plain CSS. (Considered
  and rejected: the project has 9 hand-written CSS files, all `.jsx`, and a
  Tailwind install that is currently inert — adopting shadcn here would split the
  styling system for one component.)
- No changes to moderation, to the 1:1 matchmaking flow, or to WebRTC.
- No message history in the database. The RAM buffer and its 50-message cap stay.
- No enabling of the commented-out socket `io.use` auth middleware.

## Part 1 — Root cause fixes

### B1. CSS leak from videochat.css

Vite bundles all CSS globally, so [videochat.css](../../../frontend/src/components/videochat.css)
applies on the StartPage regardless of route. It defines four unscoped selectors
that the global chat unintentionally inherits: `.messages-container` (line 206),
`.message-form` (293), `.message-form textarea` (300), and `.send-button` (317).

Evidence this is live: the "Shoot" button renders purple `#C2A8FF`, a color that
exists only in `videochat.css`.

**Fix:** every selector in the new global-chat stylesheet is prefixed `gc-`.
`videochat.css` is not modified — touching it risks the video chat page, which is
outside this scope.

### B2. Broken scroll containment

`.messages-container` in `videochat.css` sets `height: 100%`. The override at
[startpage.css:209](../../../frontend/src/components/startpage.css#L209) is more
specific but declares no `height`, and CSS properties cascade independently — so
`height: 100%` survives and fights the `flex: 1; min-height: 0` containment. The
list sizes to its content, growing its ancestors instead of scrolling.

**Fix:** dissolves with B1. The new `gc-` classes inherit nothing.

### B3. Window-scrolling autoscroll

[StartingPage.jsx:13](../../../frontend/src/components/StartingPage.jsx#L13) calls
`scrollIntoView({ behavior: "smooth" })`, which scrolls every scrollable ancestor
including the window.

**Fix:** write `el.scrollTop = el.scrollHeight` against the list container ref.
Guard it: only autoscroll when the user is already within ~80px of the bottom, so
scrolling back through history is not yanked downward by other people's messages.

### B4. Password-login JWT omits email

[auth.js:83](../../../backend/routes/auth.js#L83) signs `{ id: user._id }`.
[auth.js:150](../../../backend/routes/auth.js#L150) (Google) signs
`{ userId, email, isGoogleUser }`. `resolveGlobalSender` reads `decoded.email`, so
**global chat is currently broken for every email/password user** — each send is
rejected with "You must be logged in to chat."

**Fix, two parts:**
- Sign `{ id: user._id, email: user.email }` at auth.js:83.
- Make `resolveGlobalSender` async and tolerant: if the decoded token has no
  `email`, look the user up by `decoded.id || decoded.userId` and cache the result
  on `socket.userEmail`. Tokens already issued last 7 days and lack email, so the
  fallback is required, not defensive padding.

### B5. Chat hidden on mobile

`startpage.css` lines 184 and 204 set `display: none` below 768px, so the feature
does not exist on phones.

**Fix:** a Preview | Chat tab toggle inside the right box, below 768px only. The
`100vh` app-shell is kept; the active tab fills the remaining height. Desktop is
unchanged — video preview and chat stack, both visible.

## Part 2 — Stable opaque user id

Reactions need per-user identity. Two existing constraints conflict with the
obvious approach:

- The current broadcast deliberately omits `email` for privacy.
- Own-message alignment keys on `m.sender === socket.id`, which breaks on
  reconnect — your own history re-renders as someone else's.

One mechanism resolves both:

```js
const UID_SALT = crypto.randomBytes(16).toString("hex"); // regenerated per boot
const uidFor = (email) =>
  crypto.createHash("sha256").update(UID_SALT + email).digest("hex").slice(0, 12);
```

`uid` travels on the wire; email never does. It supplies reaction ownership,
reconnect-stable own-message alignment, message grouping, and the avatar hue.

The salt regenerating per boot is deliberate and consistent — the message buffer
is already lost on restart.

The client learns its own uid from a new `globalIdentity` event, emitted on
connect once the sender resolves. Sender resolution therefore moves to connection
time when a token is present; the existing lazy resolution inside the message
handler stays as the fallback path.

## Part 3 — Socket contract

Unchanged: `globalHistory`, `globalMessage`, `globalMessageBlocked`.

| Dir | Event | Payload |
|-----|-------|---------|
| s→c | `globalIdentity` | `{ uid }` |
| c→s | `globalReact` | `{ messageId, emoji }` |
| s→c | `globalReaction` | `{ messageId, reactions }` |
| c→s | `globalTyping` | `{ typing: boolean }` |
| s→c | `globalTypingUsers` | `{ names: string[] }` |

`reactions` is `{ "👍": ["uid1", "uid2"], "🔥": ["uid3"] }`.

`globalMessage` (c→s) becomes `{ text, clientId }`. A bare string is still
accepted via one destructuring line so a stale client cannot break mid-deploy.

Message payload (s→c) gains `uid` and `reactions`:

```js
{ id, clientId, uid, sender, name, text, timestamp, reactions }
```

`sender` (socket id) is retained for now but is no longer what alignment keys on.

### Reactions

Whitelist is exactly six: 👍 ❤️ 😂 😮 😢 🔥. Anything else is rejected server-side
and not broadcast. Because the set is closed, reactions need no moderation call
and cannot bloat a message with arbitrary keys.

Toggle semantics: reacting with an emoji you already used removes it. An emoji
whose uid list empties is deleted from the object.

Rate limit: ~300ms per socket, in a map separate from `lastGlobalMessageAt`, so
reacting does not consume your ability to send messages.

Reactions live on the message objects inside the 50-message RAM buffer. They are
lost on restart and when a message ages out of the buffer — the same lifetime the
messages themselves already have.

### Typing indicator

Client emits `globalTyping` at most once per 2s while the composer is non-empty,
and emits `{ typing: false }` on send or on clearing the field.

Server keeps `Map<uid, { name, expiresAt }>`, expiring entries 3s after their last
signal, and broadcasts `globalTypingUsers` at most once per second. The sender's
own name is excluded from the list it receives.

Display: "Divyansh is typing…", "Divyansh and Aditi are typing…", or
"Several people are typing…" at 3+.

## Part 4 — Delivery state

Rendered as real state, not a fixed label:

1. On submit the client generates a `clientId` and appends an optimistic row with
   `status: "sending"`.
2. The server echoes `clientId` in the broadcast. The client replaces the
   optimistic row with the server's copy — `status: "delivered"`.
3. `globalMessageBlocked` also carries `clientId`. That row flips to
   `status: "blocked"` in place, showing the moderation reason on the message
   itself.

This retires the free-floating red notice below the list. Rejections attach to the
message that caused them.

The optimistic row is the only case where a message renders before the server has
seen it; it is keyed by `clientId` and is never persisted.

## Part 5 — Presentation

Message grouping: consecutive messages from the same `uid` within 5 minutes form
one group. The name label renders once, above the group. The avatar renders once,
beside the group's **last** message, matching the reference. Earlier rows in a
group reserve the avatar's width so bubbles stay aligned.

Avatar: a circle with 1–2 initials derived from the display name, background hue
from `hash(uid) % 360` at fixed saturation and lightness, so a given person is
always the same color.

Bubbles: own messages right-aligned with an accent fill, others left-aligned on a
neutral fill, both with `word-break: break-word` and a max width of ~78%.

Reaction affordance: a six-emoji bar on bubble hover (desktop) or tap (mobile).
Applied reactions render as count chips below the bubble; chips containing your
own uid get an active border.

Timestamp: from the existing ISO `timestamp` field, which the current UI discards.
Shown on the last message of each group, formatted as local `h:mm AM/PM`.

## Part 6 — File structure

`StartingPage.jsx` is 129 lines and would roughly triple. The feature moves out:

```
frontend/src/components/globalchat/
  GlobalChat.jsx        list + composer + typing line
  MessageRow.jsx        avatar + bubble + reactions + footer
  ReactionBar.jsx       hover bar + count chips
  Avatar.jsx            initials circle, hue from uid
  groupMessages.js      pure: message[] -> group[]
  groupMessages.test.js
  globalchat.css        all styles, every selector .gc-*
backend/
  globalchat.js         buffer, reactions, typing, uid, rate limits
```

`server.js` is ~380 lines of matchmaking already. `backend/globalchat.js` exports
`registerGlobalChat(io, socket)` plus pure helpers, so the feature stops accreting
into it. `server.js` keeps only the require and the one registration call; the
existing inline `globalMessage` handler and its module-level state move into the
new file.

`StartingPage.jsx` keeps the tab-toggle state and renders `<GlobalChat />`.
`App.jsx` keeps the socket listeners and chat state, as it does today.

### Removals

These are deleted, not left alongside the new code:

- `startpage.css` lines 209–260 — the `.globalchat-container .messages-container`,
  `.global-empty`, `.global-msg*`, and `.global-block-notice` rules. Superseded by
  `globalchat.css`.
- `startpage.css` lines 163–168 — the `.globalchat-container` min-height patch and
  its comment, which existed only to fight the B2 cascade.
- `startpage.css` lines 184–186 and 204–206 — the two mobile `display: none` rules,
  replaced by the tab toggle.
- The chat markup in `StartingPage.jsx` lines 86–121, including its use of
  `.text-chat-section1`, `.messages-container`, `.message-form`, and `.send-button`
  — the four class names that collide with `videochat.css`. No new markup reuses
  them.

## Testing

Backend, extending the existing `node:test` suite:

- `uidFor` is stable within a boot and differs across emails.
- Reaction toggle adds, then removes, the same uid.
- A non-whitelisted emoji is rejected and not broadcast.
- Reaction rate limit drops a second react inside 300ms.
- History trim keeps the newest 50 and drops older reactions with them.
- Typing entries expire after 3s.

Frontend: add `vitest` as a devDependency (zero config on Vite) and test
`groupMessages.js` — same sender groups, a >5min gap splits a group, a different
sender splits a group, empty input returns an empty array.

Manual end-to-end:

- Two browsers, **one Google account and one password account** — the password
  account is the regression test for B4.
- Send 30+ messages: the list scrolls internally, the page does not grow, the
  window does not move.
- Scroll up mid-conversation, have the other browser send: the view holds
  position.
- React from both accounts: counts aggregate, own chip is marked, re-clicking
  removes it.
- Type in one browser: the indicator appears in the other and clears within 3s.
- Send a blocklisted word: that row flips to blocked, no broadcast, a row lands in
  the `flaggedmessages` collection.
- Narrow to <768px: the Preview | Chat toggle appears and both tabs fill the
  height without page scroll.
- Reload mid-session: history returns, own messages stay right-aligned.

## Decisions taken

- Plain CSS over shadcn — avoids splitting the styling system for one component.
- Initials avatars over Google `profilePicture` — identical treatment for both
  auth paths, no CDN failures, no payload growth.
- Opaque per-boot `uid` over broadcasting emails — privacy is preserved and
  reconnect-stable identity comes free.
- Closed six-emoji set over a picker — no new dependency, no moderation call, no
  unbounded keys.
- `vitest` added for one pure module — assumed acceptable, consistent with the
  backend `node:test` already in the repo. Trivially removable.
