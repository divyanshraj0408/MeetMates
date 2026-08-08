# 1:1 Chat UI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 1:1 video-chat page the same chat experience as the public room — bubbles, grouping, timestamps, delivery state, typing, reactions, correct scroll containment — while keeping pairings anonymous.

**Architecture:** The public room's components are generalised rather than copied: `globalchat/` becomes `chat/`, `GlobalChat` becomes `ChatPanel`, and `groupMessages` takes a key-extractor so one page can group by `uid` and the other by `sender`. On the backend a new `pairchat.js` holds a pure `preparePairMessage` (validation + word-list gate) and the pair socket handlers; `resolveGlobalSender` moves to a shared `socketIdentity.js`. Reactions are relayed, not stored — the server holds no per-pair state.

**Tech Stack:** Node.js, Express, Socket.IO, Mongoose, `uuid`, React 19 (Vite), plain CSS. Backend tests `node:test`, frontend tests `vitest`, layout verified with Playwright.

**Spec:** [../specs/2026-08-08-pair-chat-ui-design.md](../specs/2026-08-08-pair-chat-ui-design.md)

**Branch:** Work continues on `feat/global-chat-ui-reactions`, or a fresh branch off it. Each task commits. **Do not commit to or push `main`** — the user handles `main`.

---

## File Structure

**Backend**
- Create `backend/socketIdentity.js` — `resolveGlobalSender(socket)`, moved verbatim out of `globalchat.js` so both chats share one JWT path.
- Create `backend/pairchat.js` — `preparePairMessage()` (pure) plus `registerPairChat(io, socket, chatPairs)`.
- Create `backend/pairchat.test.js` — `node:test` for the pure helper and, with hand-rolled socket doubles, the handler guards.
- Modify `backend/globalchat.js` — import `resolveGlobalSender` instead of defining it.
- Modify `backend/server.js` — replace the inline `sendMessage` handler with `registerPairChat`.

**Frontend**
- Rename `frontend/src/components/globalchat/` → `frontend/src/components/chat/` (git mv, preserves history).
- Rename `GlobalChat.jsx` → `ChatPanel.jsx`, add `myKey`, `keyOf`, `showIdentity`, `emptyText`, `typingLabel`.
- Modify `chat/groupMessages.js` — accept a `keyOf` extractor, emit `authorKey`.
- Modify `chat/MessageRow.jsx` — honour `showIdentity`.
- Modify `frontend/src/components/StartingPage.jsx` — updated import and props.
- Modify `frontend/src/App.jsx` — new 1:1 message shape, listeners, handlers.
- Modify `frontend/src/components/VideoChat.jsx` — render `ChatPanel`, drop the old markup.
- Modify `frontend/src/components/ChatRoom.jsx` — delete dead chat state.
- Modify `frontend/src/components/videochat.css` — delete the colliding rules, contain the panel.

---

## Task 1: Give groupMessages a key extractor

**Files:**
- Modify: `frontend/src/components/globalchat/groupMessages.js`
- Modify: `frontend/src/components/globalchat/groupMessages.test.js`
- Modify: `frontend/src/components/globalchat/GlobalChat.jsx`

The public room groups by `uid`; the 1:1 chat has no `uid` and must group by `sender`. Rather than duplicate the function, it takes an extractor.

- [ ] **Step 1: Update the tests**

Replace `frontend/src/components/globalchat/groupMessages.test.js` with:

```js
import { describe, it, expect } from "vitest";
import { groupMessages } from "./groupMessages";

const BASE = new Date("2026-08-08T12:00:00.000Z").getTime();
const msg = (id, uid, minutes) => ({
  id,
  uid,
  name: uid,
  text: `msg ${id}`,
  timestamp: new Date(BASE + minutes * 60000).toISOString(),
  reactions: {},
});

// 1:1 messages carry no uid — they are keyed by the sender's socket id.
const pairMsg = (id, sender, minutes) => ({
  id,
  sender,
  text: `msg ${id}`,
  timestamp: new Date(BASE + minutes * 60000).toISOString(),
  reactions: {},
});

const byUid = (m) => m.uid;
const bySender = (m) => m.sender;

describe("groupMessages", () => {
  it("returns an empty array for no messages", () => {
    expect(groupMessages([], byUid)).toEqual([]);
    expect(groupMessages(undefined, byUid)).toEqual([]);
  });

  it("groups consecutive messages from the same uid", () => {
    const groups = groupMessages(
      [msg("a", "u1", 0), msg("b", "u1", 1), msg("c", "u1", 2)],
      byUid
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("starts a new group when the sender changes", () => {
    const groups = groupMessages(
      [msg("a", "u1", 0), msg("b", "u2", 1), msg("c", "u1", 2)],
      byUid
    );
    expect(groups.map((g) => g.authorKey)).toEqual(["u1", "u2", "u1"]);
  });

  it("starts a new group after a gap longer than 5 minutes", () => {
    const groups = groupMessages(
      [msg("a", "u1", 0), msg("b", "u1", 4), msg("c", "u1", 10)],
      byUid
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b"]);
    expect(groups[1].messages.map((m) => m.id)).toEqual(["c"]);
  });

  it("gives each group a stable key from its first message", () => {
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u2", 1)], byUid);
    expect(groups[0].key).toBe("a");
    expect(groups[1].key).toBe("b");
  });

  it("tolerates a message with no timestamp", () => {
    const broken = { id: "x", uid: "u1", name: "u1", text: "hi", reactions: {} };
    expect(() => groupMessages([broken], byUid)).not.toThrow();
    expect(groupMessages([broken], byUid)).toHaveLength(1);
  });

  it("groups 1:1 messages by sender when given that extractor", () => {
    const groups = groupMessages(
      [
        pairMsg("a", "sockA", 0),
        pairMsg("b", "sockA", 1),
        pairMsg("c", "sockB", 2),
      ],
      bySender
    );
    expect(groups.map((g) => g.authorKey)).toEqual(["sockA", "sockB"]);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("defaults to grouping by uid when no extractor is given", () => {
    const groups = groupMessages([msg("a", "u1", 0), msg("b", "u2", 1)]);
    expect(groups.map((g) => g.authorKey)).toEqual(["u1", "u2"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — the `authorKey` assertions fail because groups currently expose `uid`.

- [ ] **Step 3: Update the implementation**

Replace `frontend/src/components/globalchat/groupMessages.js` with:

```js
// Consecutive messages from one sender inside this window render as one group:
// a single name label and a single avatar, matching common chat UIs.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function timeOf(message) {
  const t = new Date(message.timestamp).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// `keyOf` picks the identity that defines a group. The public room keys on the
