# Global Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the "Coming soon" placeholder on the StartPage into a working, moderated public chat room shared by all logged-in users.

**Architecture:** Socket.IO broadcast room. Server keeps the last 50 messages in memory and sends them on connect. Each message passes a two-gate moderation check — local word-list first, then Groq Llama Guard — before broadcast. Blocked messages are logged to MongoDB. Frontend state lives in `App.jsx` (where socket listeners already are) and renders in the existing StartPage box.

**Tech Stack:** Node.js, Express, Socket.IO, Mongoose, `axios` (Groq REST call), `jsonwebtoken`, React (Vite). Tests via Node's built-in `node:test`.

**Note:** The user commits changes themselves. Do NOT run `git commit` or `git add`. Replace each "Commit" step with: pause and let the user review/commit.

---

## File Structure

- Create `backend/moderation.js` — `moderateMessage(text, { groqClient })` two-gate check. Pure/injectable, unit-tested.
- Create `backend/moderation.test.js` — `node:test` unit tests for the above.
- Create `backend/models/FlaggedMessage.js` — Mongoose model for blocked-message log.
- Modify `backend/server.js` — global chat state, socket handlers, history on connect.
- Modify `backend/package.json` — add `"test": "node --test"` script.
- Modify `frontend/src/App.jsx` — global chat state, listeners, send handler, pass props.
- Modify `frontend/src/components/StartingPage.jsx` — wire the message list + form.
- Modify `frontend/src/components/startpage.css` — message row styling.
- Modify `README.md` — document `GROQ_API_KEY`.

---

## Task 1: Word-list moderation gate (no network)

**Files:**
- Create: `backend/moderation.js`
- Create: `backend/moderation.test.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Add the test script to package.json**

In `backend/package.json`, change the `scripts` block to:

```json
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing test**

Create `backend/moderation.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { moderateMessage } = require("./moderation");

// Fake Groq client that records calls and returns a canned verdict.
function fakeGroq(verdict) {
  const calls = [];
  return {
    calls,
    async classify(text) {
      calls.push(text);
      return verdict; // { unsafe: bool, category: string|null }
    },
  };
}

test("blocks an obvious bad word at gate 1 without calling groq", async () => {
  const groq = fakeGroq({ unsafe: false, category: null });
  const result = await moderateMessage("you are a bitch", { groqClient: groq });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.category, "wordlist");
  assert.strictEqual(groq.calls.length, 0); // gate 1 short-circuits
});

test("catches leetspeak / repeated chars at gate 1", async () => {
  const groq = fakeGroq({ unsafe: false, category: null });
  const result = await moderateMessage("f u c k you", { groqClient: groq });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.category, "wordlist");
});

test("allows a clean message when groq says safe", async () => {
  const groq = fakeGroq({ unsafe: false, category: null });
  const result = await moderateMessage("hey, anyone from CS dept?", { groqClient: groq });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(groq.calls.length, 1);
});

test("blocks when groq flags unsafe", async () => {
  const groq = fakeGroq({ unsafe: true, category: "S1" });
  const result = await moderateMessage("meet me and I will hurt you", { groqClient: groq });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /flagged/);
  assert.strictEqual(result.category, "S1");
});

test("fails open (allows) when groq throws", async () => {
  const groq = {
    async classify() {
      throw new Error("network down");
    },
  };
  const result = await moderateMessage("perfectly normal message", { groqClient: groq });
  assert.strictEqual(result.ok, true);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './moderation'`.

- [ ] **Step 4: Write the minimal implementation**

Create `backend/moderation.js`:

