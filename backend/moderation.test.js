const { test } = require("node:test");
const assert = require("node:assert");
const { moderateMessage, parseGuardResponse, wordListHit } = require("./moderation");

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

// --- gpt-oss-safeguard-20b response shapes ---------------------------------
// Llama Guard was decommissioned by Groq (HTTP 400 model_decommissioned) and
// replaced with a policy classifier that answers "unsafe:S1" on one line
// rather than "unsafe\nS1" across two.

test("parseGuardResponse reads the colon-delimited unsafe form", () => {
  assert.deepStrictEqual(parseGuardResponse("unsafe:S1"), {
    unsafe: true,
    category: "S1",
  });
});

test("parseGuardResponse still reads the newline-delimited form", () => {
  assert.deepStrictEqual(parseGuardResponse("unsafe\nS4"), {
    unsafe: true,
    category: "S4",
  });
});

test("parseGuardResponse tolerates spacing and case around the category", () => {
  assert.strictEqual(parseGuardResponse("UNSAFE: s3").category, "S3");
  assert.strictEqual(parseGuardResponse("unsafe : S2 ").category, "S2");
});

test("parseGuardResponse reports unknown when no category is given", () => {
  assert.deepStrictEqual(parseGuardResponse("unsafe"), {
    unsafe: true,
    category: "unknown",
  });
});

test("parseGuardResponse treats a conversational reply as unclassified", () => {
  // The classifier answers conversationally if the policy prompt is missing.
  // That must not be read as a pass — it means the call was misconfigured.
  const verdict = parseGuardResponse(
    "I'm sorry you're feeling upset, but I can't help with that."
  );
  assert.strictEqual(verdict.unsafe, false);
  assert.strictEqual(verdict.malformed, true);
});

test("parseGuardResponse marks a plain safe verdict as well-formed", () => {
  const verdict = parseGuardResponse("safe");
  assert.strictEqual(verdict.unsafe, false);
  assert.notStrictEqual(verdict.malformed, true);
});

// --- Hindi and Hinglish -----------------------------------------------------
// The student body writes in Devanagari, in Roman-script Hindi, and in mixed
// code-switched sentences. Gate 1 has to cover all three: it is the only gate
// the 1:1 chat runs, and the only one left when Groq is unreachable.

test("gate 1 catches Devanagari abuse", () => {
  assert.strictEqual(wordListHit("तू मादरचोद है"), true);
  assert.strictEqual(wordListHit("भोसड़ीके कहीं का"), true);
});

test("gate 1 catches Roman-script Hindi abuse", () => {
  assert.strictEqual(wordListHit("abe chutiye teri maa ki"), true);
  assert.strictEqual(wordListHit("bhosdike tu randi ka bacha hai"), true);
  assert.strictEqual(wordListHit("madarchod kahin ke"), true);
});

test("gate 1 catches abuse inside a code-switched sentence", () => {
  assert.strictEqual(wordListHit("bro that assignment was chutiya level hard"), true);
});

test("Devanagari matching is not defeated by ASCII word boundaries", () => {
  // \b is defined on [A-Za-z0-9_], so every Devanagari character reads as a
  // non-word character and \bमादरचोद\b never matches. This asserts the
  // Unicode-aware guard is in place instead.
  assert.strictEqual(wordListHit("मादरचोद"), true);
  assert.strictEqual(wordListHit("यह मादरचोद है"), true);
});

test("does not block legitimate words that contain a slur as a substring", () => {
  assert.strictEqual(wordListHit("pass me the chutney please"), false);
  assert.strictEqual(wordListHit("chhod do yaar"), false);
  assert.strictEqual(wordListHit("Laura is presenting first"), false);
  assert.strictEqual(wordListHit("मैं लंदन जा रहा हूँ"), false);
});

test("does not block ordinary Hindi and Hinglish conversation", () => {
  assert.strictEqual(wordListHit("yaar koi CS branch se hai kya"), false);
  assert.strictEqual(wordListHit("कोई CS विभाग से है क्या"), false);
  assert.strictEqual(wordListHit("arre yaar bahut mushkil hai ye subject"), false);
  assert.strictEqual(wordListHit("bhai deadline kab hai"), false);
});
