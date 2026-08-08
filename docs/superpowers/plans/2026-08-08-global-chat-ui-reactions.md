# Global Chat UI Rebuild + Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the layout bugs that make the StartPage unusable past ~12 messages, rebuild the global chat as grouped avatar/bubble rows, and add emoji reactions.

**Architecture:** Global chat moves out of `server.js` into `backend/globalchat.js`, which owns the message buffer, an opaque per-boot user id (`uid`), reactions, and a typing registry. On the frontend the feature moves out of `StartingPage.jsx` into `frontend/src/components/globalchat/`, with all CSS selectors prefixed `gc-` so nothing collides with `videochat.css`. Message identity keys on `uid` rather than `socket.id`, which makes alignment, grouping, and reaction ownership survive reconnects.

**Tech Stack:** Node.js, Express, Socket.IO, Mongoose, `jsonwebtoken`, `crypto` (built-in), React 19 (Vite), plain CSS. Backend tests via `node:test`, frontend tests via `vitest`.

**Spec:** [../specs/2026-08-08-global-chat-ui-reactions-design.md](../specs/2026-08-08-global-chat-ui-reactions-design.md)

**Branch:** All work happens on `feat/global-chat-ui-reactions`, which was branched from `main` at commit `f35f983` (the baseline containing the working global chat). Each task commits to this branch. The branch is merged to `main` at the end, and **the user handles `main` themselves** — do not commit to, or push, `main`.

---

## File Structure

**Backend**
- Create `backend/globalchat.js` — pure helpers (`uidFor`, `isAllowedEmoji`, `toggleReaction`, `trimHistory`, `setTyping`, `activeTypingNames`) plus `registerGlobalChat(io, socket)`. Owns all global-chat module state.
- Create `backend/globalchat.test.js` — `node:test` unit tests for the pure helpers.
- Modify `backend/server.js` — delete the inline global-chat block, call `registerGlobalChat`.
- Modify `backend/routes/auth.js:83` — put `email` in the password-login JWT.

**Frontend**
- Create `frontend/src/components/globalchat/groupMessages.js` — pure grouping function.
- Create `frontend/src/components/globalchat/groupMessages.test.js` — vitest tests.
- Create `frontend/src/components/globalchat/Avatar.jsx` — initials circle, hue from uid.
- Create `frontend/src/components/globalchat/ReactionBar.jsx` — hover bar + count chips.
- Create `frontend/src/components/globalchat/MessageRow.jsx` — one message: bubble, avatar slot, footer.
- Create `frontend/src/components/globalchat/GlobalChat.jsx` — list, composer, typing line.
- Create `frontend/src/components/globalchat/globalchat.css` — every selector `gc-` prefixed.
- Modify `frontend/src/App.jsx` — uid state, new listeners, optimistic send.
- Modify `frontend/src/components/StartingPage.jsx` — remove old chat markup, add mobile tab toggle.
- Modify `frontend/src/components/startpage.css` — remove superseded rules, add tab styles.
- Modify `frontend/package.json` — add `vitest` + `test` script.

---

## Task 1: Backend pure helpers

**Files:**
- Create: `backend/globalchat.js`
- Create: `backend/globalchat.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/globalchat.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const {
  uidFor,
  isAllowedEmoji,
  toggleReaction,
  trimHistory,
  setTyping,
  activeTypingNames,
  ALLOWED_EMOJI,
} = require("./globalchat");

test("uidFor is stable within a boot and differs across emails", () => {
  const a1 = uidFor("a@x.com");
  const a2 = uidFor("a@x.com");
  const b = uidFor("b@x.com");
  assert.strictEqual(a1, a2);
  assert.notStrictEqual(a1, b);
  assert.strictEqual(a1.length, 12);
});

test("uidFor never contains the raw email", () => {
  assert.ok(!uidFor("secret@x.com").includes("secret"));
});

test("isAllowedEmoji accepts the whitelist and rejects everything else", () => {
  for (const e of ALLOWED_EMOJI) assert.strictEqual(isAllowedEmoji(e), true);
  assert.strictEqual(isAllowedEmoji("💩"), false);
  assert.strictEqual(isAllowedEmoji(""), false);
  assert.strictEqual(isAllowedEmoji(undefined), false);
});

test("toggleReaction adds a uid then removes it", () => {
  const once = toggleReaction({}, "👍", "u1");
  assert.deepStrictEqual(once, { "👍": ["u1"] });
  const twice = toggleReaction(once, "👍", "u1");
  assert.deepStrictEqual(twice, {});
});

test("toggleReaction keeps other reactors when one removes theirs", () => {
  let r = toggleReaction({}, "🔥", "u1");
  r = toggleReaction(r, "🔥", "u2");
  r = toggleReaction(r, "🔥", "u1");
  assert.deepStrictEqual(r, { "🔥": ["u2"] });
});

test("toggleReaction does not mutate its input", () => {
  const before = { "👍": ["u1"] };
  toggleReaction(before, "👍", "u2");
  assert.deepStrictEqual(before, { "👍": ["u1"] });
});

test("trimHistory keeps the newest N", () => {
  const msgs = Array.from({ length: 55 }, (_, i) => ({ id: i }));
  const trimmed = trimHistory(msgs, 50);
  assert.strictEqual(trimmed.length, 50);
  assert.strictEqual(trimmed[0].id, 5);
  assert.strictEqual(trimmed[49].id, 54);
});

test("trimHistory leaves short lists alone", () => {
  const msgs = [{ id: 1 }, { id: 2 }];
  assert.strictEqual(trimHistory(msgs, 50), msgs);
});

test("setTyping adds an entry and removing clears it", () => {
  const reg = new Map();
  setTyping(reg, "u1", "alice", true, 1000, 3000);
  assert.strictEqual(reg.size, 1);
  setTyping(reg, "u1", "alice", false, 1500, 3000);
  assert.strictEqual(reg.size, 0);
});

test("activeTypingNames drops expired entries and excludes the asker", () => {
  const reg = new Map();
  setTyping(reg, "u1", "alice", true, 1000, 3000); // expires at 4000
  setTyping(reg, "u2", "bob", true, 1000, 3000);
  setTyping(reg, "u3", "carol", true, 1000, 3000);

  assert.deepStrictEqual(activeTypingNames(reg, 2000, "u3"), ["alice", "bob"]);

  // At 5000 everything has expired and is pruned from the registry.
  assert.deepStrictEqual(activeTypingNames(reg, 5000, null), []);
  assert.strictEqual(reg.size, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './globalchat'`.

