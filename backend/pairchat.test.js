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