// opaque uid; the anonymous 1:1 chat has no uid and keys on the sender's
// socket id instead.
export function groupMessages(messages, keyOf = (m) => m.uid) {
  if (!Array.isArray(messages)) return [];

  const groups = [];
  for (const message of messages) {
    const at = timeOf(message);
    const authorKey = keyOf(message);
    const last = groups[groups.length - 1];

    if (last && last.authorKey === authorKey && at - last.lastAt <= GROUP_WINDOW_MS) {
      last.messages.push(message);
      last.lastAt = at;
    } else {
      groups.push({
        key: message.id,
        authorKey,
        name: message.name,
        messages: [message],
        lastAt: at,
      });
    }
  }
  return groups;
}
```

- [ ] **Step 4: Update the one call site**

In `frontend/src/components/globalchat/GlobalChat.jsx`, change:

```jsx
  const groups = groupMessages(messages);
```

to:

```jsx
  const groups = groupMessages(messages, (m) => m.uid);
```

and change the `isOwn` line inside the `groups.map` from:

```jsx
            const isOwn = group.uid === myUid;
```

to:

```jsx
            const isOwn = group.authorKey === myUid;
```

- [ ] **Step 5: Run tests and build**

Run: `cd frontend && npm test && npm run build`
Expected: 8 tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/globalchat/groupMessages.js frontend/src/components/globalchat/groupMessages.test.js frontend/src/components/globalchat/GlobalChat.jsx
git commit -m "refactor: group messages by an injected key extractor"
```

---

## Task 2: Rename to chat/, GlobalChat becomes ChatPanel

**Files:**
- Rename: `frontend/src/components/globalchat/` → `frontend/src/components/chat/`
- Rename: `chat/GlobalChat.jsx` → `chat/ChatPanel.jsx`
- Modify: `chat/ChatPanel.jsx`, `chat/MessageRow.jsx`
- Modify: `frontend/src/components/StartingPage.jsx`

- [ ] **Step 1: Move the files with git mv so history survives**

```bash
cd /Users/divyanshraj/Geeky/MeetMates
git mv frontend/src/components/globalchat frontend/src/components/chat
git mv frontend/src/components/chat/GlobalChat.jsx frontend/src/components/chat/ChatPanel.jsx
```

- [ ] **Step 2: Generalise ChatPanel**

Replace the whole of `frontend/src/components/chat/ChatPanel.jsx` with:

```jsx
import { useEffect, useRef, useState } from "react";
import MessageRow from "./MessageRow";
import { groupMessages } from "./groupMessages";
import "./globalchat.css";

const NEAR_BOTTOM_PX = 80;
const TYPING_THROTTLE_MS = 2000;

function namesToLabel(names) {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

// One chat surface, used by both the public room and the anonymous 1:1 chat.
// `keyOf` decides what counts as the same author (uid vs socket id) and
// `myKey` is the local user's value of that same identity.
function ChatPanel({
  messages = [],
  myKey,
  keyOf = (m) => m.uid,
  showIdentity = true,
  emptyText = "No messages yet. Say hi 👋",
  typingNames = [],
  typingLabel,
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
  }, [messages, typingNames, typingLabel]);

  const submit = (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
    onTyping(false);
    lastTypingSentAt.current = 0;
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

  const groups = groupMessages(messages, keyOf);
  // An explicit label wins; otherwise derive one from the name list.
  const label = typingLabel !== undefined ? typingLabel : namesToLabel(typingNames);

  return (
    <div className="gc-root">
      <div className="gc-list" ref={listRef}>
        {groups.length === 0 ? (
          <p className="gc-empty">{emptyText}</p>
        ) : (
          groups.map((group) => {
            const isOwn = group.authorKey === myKey;
            return (
              <div
                key={group.key}
                className={`gc-group ${isOwn ? "gc-group-own" : ""}`}
              >
                {showIdentity && !isOwn && (
                  <span className="gc-name">{group.name}</span>
                )}
                {group.messages.map((message, index) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    isOwn={isOwn}
                    isLast={index === group.messages.length - 1}
                    myKey={myKey}
                    showIdentity={showIdentity}
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

export default ChatPanel;
```

