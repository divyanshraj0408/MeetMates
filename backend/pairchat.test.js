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

test("reactions and typing are silent no-ops with no pairing", () => {
  const io = fakeIo();
  const socket = fakeSocket("sNoPairQuiet");
  registerPairChat(io, socket, {});

  socket.fire("pairReact", { messageId: "m1", emoji: "👍" });
  socket.fire("pairTyping", { typing: true });

  assert.strictEqual(io.sent.length, 0);
  assert.strictEqual(socket.emitted.length, 0);
});

test("sending with no pairing tells the sender instead of dropping silently", async () => {
  const io = fakeIo();
  const socket = fakeSocket("sNoPairSend");
  registerPairChat(io, socket, {});

  await socket.fire("sendMessage", { text: "hello", clientId: "c1" });

  // Nothing is relayed to anyone...
  assert.strictEqual(io.sent.length, 0);
  // ...but the sender is told, so the optimistic row can resolve.
  assert.strictEqual(socket.emitted.length, 1);
  assert.strictEqual(socket.emitted[0].event, "pairMessageBlocked");
  assert.strictEqual(socket.emitted[0].payload.clientId, "c1");
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
  assert.strictEqual("email" in msg, false);
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
