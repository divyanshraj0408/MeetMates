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

module.exports = {
  ALLOWED_EMOJI,
  uidFor,
  isAllowedEmoji,
  toggleReaction,
  trimHistory,
  setTyping,
  activeTypingNames,
};