```js
const axios = require("axios");

// Small explicit blocklist. Extend as needed. Kept lowercase, no word boundaries
// so it also catches substrings; normalization below handles spacing/leetspeak.
const BAD_WORDS = [
  "bitch", "fuck", "shit", "asshole", "bastard", "slut", "whore",
  "nigger", "faggot", "retard", "cunt", "dick", "pussy", "rape",
];

// Normalize to defeat simple obfuscation: lowercase, map common leet substitutions,
// then strip everything that isn't a letter so "f u c k" and "f.u.c.k" collapse.
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[^a-z]/g, "");
}

function wordListHit(text) {
  const normalized = normalize(text);
  return BAD_WORDS.some((w) => normalized.includes(w));
}

// Default Groq client — calls Llama Guard via the OpenAI-compatible endpoint.
// classify(text) -> { unsafe: boolean, category: string|null }
function createGroqClient() {
  return {
    async classify(text) {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "meta-llama/llama-guard-4-12b",
          messages: [{ role: "user", content: text }],
        },
        {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          timeout: 2000,
        }
      );
      const content = (res.data.choices?.[0]?.message?.content || "").trim();
      // Llama Guard replies "safe" or "unsafe\nS1"
      if (content.toLowerCase().startsWith("unsafe")) {
        const category = content.split(/\s+/)[1] || "unknown";
        return { unsafe: true, category };
      }
      return { unsafe: false, category: null };
    },
  };
}

async function moderateMessage(text, { groqClient } = {}) {
  // Gate 1: local word-list, no network.
  if (wordListHit(text)) {
    return { ok: false, reason: "profanity", category: "wordlist" };
  }

  // Gate 2: Groq AI. Fail open on any error.
  const client = groqClient || createGroqClient();
  try {
    const verdict = await client.classify(text);
    if (verdict.unsafe) {
      return { ok: false, reason: `flagged: ${verdict.category}`, category: verdict.category };
    }
    return { ok: true, reason: null, category: null };
  } catch (err) {
    console.error("Groq moderation failed, allowing message:", err.message);
    return { ok: true, reason: null, category: null };
  }
}

module.exports = { moderateMessage, wordListHit, normalize, createGroqClient };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — all 5 tests pass.

- [ ] **Step 6: Review checkpoint**

Stop. Let the user review and commit `moderation.js`, `moderation.test.js`, `package.json`.

---

## Task 2: FlaggedMessage model

**Files:**
- Create: `backend/models/FlaggedMessage.js`

- [ ] **Step 1: Write the model**

Create `backend/models/FlaggedMessage.js`:

```js
// models/FlaggedMessage.js - log of blocked global-chat messages for monitoring
const mongoose = require("mongoose");

const flaggedMessageSchema = new mongoose.Schema({
  email: { type: String, trim: true },
  text: { type: String, required: true },
  reason: { type: String },
  category: { type: String },
  socketId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FlaggedMessage", flaggedMessageSchema);
```

- [ ] **Step 2: Verify it loads**

Run: `cd backend && node -e "require('./models/FlaggedMessage'); console.log('ok')"`
Expected: prints `ok` (mongoose schema compiles). MongoDB connection not required for this check.

- [ ] **Step 3: Review checkpoint**

Stop. Let the user review and commit `models/FlaggedMessage.js`.

---

## Task 3: Server-side global chat handlers

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Add requires and in-memory state**

In `backend/server.js`, after the existing require block (near line 14, after the `authMiddleware` require), add:

```js
const { moderateMessage } = require("./moderation.js");
const FlaggedMessage = require("./models/FlaggedMessage.js");
```

Then, near the other module-level state (after `let authenticatedUsers = new Map();`, around line 108), add:

```js
// Global chat: shared public room. Keep the last 50 messages in memory.
const GLOBAL_HISTORY_LIMIT = 50;
let globalMessages = [];

// Per-socket rate limit for global chat.
const GLOBAL_RATE_MS = 1500;
const lastGlobalMessageAt = new Map(); // socketId -> timestamp

// Resolve the sender email from the socket's JWT (isolated from matchmaking auth).
// Verifies once and caches on socket.userEmail. Returns null if no/invalid token.
function resolveGlobalSender(socket) {
  if (socket.userEmail) return socket.userEmail;
  const raw = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
  if (!raw) return null;
  const token = raw.startsWith("Bearer ") ? raw.substring(7) : raw;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userEmail = decoded.email;
    return decoded.email;
  } catch (err) {
    return null;
  }
}
```

- [ ] **Step 2: Send history on connect**

In the `io.on("connection", (socket) => { ... })` block, right after the existing `io.emit("onlineUsers", getOnlineCount());` line (around line 137), add:

```js
  // Send current global chat history to the newly connected socket.
  socket.emit("globalHistory", globalMessages);
```

- [ ] **Step 3: Add the globalMessage handler**

Inside the same connection block, after the existing `socket.on("sendMessage", ...)` handler (around line 171), add:

```js
  socket.on("globalMessage", async (text) => {
    const message = String(text || "").trim();
    if (!message) return;

    const email = resolveGlobalSender(socket);
    if (!email) {
      socket.emit("globalMessageBlocked", { reason: "You must be logged in to chat." });
      return;
    }

    // Rate limit.
    const now = Date.now();
    const last = lastGlobalMessageAt.get(socket.id) || 0;
    if (now - last < GLOBAL_RATE_MS) {
      socket.emit("globalMessageBlocked", { reason: "Slow down a moment." });
      return;
    }

    // Moderate (word-list then Groq, fail-open).
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
      socket.emit("globalMessageBlocked", { reason: "Message blocked by moderation." });
      return;
    }

    lastGlobalMessageAt.set(socket.id, now);

    const outgoing = {
      id: uuidv4(),
      sender: socket.id,
      email,
      name: email.split("@")[0],
      text: message,
      timestamp: new Date().toISOString(),
    };

    globalMessages.push(outgoing);
    if (globalMessages.length > GLOBAL_HISTORY_LIMIT) {
      globalMessages = globalMessages.slice(-GLOBAL_HISTORY_LIMIT);
    }

    io.emit("globalMessage", outgoing);
  });