- [ ] **Step 3: Write the helpers**

Create `backend/globalchat.js`:

```js
// globalchat.js - shared public chat room: message buffer, reactions, typing.
const crypto = require("crypto");

// Closed reaction set. Because it is closed, reactions need no moderation call
// and a client cannot bloat a message with arbitrary keys.
const ALLOWED_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

// Opaque per-user id. Regenerated each boot along with the message buffer, so
// the salt's lifetime matches the data it protects. Emails never go on the wire.
const UID_SALT = crypto.randomBytes(16).toString("hex");

function uidFor(email) {
  return crypto
    .createHash("sha256")
    .update(UID_SALT + String(email))
    .digest("hex")
    .slice(0, 12);
}

function isAllowedEmoji(emoji) {
  return ALLOWED_EMOJI.includes(emoji);
}

// Returns a new reactions object; never mutates the one passed in.
function toggleReaction(reactions, emoji, uid) {
  const next = { ...reactions };
  const list = next[emoji] ? [...next[emoji]] : [];
  const at = list.indexOf(uid);
  if (at === -1) list.push(uid);
  else list.splice(at, 1);
  if (list.length === 0) delete next[emoji];
  else next[emoji] = list;
  return next;
}

function trimHistory(messages, limit) {
  return messages.length > limit ? messages.slice(-limit) : messages;
}

function setTyping(registry, uid, name, typing, now, ttlMs) {
  if (typing) registry.set(uid, { name, expiresAt: now + ttlMs });
  else registry.delete(uid);
  return registry;
}

// Prunes expired entries as a side effect, then returns the live names.
function activeTypingNames(registry, now, excludeUid) {
  const names = [];
  for (const [uid, entry] of registry) {
    if (entry.expiresAt <= now) {
      registry.delete(uid);
      continue;
    }
    if (uid === excludeUid) continue;
    names.push(entry.name);
  }
  return names;
}

module.exports = {
  ALLOWED_EMOJI,
  uidFor,
  isAllowedEmoji,
  toggleReaction,
  trimHistory,
  setTyping,
  activeTypingNames,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npm test`
Expected: PASS — 18 tests total (8 pre-existing from `moderation.test.js`, 10 new).

- [ ] **Step 5: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add backend/globalchat.js backend/globalchat.test.js
git commit -m "feat: add global chat pure helpers (uid, reactions, typing)"
```

---

## Task 2: Put email in the password-login JWT

**Files:**
- Modify: `backend/routes/auth.js:83`

This is the B4 fix from the spec. Password logins currently sign `{ id: user._id }` with no email, so `resolveGlobalSender` reads `decoded.email` as `undefined` and rejects every message from a non-Google user.

- [ ] **Step 1: Add email to the signed payload**

In `backend/routes/auth.js`, find this line inside the `POST /login` handler (line 83):

```js
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
```

Replace it with:

```js
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
```

- [ ] **Step 2: Verify the file still parses**

Run: `cd backend && node -e "require('./routes/auth.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add backend/routes/auth.js
git commit -m "fix: include email in password-login JWT"
```

Note for the user: this fixes tokens issued from now on. Tokens already in users' browsers last 7 days and still lack `email` — Task 3 adds the database fallback that covers them.

---

## Task 3: Move the chat into globalchat.js and add the new events

**Files:**
- Modify: `backend/globalchat.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Append the registration function to globalchat.js**

In `backend/globalchat.js`, add these requires at the top, directly below `const crypto = require("crypto");`:

```js
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { moderateMessage } = require("./moderation.js");
const FlaggedMessage = require("./models/FlaggedMessage.js");
const User = require("./models/User.js");
```

Then append this block to the file, immediately **above** the closing `module.exports = {` block:

