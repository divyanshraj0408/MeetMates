// globalchat.js - shared public chat room: message buffer, reactions, typing.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { moderateMessage } = require("./moderation.js");
const FlaggedMessage = require("./models/FlaggedMessage.js");
const User = require("./models/User.js");

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
  if (limit <= 0) return [];
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
// The in-flight promise is cached on the socket so a burst of events cannot
// fan out into concurrent database queries, and so a token that resolves to
// nothing is only looked up once per connection.
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
  resolveGlobalSender(socket)
    .then((email) => {
      if (email) socket.emit("globalIdentity", { uid: uidFor(email) });
    })
    .catch((err) => console.error("Global chat identity failed:", err.message));

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
    // The socket may have disconnected while the sender lookup was in flight;
    // its disconnect cleanup has already run, so do not re-add state for it.
    if (socket.disconnected) return;

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
    broadcastTyping(io, now);

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
    // The socket may have disconnected while the sender lookup was in flight;
    // its disconnect cleanup has already run, so do not re-add state for it.
    if (socket.disconnected) return;

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
    // Remember which socket owns this entry so another device's disconnect
    // cannot clear it.
    const entry = typingRegistry.get(uidFor(email));
    if (entry) entry.socketId = socket.id;
    broadcastTyping(io, now);
  });

  socket.on("disconnect", () => {
    lastGlobalMessageAt.delete(socket.id);
    lastReactAt.delete(socket.id);
    if (socket.userEmail) {
      const uid = uidFor(socket.userEmail);
      const entry = typingRegistry.get(uid);
      if (entry && entry.socketId === socket.id) typingRegistry.delete(uid);
    }
  });
}

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