```

- [ ] **Step 4: Clean up rate-limit map on disconnect**

In the existing `socket.on("disconnect", () => { ... })` handler, alongside the other `.delete(socket.id)` cleanup calls (around line 282, next to `nextCooldownUsers.delete(socket.id);`), add:

```js
    lastGlobalMessageAt.delete(socket.id);
```

- [ ] **Step 5: Smoke-test the server boots**

Run: `cd backend && node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port ...` and `booted`. (MongoDB connection error is fine — we only assert the process loads server.js without a syntax/require error.)

- [ ] **Step 6: Review checkpoint**

Stop. Let the user review and commit `server.js`.

---

## Task 4: Frontend state and socket wiring (App.jsx)

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add global chat state**

In `frontend/src/App.jsx`, after the existing `const [isVideoChat, setIsVideoChat] = useState(false);` (line 17), add:

```jsx
  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalBlockNotice, setGlobalBlockNotice] = useState(null);
```

- [ ] **Step 2: Add socket listeners**

Inside the main `useEffect`, after the existing `socket.on("message", ...)` handler (around line 96), add:

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

- [ ] **Step 3: Clean up listeners**

In the same `useEffect`'s cleanup `return () => { ... }` block (around line 132), add before the closing brace:

```jsx
      socket.off("globalHistory");
      socket.off("globalMessage");
      socket.off("globalMessageBlocked");
```

- [ ] **Step 4: Add the send handler**

After the existing `handleSendMessage` function (around line 178), add:

```jsx
  const handleSendGlobal = (message) => {
    if (message.trim()) {
      setGlobalBlockNotice(null);
      socket.emit("globalMessage", message);
    }
  };
```

- [ ] **Step 5: Pass props to StartPage (both start and waiting cases)**

In `renderScreen`, the `case "start":` and `case "waiting":` both render `<StartPage ... />`. Add these three props to BOTH `<StartPage>` elements (start case around line 235, waiting case around line 250):

```jsx
            globalMessages={globalMessages}
            onSendGlobal={handleSendGlobal}
            globalBlockNotice={globalBlockNotice}
```

For example the start case becomes:

```jsx
      case "start":
        return (
          <StartPage
            onStartChat={() =>
              handleStartChat(
                localStorage.getItem("collegeEmail"),
                localStorage.getItem("withVideo") === "true"
              )
            }
            goBack={() => setCurrentScreen("home")}
            onLogout={logout}
            onlineUserCount={onlineUserCount}
            globalMessages={globalMessages}
            onSendGlobal={handleSendGlobal}
            globalBlockNotice={globalBlockNotice}
          />
        );