```js
// ---------------------------------------------------------------------------
// Module state. All of it is in RAM and lost on restart, by design.
// ---------------------------------------------------------------------------

const GLOBAL_HISTORY_LIMIT = 50;
const GLOBAL_RATE_MS = 1500;
const REACT_RATE_MS = 300;
const TYPING_TTL_MS = 3000;
const TYPING_BROADCAST_MS = 1000;
const MAX_MESSAGE_LENGTH = 500;

let globalMessages = [];
const lastGlobalMessageAt = new Map(); // socketId -> timestamp
const lastReactAt = new Map();         // socketId -> timestamp
const typingRegistry = new Map();      // uid -> { name, expiresAt }
let lastTypingBroadcastAt = 0;

// Resolve the sender's email from the socket's JWT. Isolated from the
// commented-out matchmaking auth middleware so this cannot affect matchmaking.
// Caches on socket.userEmail so the verify/lookup happens once per socket.
async function resolveGlobalSender(socket) {
  if (socket.userEmail) return socket.userEmail;

  const raw =
    socket.handshake.auth?.token || socket.handshake.headers?.authorization;
  if (!raw) return null;
  const token = raw.startsWith("Bearer ") ? raw.substring(7) : raw;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }

  if (decoded.email) {
    socket.userEmail = decoded.email;
    return decoded.email;
  }

  // Password-login tokens issued before the auth.js fix carry only an id and
  // stay in circulation for 7 days. Look the email up once for those.
  const id = decoded.id || decoded.userId;
  if (!id) return null;
  try {
    const user = await User.findById(id).select("email");
    if (!user) return null;
    socket.userEmail = user.email;
    return user.email;
  } catch (err) {
    console.error("Failed to resolve chat sender from id:", err.message);
    return null;
  }
}

function displayNameFor(email) {
  return String(email).split("@")[0];
}

function broadcastTyping(io, now) {
  if (now - lastTypingBroadcastAt < TYPING_BROADCAST_MS) return;
  lastTypingBroadcastAt = now;
  // Each socket needs its own name excluded, so send per-socket.
  for (const [, s] of io.sockets.sockets) {
    const names = activeTypingNames(
      typingRegistry,
      now,
      s.userEmail ? uidFor(s.userEmail) : null
    );
    s.emit("globalTypingUsers", { names });
  }
}

function registerGlobalChat(io, socket) {
  // Send the current buffer to the newly connected socket.
  socket.emit("globalHistory", globalMessages);

  // Tell the socket its own opaque id, if it arrived with a usable token.
  resolveGlobalSender(socket).then((email) => {
    if (email) socket.emit("globalIdentity", { uid: uidFor(email) });
  });

  socket.on("globalMessage", async (raw) => {
    // Accept both the object form and a bare string, so a stale client
    // cannot break during deploy.
    const payload = typeof raw === "string" ? { text: raw } : raw || {};
    const clientId = payload.clientId || null;
    if (typeof payload.text !== "string") return;
    const message = payload.text.trim();
    if (!message) return;

    if (message.length > MAX_MESSAGE_LENGTH) {
      socket.emit("globalMessageBlocked", {
        clientId,
        reason: `Message too long (${MAX_MESSAGE_LENGTH} char max).`,
      });
      return;
    }

    const email = await resolveGlobalSender(socket);
    if (!email) {
      socket.emit("globalMessageBlocked", {
        clientId,
        reason: "You must be logged in to chat.",
      });
      return;
    }

    // Rate limit — stamp immediately so blocked/spam attempts are throttled too.
    const now = Date.now();
    const last = lastGlobalMessageAt.get(socket.id) || 0;
    if (now - last < GLOBAL_RATE_MS) {
      socket.emit("globalMessageBlocked", {
        clientId,
        reason: "Slow down a moment.",
      });
      return;
    }
    lastGlobalMessageAt.set(socket.id, now);

    const verdict = await moderateMessage(message);
    if (!verdict.ok) {
      try {
        await FlaggedMessage.create({
          email,
          text: message,
          reason: verdict.reason,
          category: verdict.category,
          socketId: socket.id,
        });
      } catch (err) {
        console.error("Failed to log flagged message:", err.message);
      }
      socket.emit("globalMessageBlocked", {
        clientId,
        reason: "Message blocked by moderation.",
      });
      return;
    }

    // Sending clears any typing state for this user.
    const uid = uidFor(email);
    setTyping(typingRegistry, uid, displayNameFor(email), false, now, TYPING_TTL_MS);

    const outgoing = {
      id: uuidv4(),
      clientId,
      uid,
      sender: socket.id,
      name: displayNameFor(email),
      text: message,
      timestamp: new Date().toISOString(),
      reactions: {},
    };

    globalMessages.push(outgoing);
    globalMessages = trimHistory(globalMessages, GLOBAL_HISTORY_LIMIT);

    io.emit("globalMessage", outgoing);
  });

  socket.on("globalReact", async ({ messageId, emoji } = {}) => {
    if (!isAllowedEmoji(emoji)) return;

    const email = await resolveGlobalSender(socket);
    if (!email) return;

    const now = Date.now();
    if (now - (lastReactAt.get(socket.id) || 0) < REACT_RATE_MS) return;
    lastReactAt.set(socket.id, now);

    const target = globalMessages.find((m) => m.id === messageId);
    if (!target) return;

    target.reactions = toggleReaction(target.reactions, emoji, uidFor(email));
    io.emit("globalReaction", {
      messageId,
      reactions: target.reactions,
    });
  });

  socket.on("globalTyping", async ({ typing } = {}) => {
    const email = await resolveGlobalSender(socket);
    if (!email) return;
    const now = Date.now();
    setTyping(
      typingRegistry,
      uidFor(email),
      displayNameFor(email),
      Boolean(typing),
      now,
      TYPING_TTL_MS
    );
    broadcastTyping(io, now);
  });

  socket.on("disconnect", () => {
    lastGlobalMessageAt.delete(socket.id);
    lastReactAt.delete(socket.id);
    if (socket.userEmail) typingRegistry.delete(uidFor(socket.userEmail));
  });
}
```

Then extend the exports block at the bottom of the file to include the new function:

```js
module.exports = {
  ALLOWED_EMOJI,
  uidFor,
  isAllowedEmoji,
  toggleReaction,
  trimHistory,
  setTyping,
  activeTypingNames,
  registerGlobalChat,
};
```

- [ ] **Step 2: Delete the inline global chat code from server.js**

In `backend/server.js`, delete these four blocks:

1. The two requires at lines 15–16:

```js
const { moderateMessage } = require("./moderation.js");
const FlaggedMessage = require("./models/FlaggedMessage.js");
```

