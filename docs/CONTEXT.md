# Pingo — Project Context

Last updated: 2026-08-22

A single place to understand what Pingo is, how it is built, and — more
usefully — *why* it is built that way. The code says what; this says why, and
records the mistakes already paid for.

---

## What Pingo is

A random video chat app. Sign in with Google, get paired with a stranger on
camera, talk. Alongside the 1:1 call there is a public chat room shared by
everyone online.

It began as an ADGIPS-college-only platform gated by college email and ID-card
OCR. As of 2026-08-22 it is **open to everyone** and Google is the only way in.

### The identity model, which governs almost everything

Pingo is **unlinkable but descriptive**.

Two different things get called "anonymity", and Pingo sits differently on each:

- **Linkability** — can a stranger find you afterwards? Name, email, photo,
  social handle. **Fully protected. This is the guarantee.**
- **Disclosure** — what do they learn during the call? Age, gender, region,
  interests. Partly shared, deliberately.

It is a video call: the camera already reveals rough age, gender presentation
and often region. Protecting *disclosure* was always mostly theatre. Protecting
*unlinkability* is real, so that is what the code defends.

Practical consequence: **name, email, `googleId` and `profilePicture` must never
reach another user.** Several bugs in this repo's history have been exactly that
leak. Any new socket emit or API response carrying user data should be read
field by field before shipping.

---

## Stack and running it

**Backend** — Node/Express + Socket.IO + Mongoose (MongoDB Atlas). CommonJS,
double quotes, 2-space indent. Tests: `node:test`.

**Frontend** — React 19 + Vite, all `.jsx`, plain CSS, no TypeScript.
Tests: `vitest`.

```bash
cd backend  && npm start     # needs backend/.env
cd frontend && npm run dev
```

`backend/.env` (gitignored, never commit): `MONGODB_URI`, `JWT_SECRET`,
`GOOGLE_CLIENT_ID`, `GROQ_API_KEY`, `PORT`.
`frontend/.env`: `VITE_BACKEND_URL`, `VITE_GOOGLE_CLIENT_ID`.

```bash
cd backend  && npm test      # 84 tests
cd frontend && npm test      #  8 tests
cd frontend && npm run build
```

---

## Backend map

| File | Responsibility |
|------|----------------|
| `server.js` | Express + Socket.IO wiring, matchmaking queue, WebRTC signalling |
| `routes/auth.js` | `POST /api/auth/google-login` — the only auth route |
| `routes/profile.js` | `GET`/`PUT /api/profile`, public `GET /api/profile/options` |
| `googleIdentity.js` | Pure: Google ID-token payload → fields to persist |
| `socketIdentity.js` | Resolves a socket's user from its JWT; caches on the socket |
| `moderation.js` | Two-gate moderation: local word list, then Groq |
| `globalchat.js` | Public room: 50-message RAM buffer, reactions, typing |
| `pairchat.js` | 1:1 chat: validation, word-list gate, relayed reactions |
| `interests.js` | The 35-tag interest vocabulary (source of truth) |
| `contactHandles.js` | Pure: detects handles/phones/emails in a bio |
| `profileFields.js` | Pure: what a valid profile update is |
| `models/User.js` | User + embedded `profile` |
| `models/FlaggedMessage.js` | Log of blocked messages, for abuse monitoring |

Matchmaking is still a **plain FIFO array** — `waitingUsers.push(socket.id)`,
first two get paired. No criteria. That is the next thing to build.

## Frontend map

`App.jsx` is the root and owns **every** socket listener plus screen routing
(`home` · `login` · `onboarding` · `editProfile` · `start` · `waiting` · `chat`).

- `components/chat/` — `ChatPanel` and friends, shared by the public room and
  the 1:1 chat. All CSS `gc-` prefixed.
- `components/profile/` — form, onboarding, edit screen, in-call panel. All CSS
  `pf-` prefixed.
- `components/VideoChat.jsx` — WebRTC, the call UI, and the profile panel.

---

## Socket protocol

**Matchmaking / WebRTC:** `findChat` · `next` · `leaveChat` · `ready-to-connect`
· `webrtc-offer` · `webrtc-answer` · `ice-candidate` → `waiting` · `chatStart` ·
`partnerLeft` · `onlineUsers`

**Public room:** `globalMessage` · `globalReact` · `globalTyping` →
`globalHistory` · `globalIdentity` · `globalMessage` · `globalMessageBlocked` ·
`globalReaction` · `globalTypingUsers`

**1:1 chat:** `sendMessage` · `pairReact` · `pairTyping` → `message` ·
`pairMessageBlocked` · `pairReaction` · `pairTyping` · `partnerProfile`

The public room shows a first name. The 1:1 chat shows **no name at all** — only
the profile panel, which carries no identity.

---

## Decisions worth knowing

**Moderation is two gates and fails open.** Gate 1 is a local word list —
instant, no network, covers English, Hinglish and Devanagari. Gate 2 is Groq
(`openai/gpt-oss-safeguard-20b`) with a policy prompt, ~200ms. On any Groq
error the message is **allowed** and the error logged. Availability was chosen
over strictness.
The 1:1 chat runs **Gate 1 only** — Gate 2's latency is unacceptable mid
conversation.