```

Apply the same three props to the `case "waiting":` `<StartPage>` as well.

- [ ] **Step 6: Verify frontend still builds**

Run: `cd frontend && npm run build`
Expected: Vite build completes with no errors.

- [ ] **Step 7: Review checkpoint**

Stop. Let the user review and commit `App.jsx`.

---

## Task 5: Wire the StartPage box UI

**Files:**
- Modify: `frontend/src/components/StartingPage.jsx`
- Modify: `frontend/src/components/startpage.css`

- [ ] **Step 1: Import socket and hooks; accept new props**

In `frontend/src/components/StartingPage.jsx`, change the top imports (line 1-2) to:

```jsx
import React, { useEffect, useRef, useState } from "react";
import socket from "../Socket";
import "./startpage.css";
```

Change the function signature (line 5) to:

```jsx
function StartPage({ onStartChat, onLogout, onlineUserCount, loading, globalMessages = [], onSendGlobal, globalBlockNotice }) {
```

- [ ] **Step 2: Add local input state and submit handler**

Inside the component, after `const videoRef = useRef(null);` (line 6), add:

```jsx
  const [globalInput, setGlobalInput] = useState("");
  const globalEndRef = useRef(null);

  useEffect(() => {
    globalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [globalMessages]);

  const handleGlobalSubmit = (e) => {
    e.preventDefault();
    if (globalInput.trim() && onSendGlobal) {
      onSendGlobal(globalInput);
      setGlobalInput("");
    }
  };
```

- [ ] **Step 3: Replace the placeholder box markup**

Replace the existing block (lines 70-80, the `<div className="text-chat-section1 globalchat-container">...</div>`) with:

```jsx
            <div className="text-chat-section1 globalchat-container">
              <div className="messages-container">
                {globalMessages.length === 0 ? (
                  <p className="global-empty">No messages yet. Say hi 👋</p>
                ) : (
                  globalMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`global-msg ${m.sender === socket.id ? "own" : ""}`}
                    >
                      <span className="global-msg-name">{m.name}</span>
                      <span className="global-msg-text">{m.text}</span>
                    </div>
                  ))
                )}
                <div ref={globalEndRef} />
              </div>
              {globalBlockNotice && (
                <p className="global-block-notice">{globalBlockNotice}</p>
              )}
              <form className="message-form" onSubmit={handleGlobalSubmit}>
                <textarea
                  placeholder="Type a message..."
                  value={globalInput}
                  onChange={(e) => setGlobalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      handleGlobalSubmit(e);
                    }
                  }}
                />
                <button type="submit" className="send-button" disabled={!globalInput.trim()}>
                  Shoot
                </button>
              </form>
            </div>
```

- [ ] **Step 4: Add styling**

Append to `frontend/src/components/startpage.css`:

```css
.global-empty {
  opacity: 0.6;
  font-size: 0.9rem;
  text-align: center;
  margin: auto;
}

.global-msg {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  max-width: 80%;
}

.global-msg.own {
  align-self: flex-end;
  text-align: right;
}

.global-msg-name {
  font-size: 0.7rem;
  opacity: 0.7;
  margin-bottom: 2px;
}

.global-msg-text {
  background: rgba(255, 255, 255, 0.1);
  padding: 6px 10px;
  border-radius: 10px;
  display: inline-block;
  word-break: break-word;
}

.global-msg.own .global-msg-text {
  background: rgba(120, 90, 255, 0.35);
}

.global-block-notice {
  color: #ff6b6b;
  font-size: 0.8rem;
  padding: 4px 8px;
  margin: 0;
}
```

Note: the `.messages-container` should lay messages out vertically. If it is not already a flex column, add to the existing `.globalchat-container .messages-container` rule (or create it): `display: flex; flex-direction: column; overflow-y: auto;`.

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: Vite build completes with no errors.

- [ ] **Step 6: Review checkpoint**

Stop. Let the user review and commit `StartingPage.jsx` and `startpage.css`.

---

## Task 6: Document the env var

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add GROQ_API_KEY to the backend env block**

In `README.md`, in the `Backend (backend/.env)` code block (around line 68-73), add a line:

```
GROQ_API_KEY=your_groq_api_key_from_console.groq.com
```

- [ ] **Step 2: Review checkpoint**

Stop. Let the user review and commit `README.md`. Remind the user to add `GROQ_API_KEY` to their actual `backend/.env` (gitignored) before running.

---

## Manual end-to-end verification (after all tasks)

- [ ] Set `GROQ_API_KEY` in `backend/.env`. Start backend (`cd backend && npm start`) and frontend (`cd frontend && npm run dev`).
- [ ] Log in in two separate browsers. Both land on the StartPage.
- [ ] Send a clean message from browser A → appears in both A and B, right-aligned in A.
- [ ] Refresh browser B → last messages load from history.
- [ ] Send a message with a word from `BAD_WORDS` → sender sees "Message blocked by moderation.", message NOT broadcast, a row appears in the `flaggedmessages` MongoDB collection.
- [ ] Send two messages within 1.5s → second shows "Slow down a moment."
- [ ] Temporarily set an invalid `GROQ_API_KEY`, send a clean message → still broadcasts (fail-open), server logs "Groq moderation failed".
