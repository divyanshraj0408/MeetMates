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

test("toggleReaction preserves reactions on other emoji", () => {
  const start = { "❤️": ["u9"] };
  const next = toggleReaction(start, "👍", "u1");
  assert.deepStrictEqual(next, { "❤️": ["u9"], "👍": ["u1"] });
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

test("trimHistory with a zero or negative limit keeps nothing", () => {
  const msgs = [{ id: 1 }, { id: 2 }];
  assert.deepStrictEqual(trimHistory(msgs, 0), []);
  assert.deepStrictEqual(trimHistory(msgs, -5), []);
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
