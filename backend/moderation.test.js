const { test } = require("node:test");
const assert = require("node:assert");
const { moderateMessage, parseGuardResponse } = require("./moderation");

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

test("catches leetspeak substitutions at gate 1", async () => {
  const groq = fakeGroq({ unsafe: false, category: null });
  const result = await moderateMessage("you are a sh1t", { groqClient: groq });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.category, "wordlist");
  assert.strictEqual(groq.calls.length, 0);
});

test("does not block innocent words that contain a bad substring", async () => {
  const groq = fakeGroq({ unsafe: false, category: null });
  const result = await moderateMessage("i love grape juice at the scrape", { groqClient: groq });
  assert.strictEqual(result.ok, true); // "grape"/"scrape" must NOT trip the wordlist
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

test("parseGuardResponse reads safe", () => {
  assert.deepStrictEqual(parseGuardResponse("safe"), { unsafe: false, category: null });
});

test("parseGuardResponse reads unsafe with category", () => {
  assert.deepStrictEqual(parseGuardResponse("unsafe\nS1"), { unsafe: true, category: "S1" });
});