- [ ] **Step 3: Teach MessageRow to hide identity**

In `frontend/src/components/chat/MessageRow.jsx`, change the signature from:

```jsx
function MessageRow({ message, isOwn, isLast, myUid, onReact }) {
```

to:

```jsx
function MessageRow({ message, isOwn, isLast, myKey, showIdentity = true, onReact }) {
```

Replace the avatar slot block:

```jsx
      <div className="gc-avatar-slot">
        {isLast ? <Avatar uid={message.uid} name={message.name} /> : null}
      </div>
```

with (the whole slot disappears when anonymous, so bubbles sit flush instead of
leaving a 32px gutter):

```jsx
      {showIdentity && (
        <div className="gc-avatar-slot">
          {isLast ? <Avatar uid={message.uid} name={message.name} /> : null}
        </div>
      )}
```

And change the `ReactionChips` call from `myUid={myUid}` to `myUid={myKey}`:

```jsx
        <ReactionChips
          reactions={message.reactions}
          myUid={myKey}
          onReact={(emoji) => onReact(message.id, emoji)}
        />
```

- [ ] **Step 4: Update StartingPage**

In `frontend/src/components/StartingPage.jsx`, change the import:

```jsx
import GlobalChat from "./globalchat/GlobalChat";
```

to:

```jsx
import ChatPanel from "./chat/ChatPanel";
```

and change the usage from:

```jsx
            <GlobalChat
              messages={globalMessages}
              myUid={myUid}
              typingNames={typingNames}
              onSend={onSendGlobal}
              onReact={onReactGlobal}
              onTyping={onTypingGlobal}
            />
```

to:

```jsx
            <ChatPanel
              messages={globalMessages}
              myKey={myUid}
              keyOf={(m) => m.uid}
              showIdentity
              typingNames={typingNames}
              onSend={onSendGlobal}
              onReact={onReactGlobal}
              onTyping={onTypingGlobal}
            />
```

- [ ] **Step 5: Confirm no stale references**

Run: `cd frontend && grep -rn "globalchat/\|GlobalChat" src`
Expected: NO output.

- [ ] **Step 6: Run tests and build**

Run: `cd frontend && npm test && npm run build`
Expected: 8 tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/components
git commit -m "refactor: GlobalChat becomes the shared ChatPanel"
```

---

## Task 3: Share the socket identity helper

**Files:**
- Create: `backend/socketIdentity.js`
- Modify: `backend/globalchat.js`

The 1:1 abuse log needs the sender's email, resolved the same way the public room does it. Moving the function keeps one JWT path instead of two.

- [ ] **Step 1: Create the shared module**

Create `backend/socketIdentity.js` by moving the existing code verbatim out of `globalchat.js`:

```js
// socketIdentity.js - resolve a socket's user from its JWT.
// Deliberately isolated from the commented-out io.use matchmaking middleware so
// chat auth cannot affect matchmaking.
const jwt = require("jsonwebtoken");
const User = require("./models/User.js");

// The in-flight promise is cached on the socket so a burst of events cannot fan
// out into concurrent database queries, and so a token that resolves to nothing
// is only looked up once per connection.
function resolveGlobalSender(socket) {
  if (socket.userEmail) return Promise.resolve(socket.userEmail);
  if (!socket.chatSenderLookup) {
    socket.chatSenderLookup = lookupGlobalSender(socket);
  }
  return socket.chatSenderLookup;
}

