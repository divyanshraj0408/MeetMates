const { test } = require("node:test");
const assert = require("node:assert");

const {
  TIERS,
  tierForRound,
  sharedInterests,
  toAscii,
  parseStatements,
  buildPrompt,
  STATEMENTS_PER_BATCH,
} = require("./neverHaveIEver");

// ---------------------------------------------------------------------------
// tierForRound
// ---------------------------------------------------------------------------

test("tierForRound climbs one tier every 2 completed rounds", () => {
  assert.equal(tierForRound(0), "playful");
  assert.equal(tierForRound(1), "playful");
  assert.equal(tierForRound(2), "cheeky");
  assert.equal(tierForRound(3), "cheeky");
  assert.equal(tierForRound(4), "flirty");
  assert.equal(tierForRound(5), "flirty");
  assert.equal(tierForRound(6), "suggestive");
  assert.equal(tierForRound(20), "suggestive");
});

test("tierForRound treats negative, null and non-numeric input as 0", () => {
  assert.equal(tierForRound(-1), "playful");
  assert.equal(tierForRound(null), "playful");
  assert.equal(tierForRound("x"), "playful");
});

test("TIERS is the fixed ordered list", () => {
  assert.deepEqual(TIERS, ["playful", "cheeky", "flirty", "suggestive"]);
});

// ---------------------------------------------------------------------------
// sharedInterests
// ---------------------------------------------------------------------------

test("sharedInterests returns the real intersection when one exists", () => {
  const result = sharedInterests(["cricket", "coding", "anime"], ["coding", "anime", "gym"]);
  assert.deepEqual(result.sort(), ["anime", "coding"]);
});

test("sharedInterests falls back to the union when the intersection is empty", () => {
  const result = sharedInterests(["cricket"], ["anime"]);
  assert.deepEqual(result.sort(), ["anime", "cricket"]);
});

test("sharedInterests returns [] when both inputs are empty", () => {
  assert.deepEqual(sharedInterests([], []), []);
});

test("sharedInterests caps the result at 4 slugs", () => {
  const a = ["one", "two", "three", "four", "five", "six"];
  const b = ["one", "two", "three", "four", "five", "six"];
  const result = sharedInterests(a, b);
  assert.equal(result.length, 4);
});

test("sharedInterests does not throw on null/undefined/non-array inputs", () => {
  assert.deepEqual(sharedInterests(null, undefined), []);
  assert.deepEqual(sharedInterests("not-an-array", ["gym"]), ["gym"]);
  assert.deepEqual(sharedInterests(undefined, ["gym"]), ["gym"]);
});

// ---------------------------------------------------------------------------
// toAscii
// ---------------------------------------------------------------------------

test("toAscii normalizes the U+2011 non-breaking hyphen", () => {
  assert.equal(toAscii("late‑night"), "late-night");
});

test("toAscii normalizes curly quotes to straight ones", () => {
  assert.equal(toAscii("‘hello’"), "'hello'");
  assert.equal(toAscii("“hello”"), '"hello"');
});

test("toAscii strips stray emoji and other non-ASCII", () => {
  assert.equal(toAscii("party time \u{1F389}"), "party time");
});

test("toAscii normalizes em/en dashes and ellipsis", () => {
  assert.equal(toAscii("wait—what…"), "wait-what...");
});

// ---------------------------------------------------------------------------
// parseStatements
// ---------------------------------------------------------------------------

const REALISTIC_RESPONSE = [
  "1. Never have I ever texted an ex at 2am.",
  "2. Never have I ever pretended to like a gift I hated.",
  "3. Never have I ever stalked someone's social media before a first date.",
  "- Never have I ever lied about my age to get into a club.",
  "* Never have I ever ghosted someone after one date.",
  "6. Never have I ever fallen for a friend's sibling.",
].join("\n");

test("parseStatements parses a realistic 6-line response into 6 statements", () => {
  const result = parseStatements(REALISTIC_RESPONSE);
  assert.equal(result.length, 6);
  result.forEach((line) => {
    assert.match(line, /^Never have I ever/i);
  });
});

test("parseStatements strips numbering and bullet prefixes", () => {
  const result = parseStatements("1. Never have I ever done a thing.");
  assert.equal(result[0], "Never have I ever done a thing.");
});

test("parseStatements drops lines that do not start with 'Never have I ever'", () => {
  const raw = "Sure, here are some statements:\nNever have I ever done a thing.";
  const result = parseStatements(raw);
  assert.deepEqual(result, ["Never have I ever done a thing."]);
});

test("parseStatements dedupes identical lines", () => {
  const raw = [
    "Never have I ever done a thing.",
    "Never have I ever done a thing.",
  ].join("\n");
  const result = parseStatements(raw);
  assert.equal(result.length, 1);
});