2. The module-level state and `resolveGlobalSender`, lines 112–135 — everything from the comment `// Global chat: shared public room.` down to and including the closing brace of `resolveGlobalSender`.

3. The history emit inside the connection handler (line 167):

```js
  // Send current global chat history to the newly connected socket.
  socket.emit("globalHistory", globalMessages);
```

4. The entire `socket.on("globalMessage", async (text) => { ... });` handler, lines 203–261.

5. The line `lastGlobalMessageAt.delete(socket.id);` inside the `disconnect` handler (line 373).

- [ ] **Step 3: Wire in the new module**

In `backend/server.js`, add this require where the deleted ones were (after the `authMiddleware` require on line 14):

```js
const { registerGlobalChat } = require("./globalchat.js");
```

Then, inside `io.on("connection", (socket) => {`, directly after the existing line `io.emit("onlineUsers", getOnlineCount());`, add:

```js
  registerGlobalChat(io, socket);
```

- [ ] **Step 4: Verify the server boots**

Run: `cd backend && node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port ...` then `booted`. A MongoDB connection error in the output is fine — this only asserts the module graph loads.

- [ ] **Step 5: Verify no stale references remain**

Run: `cd backend && grep -n "moderateMessage\|FlaggedMessage\|globalMessages\|lastGlobalMessageAt\|resolveGlobalSender" server.js`
Expected: no output. Every one of those now lives in `globalchat.js`.

- [ ] **Step 6: Run the backend tests**

Run: `cd backend && npm test`
Expected: PASS — all 18 tests still pass.

- [ ] **Step 7: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add backend/globalchat.js backend/server.js
git commit -m "refactor: move global chat into globalchat.js, add reactions and typing"
```

---

## Task 4: Frontend test runner and the grouping function

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/components/globalchat/groupMessages.js`
- Create: `frontend/src/components/globalchat/groupMessages.test.js`

- [ ] **Step 1: Add vitest**

Run: `cd frontend && npm install -D vitest`

Then in `frontend/package.json`, add a `test` script so the `scripts` block reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/components/globalchat/groupMessages.test.js`:

```js
import { describe, it, expect } from "vitest";
import { groupMessages } from "./groupMessages";

// Helper: build a message at a given minute offset from a fixed base.
const BASE = new Date("2026-08-08T12:00:00.000Z").getTime();
const msg = (id, uid, minutes) => ({
  id,
  uid,
  name: uid,
  text: `msg ${id}`,
  timestamp: new Date(BASE + minutes * 60000).toISOString(),
  reactions: {},
});