async function lookupGlobalSender(socket) {
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

module.exports = { resolveGlobalSender, displayNameFor };
```

- [ ] **Step 2: Delete the moved code from globalchat.js**

In `backend/globalchat.js`:

1. Delete the `resolveGlobalSender` function, the `lookupGlobalSender` function, and the `displayNameFor` function, along with their comments.
2. Delete the now-unused requires `const jwt = require("jsonwebtoken");` and `const User = require("./models/User.js");`.
3. Add near the other requires:

```js
const { resolveGlobalSender, displayNameFor } = require("./socketIdentity.js");
```

Leave everything else — the buffer, reactions, typing registry, `registerGlobalChat` — untouched.

- [ ] **Step 3: Verify nothing was orphaned**

Run: `cd backend && grep -n "jwt\.\|User\.findById\|function lookupGlobalSender\|function displayNameFor" globalchat.js`
Expected: NO output.

- [ ] **Step 4: Verify the tests and boot**

Run: `cd backend && npm test`
Expected: 20 tests pass.

Run: `cd backend && node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port ...` then `booted`.

- [ ] **Step 5: Commit**

```bash
git add backend/socketIdentity.js backend/globalchat.js
git commit -m "refactor: share the socket identity helper between both chats"
```

---

## Task 4: Pair message preparation (pure, TDD)

**Files:**
- Create: `backend/pairchat.js`
- Create: `backend/pairchat.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/pairchat.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { preparePairMessage, MAX_PAIR_MESSAGE_LENGTH } = require("./pairchat");

test("rejects a non-string or empty message", () => {
  assert.strictEqual(preparePairMessage({ text: undefined, senderId: "s1" }).ok, false);
  assert.strictEqual(preparePairMessage({ text: "", senderId: "s1" }).ok, false);
  assert.strictEqual(preparePairMessage({ text: "   ", senderId: "s1" }).ok, false);
});

test("rejects an over-long message with a stated limit", () => {
  const long = "a".repeat(MAX_PAIR_MESSAGE_LENGTH + 1);
  const r = preparePairMessage({ text: long, senderId: "s1" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /too long/i);
  assert.notStrictEqual(r.flagged, true); // length is not a moderation flag
});

test("blocks a word-list hit and marks it as flagged", () => {
  const r = preparePairMessage({ text: "you are a bitch", senderId: "s1" });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.flagged, true);
});

test("builds a clean message with an id, timestamp and empty reactions", () => {
  const r = preparePairMessage({
    text: "  hey there  ",
    clientId: "c1",
    senderId: "sock1",
    now: 1770000000000,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.message.text, "hey there"); // trimmed
  assert.strictEqual(r.message.sender, "sock1");
  assert.strictEqual(r.message.clientId, "c1");
  assert.deepStrictEqual(r.message.reactions, {});
  assert.strictEqual(r.message.timestamp, new Date(1770000000000).toISOString());
  assert.ok(r.message.id && r.message.id.length > 0);
});

test("never puts an email on the outgoing message", () => {
  const r = preparePairMessage({ text: "hello", senderId: "sock1" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual("senderEmail" in r.message, false);
  assert.strictEqual("email" in r.message, false);
});

test("defaults clientId to null when the client did not send one", () => {
  const r = preparePairMessage({ text: "hello", senderId: "sock1" });
  assert.strictEqual(r.message.clientId, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './pairchat'`.

- [ ] **Step 3: Write the implementation**

Create `backend/pairchat.js`:

```js
// pairchat.js - the anonymous 1:1 chat attached to a video pairing.
// No identity is ever emitted: alignment is by socket id, and the sender's
// email is resolved only to write an abuse record.
const { v4: uuidv4 } = require("uuid");
const { wordListHit } = require("./moderation.js");

const MAX_PAIR_MESSAGE_LENGTH = 500;

// Validate and moderate a pair message. Gate 1 (local word list) only — Gate 2
// costs up to 2s per message, which is unacceptable in a live conversation.
// Returns { ok:false, reason, flagged? } or { ok:true, message }.
function preparePairMessage({ text, clientId, senderId, now = Date.now() }) {
  if (typeof text !== "string") return { ok: false, reason: "Empty message." };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "Empty message." };

  if (trimmed.length > MAX_PAIR_MESSAGE_LENGTH) {
    return {
      ok: false,
      reason: `Message too long (${MAX_PAIR_MESSAGE_LENGTH} char max).`,
    };
  }

  if (wordListHit(trimmed)) {
    // flagged distinguishes a moderation block, which is logged, from a
    // validation block, which is not.
    return { ok: false, reason: "Message blocked by moderation.", flagged: true };
  }

  return {
    ok: true,
    message: {
      id: uuidv4(),
      clientId: clientId || null,
      sender: senderId,
      text: trimmed,
      timestamp: new Date(now).toISOString(),
      reactions: {},
    },
  };
}

module.exports = { preparePairMessage, MAX_PAIR_MESSAGE_LENGTH };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npm test`
Expected: 26 tests pass (20 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add backend/pairchat.js backend/pairchat.test.js
git commit -m "feat: add pair message preparation with a word-list gate"
```

---

## Task 5: Pair socket handlers

**Files:**
- Modify: `backend/pairchat.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Append the handlers to pairchat.js**

Add these requires at the top of `backend/pairchat.js`, below the existing ones:

```js
const FlaggedMessage = require("./models/FlaggedMessage.js");
const { ALLOWED_EMOJI } = require("./globalchat.js");
const { resolveGlobalSender } = require("./socketIdentity.js");
```

Append this above the `module.exports` line:

```js
const PAIR_REACT_RATE_MS = 300;
const lastPairReactAt = new Map(); // socketId -> timestamp

// registerPairChat needs the live chatPairs map from server.js, which owns
// pairing. It is passed in rather than imported so pairchat.js keeps no
// pairing state of its own.
function registerPairChat(io, socket, chatPairs) {
  const roomOf = () => chatPairs[socket.id]?.room || null;

  socket.on("sendMessage", async (raw) => {
    const room = roomOf();
    if (!room) return;

    // Accept both the object form and a bare string so a stale client cannot
    // break during deploy.
    const payload = typeof raw === "string" ? { text: raw } : raw || {};
    const result = preparePairMessage({
      text: payload.text,
      clientId: payload.clientId || null,
      senderId: socket.id,
    });

    if (!result.ok) {
      if (result.flagged) {
        // Resolve the sender only to write the abuse record. This email is
        // never emitted to any client.
        try {
          const email = await resolveGlobalSender(socket);
          await FlaggedMessage.create({
            email: email || undefined,
            text: String(payload.text || "").trim(),
            reason: "profanity",
            category: "wordlist",
            socketId: socket.id,
          });
        } catch (err) {
          console.error("Failed to log flagged pair message:", err.message);
        }
      }
      socket.emit("pairMessageBlocked", {
        clientId: payload.clientId || null,
        reason: result.reason,
      });
      return;
    }

    io.to(room).emit("message", result.message);
  });

  socket.on("pairReact", ({ messageId, emoji } = {}) => {
    const room = roomOf();
    if (!room) return;
    if (!messageId) return;
    if (!ALLOWED_EMOJI.includes(emoji)) return;

    const now = Date.now();
    if (now - (lastPairReactAt.get(socket.id) || 0) < PAIR_REACT_RATE_MS) return;
    lastPairReactAt.set(socket.id, now);

    // Relay only. Both clients apply the same toggle to the same state and
    // converge, so the server keeps no per-pair reaction store to leak.
    io.to(room).emit("pairReaction", { messageId, emoji, from: socket.id });
  });

  socket.on("pairTyping", ({ typing } = {}) => {
    const partner = chatPairs[socket.id]?.partner;
    if (!partner) return;
    io.to(partner).emit("pairTyping", { typing: Boolean(typing) });
  });

  socket.on("disconnect", () => {
    lastPairReactAt.delete(socket.id);
  });
}
```

Then extend the exports:

```js
module.exports = { preparePairMessage, MAX_PAIR_MESSAGE_LENGTH, registerPairChat };
```

- [ ] **Step 2: Delete the old handler from server.js**

In `backend/server.js`, delete this entire handler:

```js
  socket.on("sendMessage", (message) => {
    if (chatPairs[socket.id]) {
      const userInfo = authenticatedUsers.get(socket.id);
      io.to(chatPairs[socket.id].room).emit("message", {
        sender: socket.id,
        text: message,
        senderEmail: userInfo?.email || "Anonymous",
        timestamp: new Date().toISOString(),
      });
    }
  });
```

- [ ] **Step 3: Wire in the new module**

In `backend/server.js`, add next to the `registerGlobalChat` require:

```js
const { registerPairChat } = require("./pairchat.js");
```

and directly after the existing `registerGlobalChat(io, socket);` line, add:

```js
  registerPairChat(io, socket, chatPairs);
```

- [ ] **Step 3b: Test the handler guards with fake sockets**

Append to `backend/pairchat.test.js`:

```js
const { registerPairChat } = require("./pairchat");

// Minimal Socket.IO doubles. registerPairChat only needs on/emit on the socket
// and to(room).emit on io, so hand-rolling them beats pulling in a mock library.
function fakeIo() {
  const sent = [];
  return { sent, to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };
}

function fakeSocket(id) {
  const handlers = {};
  const emitted = [];
  return {
    id,
    handlers,
    emitted,
    on: (event, handler) => { handlers[event] = handler; },
    emit: (event, payload) => emitted.push({ event, payload }),
    fire: (event, payload) => handlers[event] && handlers[event](payload),
  };
}

test("pair events are no-ops when the socket is not in a pairing", async () => {
  const io = fakeIo();
  const socket = fakeSocket("s1");
  registerPairChat(io, socket, {}); // empty chatPairs — no pairing

  await socket.fire("sendMessage", { text: "hello", clientId: "c1" });
  socket.fire("pairReact", { messageId: "m1", emoji: "👍" });
  socket.fire("pairTyping", { typing: true });

  assert.strictEqual(io.sent.length, 0);
  assert.strictEqual(socket.emitted.length, 0);
});

test("a clean pair message is relayed to the room without any email", async () => {
  const io = fakeIo();
  const socket = fakeSocket("sMsg");
  registerPairChat(io, socket, { sMsg: { room: "r1", partner: "s2" } });

  await socket.fire("sendMessage", { text: "hey", clientId: "c1" });

  assert.strictEqual(io.sent.length, 1);
  assert.strictEqual(io.sent[0].room, "r1");
  assert.strictEqual(io.sent[0].event, "message");
  const msg = io.sent[0].payload;
  assert.strictEqual(msg.text, "hey");
  assert.strictEqual(msg.clientId, "c1");
  assert.ok(msg.id && msg.timestamp);
  assert.strictEqual("senderEmail" in msg, false);
});

test("a non-whitelisted emoji is not relayed", () => {
  const io = fakeIo();
  const socket = fakeSocket("sBadEmoji");
  registerPairChat(io, socket, { sBadEmoji: { room: "r1", partner: "s2" } });

  socket.fire("pairReact", { messageId: "m1", emoji: "💩" });
  assert.strictEqual(io.sent.length, 0);
});

test("a whitelisted emoji is relayed to the room with the reactor's id", () => {
  const io = fakeIo();
  const socket = fakeSocket("sReact");
  registerPairChat(io, socket, { sReact: { room: "r1", partner: "s2" } });

  socket.fire("pairReact", { messageId: "m1", emoji: "🔥" });
  assert.strictEqual(io.sent.length, 1);
  assert.deepStrictEqual(io.sent[0].payload, { messageId: "m1", emoji: "🔥", from: "sReact" });
});

test("typing relays to the partner only, not the room", () => {
  const io = fakeIo();
  const socket = fakeSocket("sTyping");
  registerPairChat(io, socket, { sTyping: { room: "r1", partner: "s2" } });

  socket.fire("pairTyping", { typing: true });
  assert.strictEqual(io.sent.length, 1);
  assert.strictEqual(io.sent[0].room, "s2"); // partner socket id, not the room
  assert.deepStrictEqual(io.sent[0].payload, { typing: true });
});
```

Each test uses a distinct socket id on purpose: `lastPairReactAt` is module-level,
so two tests sharing an id within 300ms would silently rate-limit each other.

- [ ] **Step 3c: Run the handler tests**

Run: `cd backend && npm test`
Expected: 31 tests pass (20 existing + 6 from Task 4 + 5 new).

- [ ] **Step 4: Verify senderEmail is gone from the wire**

Run: `cd backend && grep -rn "senderEmail" . --include='*.js' | grep -v node_modules`
Expected: NO output.

- [ ] **Step 5: Verify tests and boot**

Run: `cd backend && npm test`
Expected: 31 tests pass.

Run: `cd backend && node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port ...` then `booted`.

- [ ] **Step 6: Commit**

```bash
git add backend/pairchat.js backend/server.js
git commit -m "feat: pair chat handlers with word-list gate and relayed reactions"
```

---

## Task 6: Frontend wiring for the 1:1 chat

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add the partner-typing state**

In `frontend/src/App.jsx`, directly after the existing line:

```jsx
  const [typingNames, setTypingNames] = useState([]);
```

add:

```jsx
  const [partnerTyping, setPartnerTyping] = useState(false);
```

- [ ] **Step 2: Replace the 1:1 message listener**

Replace this listener:

```jsx
    socket.on("message", (data) => {
      const messageType = data.sender === socket.id ? "user" : "partner";
      setMessages((prev) => [...prev, { text: data.text, type: messageType }]);
    });
```

with:

```jsx
    socket.on("message", (msg) => {
      setMessages((prev) => {
        // Drop our own optimistic copy, then append the server's canonical one.
        const withoutOptimistic = prev.filter(
          (m) => !(m.clientId && m.clientId === msg.clientId)
        );
        return [...withoutOptimistic, { ...msg, status: "delivered" }];
      });
    });

    socket.on("pairMessageBlocked", ({ clientId, reason }) => {
      if (!clientId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId
            ? { ...m, status: "blocked", blockReason: reason }
            : m
        )
      );
    });

    socket.on("pairReaction", ({ messageId, emoji, from }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          // Both clients receive this event and apply the identical toggle, so
          // they converge without the server storing anything.
          const reactions = { ...(m.reactions || {}) };
          const list = reactions[emoji] ? [...reactions[emoji]] : [];
          const at = list.indexOf(from);
          if (at === -1) list.push(from);
          else list.splice(at, 1);
          if (list.length === 0) delete reactions[emoji];
          else reactions[emoji] = list;
          return { ...m, reactions };
        })
      );
    });

    socket.on("pairTyping", ({ typing }) => setPartnerTyping(Boolean(typing)));
```

- [ ] **Step 3: Update the cleanup block**

In the same `useEffect`'s cleanup, directly after `socket.off("message");` add:

```jsx
      socket.off("pairMessageBlocked");
      socket.off("pairReaction");
      socket.off("pairTyping");
```

- [ ] **Step 4: Replace the send handler and add the two new ones**

Replace:

```jsx
  const handleSendMessage = (message) => {
    if (message.trim()) {
      socket.emit("sendMessage", message);
    }
  };
```

with:

```jsx
  const handleSendMessage = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // crypto.randomUUID is only available in a secure context; a dev server
    // reached over a LAN IP is not one, so fall back to a good-enough id.
    const clientId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${clientId}`,
        clientId,
        sender: socket.id,
        text: trimmed,
        timestamp: new Date().toISOString(),
        reactions: {},
        status: "sending",
      },
    ]);

    socket.emit("sendMessage", { text: trimmed, clientId });
  };

  const handleReactPair = (messageId, emoji) => {
    socket.emit("pairReact", { messageId, emoji });
  };

  const handleTypingPair = (typing) => {
    socket.emit("pairTyping", { typing });
  };
```

- [ ] **Step 5: Clear partner typing when the pairing changes**

`setMessages([])` already runs when the user clicks Next, when the partner leaves, and when the call ends. Add `setPartnerTyping(false);` on the line directly after **every** `setMessages([]);` in this file so a stale indicator cannot survive into the next pairing.

Run: `cd frontend && grep -c "setMessages(\[\]);" src/App.jsx` and confirm the same count of `setPartnerTyping(false);` lines afterwards with `grep -c "setPartnerTyping(false);" src/App.jsx`.

- [ ] **Step 6: Pass the new props to ChatRoom**

Find the `<ChatRoom ... />` element in `renderScreen` and add these three props:

```jsx
            partnerTyping={partnerTyping}
            onReactPair={handleReactPair}
            onTypingPair={handleTypingPair}
```

- [ ] **Step 7: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: wire 1:1 delivery state, reactions and typing"
```

---

## Task 7: Render ChatPanel on the video page

**Files:**
- Modify: `frontend/src/components/ChatRoom.jsx`
- Modify: `frontend/src/components/VideoChat.jsx`

- [ ] **Step 1: Pass the props through ChatRoom and delete its dead chat state**

In `frontend/src/components/ChatRoom.jsx`, replace the whole file with:

```jsx
import VideoChat from "./VideoChat";
import "./chatroom.css";

function ChatRoom({
  messages,
  onSendMessage,
  onNext,
  videoEnabled,
  toggleVideo,
  socketId,
  onLogout,
  endCall,
  partnerTyping,
  onReactPair,
  onTypingPair,
}) {
  return (
    <div className={`chat-container ${videoEnabled ? "with-video" : ""}`}>
      <div className="chat-header">
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onLogout}>
          Log Out
        </button>
      </div>

      <div className="chat-body">
        {videoEnabled && (
          <div>
            <VideoChat
              socketId={socketId}
              toggleVideo={toggleVideo}
              messages={messages}
              onSendMessage={onSendMessage}
              endCall={endCall}
              onNext={onNext}
              partnerTyping={partnerTyping}
              onReactPair={onReactPair}
              onTypingPair={onTypingPair}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatRoom;
```

This deletes the unused `message` state, `messagesEndRef`, `handleSubmit` and the `scrollIntoView` effect — none of them were referenced by anything this file renders.

- [ ] **Step 2: Update the VideoChat signature and imports**

In `frontend/src/components/VideoChat.jsx`, change the import block's first lines from:

```jsx
import { useEffect, useRef, useState } from "react";
import socket from "../Socket";
```

to:

```jsx
import { useEffect, useRef, useState } from "react";
import socket from "../Socket";
import ChatPanel from "./chat/ChatPanel";
```

Change the signature from:

```jsx
function VideoChat({ socketId, toggleVideo, messages, onSendMessage, endCall, onNext }) {
```

to:

```jsx
function VideoChat({ socketId, toggleVideo, messages, onSendMessage, endCall, onNext, partnerTyping, onReactPair, onTypingPair }) {
```

- [ ] **Step 3: Delete the now-unused chat state and scroll effect**

Delete these two lines:

```jsx
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef(null);
```

Delete this effect and its comment:

```jsx
  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
```

Delete the `handleSubmit` function (the one that calls `onSendMessage(message)` and `setMessage("")`).

- [ ] **Step 4: Replace the chat markup**

Replace the whole `.text-chat-section` block:

```jsx
        <div className="text-chat-section">
          <div className="messages-container">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.type}-message`}>
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} className="message-form">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="message-input"
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button type="submit" className="send-button">Shoot</button>
          </form>
        </div>
```

with:

```jsx
        <div className="text-chat-section">
          <ChatPanel
            messages={messages}
            myKey={socket.id}
            keyOf={(m) => m.sender}
            showIdentity={false}
            emptyText="Say something 👋"
            typingLabel={partnerTyping ? "typing…" : null}
            onSend={onSendMessage}
            onReact={onReactPair}
            onTyping={onTypingPair}
          />
        </div>
```

- [ ] **Step 5: Verify nothing dangles**

Run: `cd frontend && grep -n "messagesEndRef\|handleSubmit\|msg.type\|message-input" src/components/VideoChat.jsx src/components/ChatRoom.jsx`
Expected: NO output.

- [ ] **Step 6: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/VideoChat.jsx frontend/src/components/ChatRoom.jsx
git commit -m "feat: render the shared ChatPanel on the video page"
```

---

## Task 8: Contain the video page chat and delete the colliding rules

**Files:**
- Modify: `frontend/src/components/videochat.css`
- Create: scratch Playwright harness (not committed)

The public room's original bug was an unbounded ancestor letting the message list inflate the page. The video page has the same shape — `.video-chat-container` is a flex column and `.video-grid` inside it carries `height: 100%` — so it is verified by measurement, not assumed.

- [ ] **Step 1: Build a harness for the video page**

Create `/private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/pairharness.html` (scratch, not committed) linking the real stylesheets and reproducing the video page structure:

```html
<!doctype html>
<html><head><meta charset="utf-8">
<style>* { box-sizing: border-box; margin: 0; padding: 0; }</style>
<link rel="stylesheet" href="/Users/divyanshraj/Geeky/MeetMates/frontend/src/components/chatroom.css">
<link rel="stylesheet" href="/Users/divyanshraj/Geeky/MeetMates/frontend/src/components/videochat.css">
<link rel="stylesheet" href="/Users/divyanshraj/Geeky/MeetMates/frontend/src/components/chat/globalchat.css">
</head><body>
<div class="chat-container with-video">
  <div class="chat-header"><p class="logo">pingo</p><button class="cta-btn">Log Out</button></div>
  <div class="chat-body"><div>
    <div class="video-chat-container">
      <div class="video-grid"><div style="background:#334;height:100%"></div><div style="background:#443"></div></div>
      <div class="text-chat-section">
        <div class="gc-root">
          <div class="gc-list" id="list"></div>
          <div class="gc-typing">typing…</div>
          <form class="gc-form"><textarea class="gc-input"></textarea><button class="gc-send">Shoot</button></form>
        </div>
      </div>
    </div>
  </div></div>
</div>
</body></html>
```

- [ ] **Step 2: Measure the current behaviour**

Create `/private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/pairmeasure.mjs`:

```js
import pw from "/Users/divyanshraj/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const [w, h] of [[1862, 969], [1440, 900], [1100, 800]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("file:///private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/pairharness.html");
  await page.evaluate(() => {
    const list = document.getElementById("list");
    for (let i = 0; i < 42; i++) {
      const g = document.createElement("div");
      g.className = "gc-group";
      g.innerHTML = `<div class="gc-row"><div class="gc-body"><div class="gc-bubble-wrap"><button class="gc-bubble">message ${i}</button></div></div></div>`;
      list.appendChild(g);
    }
  });
  await page.waitForTimeout(120);
  const r = await page.evaluate(() => {
    const list = document.getElementById("list");
    return {
      scrolls: list.scrollHeight > list.clientHeight + 1,
      pageGrow: document.documentElement.scrollHeight - window.innerHeight,
      hOver: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  console.log(w + "x" + h, JSON.stringify(r), r.scrolls && r.pageGrow === 0 && r.hOver === 0 ? "OK" : "FAIL");
}
await browser.close();
```

Run: `node /private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/pairmeasure.mjs`
Record the output. `FAIL` is the expected starting state — that is the bug this step fixes.

- [ ] **Step 3: Contain the column**

In `frontend/src/components/videochat.css`, change:

```css
.video-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 15px;
  margin-bottom: 15px;
  height: 100%;
  align-items: start;
}
```

to:

```css
.video-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 15px;
  margin-bottom: 15px;
  /* height:100% made the grid claim the whole column and push the chat out.
     flex with min-height:0 lets the chat keep its share and scroll inside. */
  flex: 1 1 auto;
  min-height: 0;
  align-items: start;
}
```

and change:

```css
.text-chat-section {
  border: 4px solid  #0099FF;
  background-color: #1E1E1E;
  /* border-image: linear-gradient(to right, #0099FF 0%, #E6F7FF 100%); */
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

to:

```css
.text-chat-section {
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* ChatPanel draws its own border and background; this is only the slot. */
  flex: 0 0 38%;
  min-height: 0;
}
```

- [ ] **Step 4: Delete the colliding rules**

Delete these rules from `frontend/src/components/videochat.css` entirely. `VideoChat.jsx` was their last consumer, so nothing references them once Task 7 has landed:

- `.messages-container`
- `.message`
- `.user-message`
- `.partner-message`
- `.message-form`
- `.message-form textarea`
- `.message-form textarea:focus`
- `.send-button`
- `.send-button:hover`
- `.send-button:active`
- the `.message-form textarea` rule inside the `@media (max-width: 768px)` block

- [ ] **Step 5: Verify the collision is gone repo-wide**

Run: `cd frontend && grep -rn "messages-container\|message-form\|send-button\|user-message\|partner-message" src`
Expected: NO output anywhere in the frontend.

- [ ] **Step 6: Re-measure**

Run: `node /private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/pairmeasure.mjs`
Expected: `OK` on all three viewports — the list scrolls, the page does not grow, no horizontal overflow.

If any line still reports `FAIL`, report the measured numbers rather than guessing at further CSS.

- [ ] **Step 7: Re-check the public room did not regress**

The public room's harness already exists at `/private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/harness.html` with its measurement script at `/private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/verify.mjs`.

Run: `node /private/tmp/claude-501/-Users-divyanshraj-Geeky-MeetMates/142d9289-ab99-473f-b650-d8939eeb22e1/scratchpad/verify.mjs`
Expected: `OK` on all ten viewports, unchanged from before this plan started. If any line reports `FAIL`, the shared-component refactor regressed the public room — stop and report which viewport and which number moved.

Then:

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/videochat.css
git commit -m "fix: contain the video page chat, delete the colliding rules"
```

---

## Task 9: Manual end-to-end verification

No code. Start both servers: `cd backend && npm start`, and `cd frontend && npm run dev`.

- [ ] Log in on two browsers and pair them into a video call.
- [ ] Send messages both ways. Bubbles render, own messages right-aligned, partner's left.
- [ ] Confirm **no name and no avatar** appear anywhere in the 1:1 chat.
- [ ] Open devtools → Network → WS on the partner's browser and confirm **no `senderEmail` field** appears in any `message` frame. This is the privacy check.
- [ ] Send three messages in a row from one side — they group with one timestamp on the last.
- [ ] React from both sides with the same emoji. The count reads 2 on both screens; each side's own chip is marked.
- [ ] Re-click your own chip. The count drops to 1 on both screens.
- [ ] Type on one side. "typing…" appears on the other and clears when the message is sent.
- [ ] Send a word from `BAD_WORDS` in `moderation.js`. The sender's row turns blocked with the reason, the partner never receives it, and a row appears in the `flaggedmessages` collection **with the sender's email populated**.
- [ ] Send 40+ messages. The panel scrolls internally; the page does not grow.
- [ ] Click Next. Messages, reactions and the typing indicator all reset for the new pairing.
- [ ] Return to the lobby and confirm the public room still works — messages, reactions, typing, grouping, avatars all unchanged.