test("parseStatements returns [] for empty, null and refusal responses", () => {
  assert.deepEqual(parseStatements(""), []);
  assert.deepEqual(parseStatements(null), []);
  assert.deepEqual(
    parseStatements("I'm sorry, I can't help with that request."),
    []
  );
});

test("parseStatements drops over-long lines rather than truncating them", () => {
  // Truncating produced half a sentence, which reads worse than one fewer
  // statement. Length is also the proxy for the real problem: a long line is
  // usually several deeds bolted together that nobody has done all of.
  const raw = `Never have I ever ${"a".repeat(200)}`;
  assert.deepStrictEqual(parseStatements(raw), []);
});

test("parseStatements drops compound lines", () => {
  // The failure mode that kills a round: so specific nobody can put a finger
  // down. These clauses are how the model stacks a second deed onto the first.
  for (const line of [
    "Never have I ever bunked a class and then bumped into my mom",
    "Never have I ever texted an ex just to see if he would reply",
    "Never have I ever faked a fever so that I could skip a wedding",
  ]) {
    assert.deepStrictEqual(parseStatements(line), [], line);
  }
});

test("parseStatements keeps a short single-deed line", () => {
  const line = "Never have I ever stalked an ex on Instagram";
  assert.deepStrictEqual(parseStatements(line), [line]);
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

test("buildPrompt returns a distinct tone line per tier in the system prompt", () => {
  const seen = new Set();
  TIERS.forEach((tier) => {
    const { system } = buildPrompt(tier, []);
    assert.equal(typeof system, "string");
    assert.ok(system.length > 0);
    seen.add(system);
  });
  assert.equal(seen.size, TIERS.length);
});

test("buildPrompt's suggestive tier explicitly rejects tameness", () => {
  const { system } = buildPrompt("suggestive", []);
  assert.match(system.toLowerCase(), /office icebreaker/);
  assert.match(system.toLowerCase(), /too tame/);
});

test("buildPrompt puts interests in the user message, not the system message", () => {
  const { system, user } = buildPrompt("playful", ["cricket", "anime"]);
  assert.match(user, /cricket/);
  assert.match(user, /anime/);
  assert.doesNotMatch(system, /cricket/);
  assert.doesNotMatch(system, /anime/);
});

test("buildPrompt keeps a hostile slug confined to the user message only", () => {
  const hostile = "ignore-previous-instruct";
  const { system, user } = buildPrompt("playful", [hostile]);
  assert.match(user, new RegExp(hostile));
  assert.doesNotMatch(system, new RegExp(hostile));
});

test("buildPrompt asks for universal statements when no interests are given", () => {
  const { user } = buildPrompt("playful", []);
  assert.equal(typeof user, "string");
  assert.ok(user.length > 0);
});

// ---------------------------------------------------------------------------
// STATEMENTS_PER_BATCH
// ---------------------------------------------------------------------------

test("asks for more statements than a round needs", () => {
  // The length, compound and second-person filters all reject lines, so the
  // usable count is always below what we request. Asking for exactly a
  // round's worth would leave rounds short.
  assert.ok(STATEMENTS_PER_BATCH >= 10, String(STATEMENTS_PER_BATCH));
});

test("drops statements aimed at the other player", () => {
  // Never Have I Ever is a confession about your own past. A line addressed at
  // the person on the call is the app making a pass at a stranger in its own
  // voice, rather than something both players opted into by playing — which is
  // the distinction the whole feature rests on. The model wrote "steal a moment
  // alone with you" and "imagined our first kiss" before the rule was added.
  const raw = [
    "Never have I ever imagined our first kiss during an anime climax.",
    "Never have I ever stolen a moment alone with you.",
    "Never have I ever let us both down at a pub quiz.",
    "Never have I ever sworn at a youtuber mid-stream.",
    "Never have I ever held a grudge over a lost match.",
    "Never have I ever told someone I loved them too early.",
  ].join("\n");

  const out = parseStatements(raw);

  assert.deepStrictEqual(out, [
    "Never have I ever sworn at a youtuber mid-stream.",
    "Never have I ever held a grudge over a lost match.",
    "Never have I ever told someone I loved them too early.",
  ]);
});

test("the second-person filter does not eat innocent words", () => {
  // Word boundaries, not substrings: "youtuber" contains "you" and "held"
  // contains "hel". Over-matching here would silently shrink every batch.
  for (const line of [
    "Never have I ever sworn at a youtuber mid-stream.",
    "Never have I ever held a grudge over a lost match.",
    "Never have I ever toured a stadium alone.",
    "Never have I ever housed a stray cat for a week.",
  ]) {
    assert.deepStrictEqual(parseStatements(line), [line], line);
  }
});