**Reactions in 1:1 are relayed, not stored.** The server broadcasts
`pairReaction {messageId, emoji, from}` to both sockets; each client applies the
same toggle and they converge. No server state means nothing to leak or clean up.

**The public room uses an opaque per-boot `uid`** — a salted hash of the email.
It gives reaction ownership, reconnect-stable alignment and avatar colour
without putting an email on the wire.

**Age is a checkbox, not a date.** "I am 18 or over" at onboarding. No date of
birth is collected; the age *band* is a separate optional profile field. Age
claims are self-declared everywhere — this is the design where being lied to
does least harm, since everyone is expected to be an adult rather than safety
depending on segregating minors.

**Interests are a fixed 35-tag vocabulary**, duplicated in
`backend/interests.js` and `frontend/src/interests.js` with a parity test that
reads the frontend file from disk and fails on drift. Free text would make
matching guesswork.

---

## Landmines — mistakes already paid for

**Unscoped CSS class names.** `videochat.css` defined bare `.messages-container`,
`.message-form`, `.send-button`. Vite bundles all CSS globally, so they applied
on every page and silently broke the lobby chat for days. Every chat selector is
now `gc-`, every profile selector `pf-`. **Do not add an unprefixed component
selector.**

**Flex containment needs `min-height: 0` all the way up.** The chat grew the
page instead of scrolling because `.content` had `flex: 1` and the default
`min-height: auto`. Every `min-height: 0` below it was inert. When a scroll
container misbehaves, check the *ancestors*.

**Components must own their colours.** `.gc-root` never set `color`, so it
inherited — white in the lobby, black on the video page, giving black text on a
`#1e1e1e` surface at 1.1:1 contrast. A self-contained surface cannot rely on an
ancestor to stay legible.

**`||` versus `??` on booleans.** `withVideo: withVideo || true` is always true.
This shipped and silently forced video on for everyone who opted out.

**Fail-open hides outages.** Groq decommissioned `llama-guard-4-12b` and every
Gate 2 call returned 400 for an unknown period — indistinguishable from a clean
room. A 429 rate limit does the same. If AI moderation "works", verify it
actually ran.

**Identity leaks hide in convenience.** `senderEmail` sat in every 1:1 payload,
harmless only because an auth middleware was commented out. A second
`GET /api/profile` returned email and photo, unreachable only because of route
mount order. **Build emit payloads field by field; never spread a user document.**

**Emoji are CDN PNGs** from `em-content.zobj.net/source/apple/419/`, used as
inline `<img>` at ~20px. A wrong slug renders a broken image, which looks worse
than no emoji. Verify the URL returns 200 before shipping one.

**Google's button ignores CSS.** It renders in a cross-origin iframe. `width`
must be a pixel number (max 400) — `"100%"` is unparseable and collapses it. The
GSI script is `async defer`, so guard for `window.google` not existing yet.

---

## Design system

Palette actually in use — note the `:root` tokens in `App.css` are largely
vestigial, `--primary` and `--accent` appear almost nowhere:

yellow `#ffea00` (navbar) · blue `#0099ff` (borders, own bubbles, selected
chips) · pink `#ff5ca2` / `#ff3f80` (CTA, headings) · purple `#c2a8ff` ·
black `#0d0d0d` (borders) · darks `#1c1c1e` / `#2b2b2b` / `#3c3c3c`

Type: **RightGrostek** display (local `.otf`), **Rethink Sans** body.

Idiom: playful and sticker-like. Thick borders (3–5px), flat saturated fills,
generous radii, hard offset shadows, no gradients on components.

---

## State

**Shipped to `main`:** Google-only auth, open to everyone · public chat room with
reactions, typing, grouping, avatars, delivery state · 1:1 chat with the same UI,
anonymous · two-gate moderation incl. Hindi and Hinglish · mobile chat tabs.

**On `feat/user-profiles`, built but unmerged:** profile schema and API, the 35-tag
vocabulary, contact-handle detection, onboarding with the 18+ gate, edit screen,
in-call profile panel. 84 backend tests. **Its 22-item E2E checklist is unrun** —
there is no local MongoDB, so nothing has been exercised against a real database.

**Designed, not built:** nothing currently.

**Next, in order:** profile-based matching (replaces the FIFO queue; the trap is
cold start — strict criteria on a small user base means nobody ever matches, so
it needs a relaxation ladder), then a Groq-generated "Never Have I Ever"
icebreaker.

**Deferred, each named in a spec:** blocking and reporting · gender as a
matching filter · account and data deletion · a replacement abuse gate now that
the college domain is gone · "number of past relationships" as a profile field.

`docs/superpowers/specs/` holds the design docs, `docs/superpowers/plans/` the
implementation plans. Each spec records the decisions taken *and rejected*, which
is usually the part worth re-reading.

---

## Open risks

**No abuse gate.** The college domain was not just identity, it was scarcity —
abuse cost something because accounts were tied to enrolment. Google accounts are
free and unlimited. Moderation filters messages; it does nothing about someone
making a new account after every block.

**Nobody can be blocked or reported.** This becomes sharper with profiles, since
matched people now know more about each other.

**Age is self-declared.** One checkbox. Worth remembering before any feature that
would be harmful to show a minor.