describe("groupMessages", () => {
  it("returns an empty array for no messages", () => {
    expect(groupMessages([])).toEqual([]);
    expect(groupMessages(undefined)).toEqual([]);
  });

  it("groups consecutive messages from the same uid", () => {
    const groups = groupMessages([
      msg("a", "u1", 0),
      msg("b", "u1", 1),
      msg("c", "u1", 2),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("starts a new group when the sender changes", () => {
    const groups = groupMessages([
      msg("a", "u1", 0),
      msg("b", "u2", 1),
      msg("c", "u1", 2),
    ]);
    expect(groups.map((g) => g.uid)).toEqual(["u1", "u2", "u1"]);
  });

  it("starts a new group after a gap longer than 5 minutes", () => {
    const groups = groupMessages([
      msg("a", "u1", 0),
      msg("b", "u1", 4),
      msg("c", "u1", 10),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b"]);
    expect(groups[1].messages.map((m) => m.id)).toEqual(["c"]);
  });

  it("gives each group a stable key from its first message", () => {
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u2", 1)]);
    expect(groups[0].key).toBe("a");
    expect(groups[1].key).toBe("b");
  });

  it("tolerates a message with no timestamp", () => {
    const broken = { id: "x", uid: "u1", name: "u1", text: "hi", reactions: {} };
    expect(() => groupMessages([broken])).not.toThrow();
    expect(groupMessages([broken])).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./groupMessages`.

- [ ] **Step 4: Write the implementation**

Create `frontend/src/components/globalchat/groupMessages.js`:

```js
// Consecutive messages from one sender inside this window render as one group:
// a single name label and a single avatar, matching common chat UIs.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function timeOf(message) {
  const t = new Date(message.timestamp).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function groupMessages(messages) {
  if (!Array.isArray(messages)) return [];

  const groups = [];
  for (const message of messages) {
    const at = timeOf(message);
    const last = groups[groups.length - 1];

    if (last && last.uid === message.uid && at - last.lastAt <= GROUP_WINDOW_MS) {
      last.messages.push(message);
      last.lastAt = at;
    } else {
      groups.push({
        key: message.id,
        uid: message.uid,
        name: message.name,
        messages: [message],
        lastAt: at,
      });
    }
  }
  return groups;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/globalchat/groupMessages.js frontend/src/components/globalchat/groupMessages.test.js
git commit -m "test: add vitest and message grouping"
```

---

## Task 5: Avatar and ReactionBar components

**Files:**
- Create: `frontend/src/components/globalchat/Avatar.jsx`
- Create: `frontend/src/components/globalchat/ReactionBar.jsx`

- [ ] **Step 1: Write the Avatar component**

Create `frontend/src/components/globalchat/Avatar.jsx`:

```jsx
// Initials circle. The hue is derived from the opaque uid, so a given person is
// always the same color without the client ever seeing their email.
function hueFromUid(uid) {
  let hash = 0;
  const source = String(uid || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) % 360;
  }
  return hash;
}

function initialsFrom(name) {
  const parts = String(name || "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Avatar({ uid, name }) {
  const hue = hueFromUid(uid);
  return (
    <div
      className="gc-avatar"
      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
      title={name}
      aria-hidden="true"
    >
      {initialsFrom(name)}
    </div>
  );
}

export default Avatar;
export { hueFromUid, initialsFrom };
```

- [ ] **Step 2: Write the ReactionBar component**

Create `frontend/src/components/globalchat/ReactionBar.jsx`:

```jsx
// Must stay identical to ALLOWED_EMOJI in backend/globalchat.js — the server
// silently drops anything outside its own whitelist.
export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

// The picker bar, revealed on hover (desktop) or tap (mobile).
export function ReactionPicker({ onReact }) {
  return (
    <div className="gc-react-bar">
      {REACTION_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="gc-react-btn"
          aria-label={`React with ${emoji}`}
          onClick={() => onReact(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// The applied-reaction count chips shown under a bubble.
export function ReactionChips({ reactions, myUid, onReact }) {
  const entries = Object.entries(reactions || {}).filter(
    ([, uids]) => uids.length > 0
  );
  if (entries.length === 0) return null;

  return (
    <div className="gc-chips">
      {entries.map(([emoji, uids]) => (
        <button
          key={emoji}
          type="button"
          className={`gc-chip ${uids.includes(myUid) ? "gc-chip-mine" : ""}`}
          aria-label={`${uids.length} reacted with ${emoji}`}
          onClick={() => onReact(emoji)}
        >
          <span>{emoji}</span>
          <span className="gc-chip-count">{uids.length}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: Vite build completes. (Neither component is imported yet, so this only checks they parse.)

- [ ] **Step 4: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add frontend/src/components/globalchat/Avatar.jsx frontend/src/components/globalchat/ReactionBar.jsx
git commit -m "feat: add chat avatar and reaction components"
```

---

## Task 6: MessageRow component

**Files:**
- Create: `frontend/src/components/globalchat/MessageRow.jsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/globalchat/MessageRow.jsx`:

```jsx
import { useState } from "react";
import Avatar from "./Avatar";
import { ReactionPicker, ReactionChips } from "./ReactionBar";

function formatTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// One message. `isLast` marks the final message of a group — that row carries
// the avatar and the timestamp; earlier rows reserve the avatar's width so the
// bubbles stay aligned.
function MessageRow({ message, isOwn, isLast, myUid, onReact }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const status = message.status;

  return (
    <div
      className={`gc-row ${isOwn ? "gc-row-own" : ""}`}
      onMouseEnter={() => setPickerOpen(true)}
      onMouseLeave={() => setPickerOpen(false)}
    >
      <div className="gc-avatar-slot">
        {isLast ? <Avatar uid={message.uid} name={message.name} /> : null}
      </div>

      <div className="gc-body">
        <div className="gc-bubble-wrap">
          {pickerOpen && status !== "blocked" ? (
            <ReactionPicker onReact={(emoji) => onReact(message.id, emoji)} />
          ) : null}

          <button
            type="button"
            className={`gc-bubble ${isOwn ? "gc-bubble-own" : ""} ${
              status === "sending" ? "gc-bubble-pending" : ""
            } ${status === "blocked" ? "gc-bubble-blocked" : ""}`}
            onClick={() => setPickerOpen((open) => !open)}
          >
            {message.text}
          </button>
        </div>

        <ReactionChips
          reactions={message.reactions}
          myUid={myUid}
          onReact={(emoji) => onReact(message.id, emoji)}
        />

        {(isLast || status) && (
          <div className="gc-meta">
            {status === "sending" && <span>Sending…</span>}
            {status === "delivered" && isOwn && <span>Delivered</span>}
            {status === "blocked" && (
              <span className="gc-meta-blocked">
                {message.blockReason || "Blocked"}
              </span>
            )}
            {isLast && status !== "sending" && (
              <span className="gc-time">{formatTime(message.timestamp)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageRow;
```

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: Vite build completes.

- [ ] **Step 3: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add frontend/src/components/globalchat/MessageRow.jsx
git commit -m "feat: add chat message row"
```

---

## Task 7: GlobalChat container and stylesheet

**Files:**
- Create: `frontend/src/components/globalchat/GlobalChat.jsx`
- Create: `frontend/src/components/globalchat/globalchat.css`

- [ ] **Step 1: Write the container**

Create `frontend/src/components/globalchat/GlobalChat.jsx`:

```jsx
import { useEffect, useRef, useState } from "react";
import MessageRow from "./MessageRow";
import { groupMessages } from "./groupMessages";
import "./globalchat.css";

const NEAR_BOTTOM_PX = 80;
const TYPING_THROTTLE_MS = 2000;

function typingLabel(names) {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function GlobalChat({
  messages = [],
  myUid,
  typingNames = [],
  onSend,
  onReact,
  onTyping,
}) {
  const [input, setInput] = useState("");
  const listRef = useRef(null);
  const lastTypingSentAt = useRef(0);

  // Autoscroll only when the reader is already at the bottom. Writing to
  // scrollTop keeps the scroll inside this element — scrollIntoView would drag
  // the whole window with it.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distance < NEAR_BOTTOM_PX + 200) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, typingNames]);

  const submit = (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
    onTyping(false);
    lastTypingSentAt.current = 0;
    // A sent message is always meant to be seen.
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };

  const handleChange = (event) => {
    const value = event.target.value;
    setInput(value);

    if (!value.trim()) {
      onTyping(false);
      lastTypingSentAt.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentAt.current > TYPING_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      onTyping(true);
    }
  };

  const groups = groupMessages(messages);
  const label = typingLabel(typingNames);

  return (
    <div className="gc-root">
      <div className="gc-list" ref={listRef}>
        {groups.length === 0 ? (
          <p className="gc-empty">No messages yet. Say hi 👋</p>
        ) : (
          groups.map((group) => {
            const isOwn = group.uid === myUid;
            return (
              <div
                key={group.key}
                className={`gc-group ${isOwn ? "gc-group-own" : ""}`}
              >
                {!isOwn && <span className="gc-name">{group.name}</span>}
                {group.messages.map((message, index) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    isOwn={isOwn}
                    isLast={index === group.messages.length - 1}
                    myUid={myUid}
                    onReact={onReact}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="gc-typing" aria-live="polite">
        {label}
      </div>

      <form className="gc-form" onSubmit={submit}>
        <textarea
          className="gc-input"
          placeholder="Type a message..."
          value={input}
          onChange={handleChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) submit(event);
          }}
        />
        <button type="submit" className="gc-send" disabled={!input.trim()}>
          Shoot
        </button>
      </form>
    </div>
  );
}

export default GlobalChat;
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/components/globalchat/globalchat.css`:

```css
/* Every selector here is gc- prefixed. videochat.css defines unscoped
   .messages-container, .message-form and .send-button rules that apply on every
   page, and one of them (height: 100%) is what broke this layout before. */

.gc-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 4px solid #0099ff;
  background-color: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
}

.gc-list {
  flex: 1;
  min-height: 0;          /* lets this element scroll instead of growing */
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-width: thin;
}

.gc-empty {
  margin: auto;
  opacity: 0.6;
  font-size: 0.9rem;
  text-align: center;
}

.gc-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gc-name {
  font-size: 0.7rem;
  opacity: 0.7;
  margin-left: 40px;
  margin-bottom: 2px;
}

.gc-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
}

.gc-row-own {
  flex-direction: row-reverse;
}

.gc-avatar-slot {
  width: 32px;
  flex: 0 0 32px;
}

.gc-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  user-select: none;
}

.gc-body {
  display: flex;
  flex-direction: column;
  max-width: 78%;
  min-width: 0;
}

.gc-row-own .gc-body {
  align-items: flex-end;
}

.gc-bubble-wrap {
  position: relative;
}

.gc-bubble {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 8px 12px;
  border: none;
  border-radius: 14px;
  font: inherit;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  word-break: break-word;
  white-space: pre-wrap;
  max-width: 100%;
}

.gc-bubble-own {
  background: #2f5cff;
}

.gc-bubble-pending {
  opacity: 0.55;
}

.gc-bubble-blocked {
  background: rgba(255, 107, 107, 0.2);
  outline: 1px solid #ff6b6b;
}

.gc-react-bar {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: #2b2b2b;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  z-index: 2;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.gc-row-own .gc-react-bar {
  left: auto;
  right: 0;
}

.gc-react-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 3px;
  border-radius: 50%;
}

.gc-react-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.gc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: -6px;
  padding: 0 4px;
}

.gc-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: #2b2b2b;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 0.75rem;
  color: #fff;
  cursor: pointer;
}

.gc-chip-mine {
  border-color: #2f5cff;
  background: rgba(47, 92, 255, 0.25);
}

.gc-chip-count {
  font-size: 0.7rem;
  opacity: 0.85;
}

.gc-meta {
  display: flex;
  gap: 6px;
  font-size: 0.65rem;
  opacity: 0.6;
  padding: 2px 4px;
}

.gc-meta-blocked {
  color: #ff6b6b;
  opacity: 1;
}

.gc-typing {
  min-height: 16px;
  padding: 0 14px 2px;
  font-size: 0.72rem;
  opacity: 0.7;
}

.gc-form {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.gc-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 12px;
  border-radius: 8px;
  border: 2px solid #c2a8ff;
  font-family: inherit;
  font-size: 0.9rem;
  resize: none;
}

.gc-input:focus {
  outline: none;
  border-color: #0099ff;
}

.gc-send {
  background-color: #c2a8ff;
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 0 16px;
  font-weight: 700;
  cursor: pointer;
}

.gc-send:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: Vite build completes.

- [ ] **Step 4: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add frontend/src/components/globalchat/GlobalChat.jsx frontend/src/components/globalchat/globalchat.css
git commit -m "feat: add global chat container and scoped styles"
```

---

## Task 8: Wire the new events in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add the new state**

In `frontend/src/App.jsx`, replace the two existing global-chat state lines (18–19):

```jsx
  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalBlockNotice, setGlobalBlockNotice] = useState(null);
```

with:

```jsx
  const [globalMessages, setGlobalMessages] = useState([]);
  const [myUid, setMyUid] = useState(null);
  const [typingNames, setTypingNames] = useState([]);
```

`globalBlockNotice` is removed — block reasons now render on the message itself.

- [ ] **Step 2: Replace the socket listeners**

In the main `useEffect`, replace the existing three global listeners:

```jsx
    socket.on("globalHistory", (history) => {
      setGlobalMessages(Array.isArray(history) ? history : []);
    });

    socket.on("globalMessage", (msg) => {
      setGlobalMessages((prev) => [...prev, msg]);
    });

    socket.on("globalMessageBlocked", (data) => {
      setGlobalBlockNotice(data?.reason || "Message blocked.");
    });
```

with:

```jsx
    socket.on("globalIdentity", ({ uid }) => setMyUid(uid));

    socket.on("globalHistory", (history) => {
      setGlobalMessages(Array.isArray(history) ? history : []);
    });

    socket.on("globalMessage", (msg) => {
      setGlobalMessages((prev) => {
        // Drop our own optimistic copy, then append the server's canonical one.
        const withoutOptimistic = prev.filter(
          (m) => !(m.clientId && m.clientId === msg.clientId)
        );
        const next = [...withoutOptimistic, { ...msg, status: "delivered" }];
        // Match the server's 50-message cap so a long session cannot grow the
        // list (and the DOM) without bound.
        return next.length > 50 ? next.slice(-50) : next;
      });
    });

    socket.on("globalMessageBlocked", ({ clientId, reason }) => {
      if (!clientId) return;
      setGlobalMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId
            ? { ...m, status: "blocked", blockReason: reason }
            : m
        )
      );
    });

    socket.on("globalReaction", ({ messageId, reactions }) => {
      setGlobalMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    });

    socket.on("globalTypingUsers", ({ names }) => {
      setTypingNames(Array.isArray(names) ? names : []);
    });
```

- [ ] **Step 3: Update the cleanup block**

In the same `useEffect`'s `return () => { ... }`, replace:

```jsx
      socket.off("globalHistory");
      socket.off("globalMessage");
      socket.off("globalMessageBlocked");
```

with:

```jsx
      socket.off("globalIdentity");
      socket.off("globalHistory");
      socket.off("globalMessage");
      socket.off("globalMessageBlocked");
      socket.off("globalReaction");
      socket.off("globalTypingUsers");
```

- [ ] **Step 4: Replace the send handler and add the two new ones**

Replace the existing `handleSendGlobal`:

```jsx
  const handleSendGlobal = (message) => {
    if (message.trim()) {
      setGlobalBlockNotice(null);
      socket.emit("globalMessage", message);
    }
  };
```

with:

```jsx
  const handleSendGlobal = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const clientId = crypto.randomUUID();
    const email = localStorage.getItem("collegeEmail") || "";

    // Optimistic row. The server echoes clientId back, at which point this is
    // swapped for the canonical message and the status becomes "delivered".
    setGlobalMessages((prev) => [
      ...prev,
      {
        id: `local-${clientId}`,
        clientId,
        uid: myUid,
        name: email.split("@")[0],
        text: trimmed,
        timestamp: new Date().toISOString(),
        reactions: {},
        status: "sending",
      },
    ]);

    socket.emit("globalMessage", { text: trimmed, clientId });
  };

  const handleReactGlobal = (messageId, emoji) => {
    socket.emit("globalReact", { messageId, emoji });
  };

  const handleTypingGlobal = (typing) => {
    socket.emit("globalTyping", { typing });
  };
```

- [ ] **Step 5: Update the props on both StartPage elements**

In `renderScreen`, both `case "start":` and `case "waiting":` render `<StartPage ... />`. On BOTH, replace these three props:

```jsx
            globalMessages={globalMessages}
            onSendGlobal={handleSendGlobal}
            globalBlockNotice={globalBlockNotice}
```

with these six:

```jsx
            globalMessages={globalMessages}
            myUid={myUid}
            typingNames={typingNames}
            onSendGlobal={handleSendGlobal}
            onReactGlobal={handleReactGlobal}
            onTypingGlobal={handleTypingGlobal}
```

- [ ] **Step 6: Verify no stale references remain**

Run: `cd frontend && grep -n "globalBlockNotice" src/App.jsx`
Expected: no output.

- [ ] **Step 7: Verify the build**

Run: `cd frontend && npm run build`
Expected: Vite build completes.

- [ ] **Step 8: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add frontend/src/App.jsx
git commit -m "feat: wire reactions, typing and delivery state into App"
```

---

## Task 9: StartingPage tab toggle and CSS removals

**Files:**
- Modify: `frontend/src/components/StartingPage.jsx`
- Modify: `frontend/src/components/startpage.css`

- [ ] **Step 1: Rewrite StartingPage.jsx**

Replace the entire contents of `frontend/src/components/StartingPage.jsx` with:

```jsx
import React, { useEffect, useRef, useState } from "react";
import GlobalChat from "./globalchat/GlobalChat";
import "./startpage.css";

function StartPage({
  onStartChat,
  onLogout,
  onlineUserCount,
  loading,
  globalMessages = [],
  myUid,
  typingNames = [],
  onSendGlobal,
  onReactGlobal,
  onTypingGlobal,
}) {
  const videoRef = useRef(null);
  // Mobile only: the right box shows one pane at a time. Desktop shows both.
  const [mobileTab, setMobileTab] = useState("chat");

  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false, // only video preview
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Could not access webcam:", error);
      }
    };

    getMedia();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="startpage">
      <header className="navbar">
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onLogout}>
          Log Out
        </button>
      </header>

      <div className="content">
        {/* Left Section */}
        <div className="left-box">
          <p
            className="status"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <img
              src="https://em-content.zobj.net/source/apple/419/sneezing-face_1f927.png"
              alt="🟢"
              style={{ width: "20px", marginRight: "8px" }}
            />{" "}
            {onlineUserCount} making sure she’s ok.
          </p>

          <div className="filters">
            <div className="filter" style={{ display: "flex", alignItems: "center" }}>
              <img
                src="https://em-content.zobj.net/source/apple/419/man_1f468.png"
                alt=""
                style={{ width: "20px" }}
              />
              <img
                src="https://em-content.zobj.net/source/apple/419/woman-red-hair_1f469-200d-1f9b0.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />{" "}
              Anybody
            </div>
            <div className="filter" style={{ display: "flex", alignItems: "center" }}>
              <img
                src="https://em-content.zobj.net/source/apple/419/globe-showing-asia-australia_1f30f.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />
              <p style={{ margin: 0 }}>Worldwide</p>
            </div>
          </div>

          <button
            className="vibe-btn"
            onClick={onStartChat}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {loading ? (
              <div className="loader" />
            ) : (
              <>
                Lets Vibe{" "}
                <img
                  src="https://em-content.zobj.net/source/apple/419/high-voltage_26a1.png"
                  style={{ width: "20px", marginLeft: "8px" }}
                  alt="vibe"
                />
              </>
            )}
          </button>
        </div>

        <div className="right-box">
          <div className="pane-tabs">
            <button
              type="button"
              className={`pane-tab ${mobileTab === "preview" ? "pane-tab-active" : ""}`}
              onClick={() => setMobileTab("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              className={`pane-tab ${mobileTab === "chat" ? "pane-tab-active" : ""}`}
              onClick={() => setMobileTab("chat")}
            >
              Chat
            </button>
          </div>

          <div className={`pane pane-preview ${mobileTab === "preview" ? "pane-active" : ""}`}>
            <div className="video-preview">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  maxWidth: "100%",
                  borderRadius: "10px",
                  minHeight: "100%",
                }}
              />
            </div>
          </div>

          <div className={`pane pane-chat ${mobileTab === "chat" ? "pane-active" : ""}`}>
            <GlobalChat
              messages={globalMessages}
              myUid={myUid}
              typingNames={typingNames}
              onSend={onSendGlobal}
              onReact={onReactGlobal}
              onTyping={onTypingGlobal}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default StartPage;
```

- [ ] **Step 2: Remove the superseded CSS**

In `frontend/src/components/startpage.css`, delete these blocks:

1. The `.globalchat-container` rule and its comment (lines 163–168):

```css
.globalchat-container{
  /* Same element as .text-chat-section1 (flex:1). height:100% fought the flex
     layout and let the message list grow the whole page; min-height:0 lets the
     inner .messages-container scroll instead. */
  min-height: 0;
}
```

2. Inside the `@media (max-width: 768px)` block, the two hide rules:

```css
  .text-chat-section1{
    display: none !important;
  }
```

and

```css
  .globalchat-container{
    display: none;
  }
```

3. Everything from `.globalchat-container .messages-container {` (line 209) to the end of the file — that is the `.messages-container`, `.global-empty`, `.global-msg`, `.global-msg.own`, `.global-msg-name`, `.global-msg-text`, `.global-msg.own .global-msg-text`, and `.global-block-notice` rules. All are replaced by `globalchat.css`.

Also delete the now-unused `.text-chat-section1` rule (lines 143–153).

- [ ] **Step 3: Add the pane and tab styles**

Append to `frontend/src/components/startpage.css`:

```css
/* Right box panes. On desktop both panes stack and the tabs are hidden; below
   768px the tabs pick one pane and it fills the remaining height. */
.pane-tabs {
  display: none;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pane-preview {
  flex: 0 0 200px;
  margin-bottom: 20px;
}

.pane-chat {
  flex: 1;
}

@media (max-width: 768px) {
  .pane-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex: 0 0 auto;
  }

  .pane-tab {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: #3c3c3c;
    color: #fff;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
  }

  .pane-tab-active {
    background: #0099ff;
  }

  .pane {
    display: none;
  }

  .pane-active {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .pane-preview.pane-active {
    flex: 1 1 auto;
  }
}
```

- [ ] **Step 4: Confirm the colliding class names are gone**

Run: `cd frontend && grep -rn "text-chat-section1\|globalchat-container\|global-msg\|global-block-notice" src`
Expected: no output. Nothing on the StartPage uses a class that `videochat.css` also defines.

- [ ] **Step 5: Verify the build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: Vite build completes, 6 vitest tests pass.

- [ ] **Step 6: Commit**

Commit to `feat/global-chat-ui-reactions`:

```bash
git add frontend/src/components/StartingPage.jsx frontend/src/components/startpage.css
git commit -m "feat: mobile chat tabs, drop colliding chat styles"
```

---

## Task 10: Manual end-to-end verification

No code. Start both servers and work through the list.

Run: `cd backend && npm start` and, in a second terminal, `cd frontend && npm run dev`.

- [ ] Log in on two browsers: **one Google account and one email/password account**. The password account is the regression test for the B4 fix — before it, every send from that account was rejected.
- [ ] Send a clean message from each. Both appear in both browsers. Own messages sit right-aligned with a blue bubble; the other user's sit left with an initials avatar and a name label.
- [ ] Send 30+ messages. The list scrolls inside its own box; the chat box does not grow; the page does not scroll; the window does not jump.
- [ ] Scroll up mid-conversation and have the other browser send a message. Your view holds position instead of being dragged to the bottom.
- [ ] Send three messages in a row from one account. They group under one name label with one avatar on the last message, and one timestamp.
- [ ] React from both accounts with the same emoji. The count reads 2. Your own chip has a blue border; the other account's does not.
- [ ] Click your own chip again. The count drops to 1 in both browsers.
- [ ] Start typing in one browser. "…is typing…" appears in the other within about a second and clears within 3 seconds of stopping.
- [ ] Send a word from `BAD_WORDS` in `moderation.js`. That message row turns red with the moderation reason attached to it, is not broadcast to the other browser, and produces a row in the `flaggedmessages` MongoDB collection.
- [ ] Send two messages inside 1.5 seconds. The second row shows "Slow down a moment."
- [ ] Narrow the window below 768px. The Preview | Chat tabs appear, both tabs fill the available height, and the page still does not scroll.
- [ ] Reload one browser. History returns and your own messages are still right-aligned (this is the reconnect case that the `uid` change fixes).
- [ ] Restart the backend. History and reactions are empty — expected, the buffer is RAM-only.
