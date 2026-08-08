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
