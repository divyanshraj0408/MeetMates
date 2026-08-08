// pairchat.js - the anonymous 1:1 chat attached to a video pairing.
// No identity is ever emitted: alignment is by socket id, and the sender's
// email is resolved only to write an abuse record.
const { v4: uuidv4 } = require("uuid");
const { wordListHit } = require("./moderation.js");
const FlaggedMessage = require("./models/FlaggedMessage.js");
const { ALLOWED_EMOJI } = require("./globalchat.js");
const { resolveGlobalSender } = require("./socketIdentity.js");

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

module.exports = { preparePairMessage, MAX_PAIR_MESSAGE_LENGTH, registerPairChat };
