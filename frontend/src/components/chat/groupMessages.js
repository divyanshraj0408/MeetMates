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
