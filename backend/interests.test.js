const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const {
  INTEREST_GROUPS,
  INTEREST_SLUGS,
  isKnownInterest,
  labelForInterest,
  normalizeInterest,
  MAX_INTEREST_LENGTH,
} = require("./interests");

test("exposes thirty-five slugs across seven groups", () => {
  assert.strictEqual(INTEREST_GROUPS.length, 7);
  assert.strictEqual(INTEREST_SLUGS.length, 35);
});

test("every slug is unique and url-safe", () => {
  assert.strictEqual(new Set(INTEREST_SLUGS).size, INTEREST_SLUGS.length);
  for (const slug of INTEREST_SLUGS) {
    assert.match(slug, /^[a-z0-9-]+$/, `bad slug: ${slug}`);
  }
});

test("every group has an emoji and a non-empty tag list", () => {
  for (const group of INTEREST_GROUPS) {
    assert.ok(group.key, "group needs a key");
    assert.ok(group.emoji, `group ${group.key} needs an emoji slug`);
    assert.ok(group.tags.length > 0, `group ${group.key} has no tags`);
  }
});

test("isKnownInterest tells vocabulary tags apart from typed ones", () => {
  // It no longer gates writes; it decides which tags need moderating.
  assert.strictEqual(isKnownInterest("cricket"), true);
  assert.strictEqual(isKnownInterest("underwater-basket-weaving"), false);
  assert.strictEqual(isKnownInterest(""), false);
  assert.strictEqual(isKnownInterest(undefined), false);
});

test("normalizeInterest collapses the ways one interest gets typed", () => {
  for (const typed of ["Lo-fi Beats", "lo fi beats", "  LO-FI  BEATS ", "lo_fi_beats"]) {
    assert.strictEqual(normalizeInterest(typed), "lo-fi-beats", typed);
  }
});

test("typing a vocabulary word lands on that word's slug", () => {
  // The point of keeping the list: someone who types "Music production" gets
  // the same slug as someone who tapped the suggestion, so they still match.
  assert.strictEqual(normalizeInterest("Music production"), "music-production");
  assert.strictEqual(normalizeInterest("Hip-Hop"), "hip-hop");
  assert.strictEqual(normalizeInterest("K-Drama"), "k-drama");
  for (const slug of INTEREST_SLUGS) {
    assert.strictEqual(normalizeInterest(slug), slug, slug);
  }
});

test("normalizeInterest keeps non-Latin scripts intact", () => {
  assert.strictEqual(normalizeInterest("शायरी"), "शायरी");
  assert.strictEqual(normalizeInterest("Café hopping"), "café-hopping");
});

test("normalizeInterest yields nothing from input with no letters or digits", () => {
  // An empty slug is the caller's cue to drop the tag rather than store "".
  for (const junk of ["", "   ", "!!!", "🔥🔥", "---", null, undefined]) {
    assert.strictEqual(normalizeInterest(junk), "", JSON.stringify(junk));
  }
});

test("normalizeInterest truncates without leaving a trailing separator", () => {
  const long = "a".repeat(MAX_INTEREST_LENGTH + 10);
  assert.strictEqual(normalizeInterest(long).length, MAX_INTEREST_LENGTH);

  // Slicing can land mid-separator; the result must still be a clean slug.
  const onBoundary = "abcdefghijklmnopqrstuvw more words here";
  const out = normalizeInterest(onBoundary);
  assert.strictEqual(out, "abcdefghijklmnopqrstuvw");
  assert.ok(!out.endsWith("-"), out);
});

test("labelForInterest prefers the stored label and falls back to the slug", () => {
  assert.strictEqual(labelForInterest("music-production"), "Music production");
  assert.strictEqual(labelForInterest("lo-fi-beats"), "lo fi beats");
  assert.strictEqual(labelForInterest(""), "");
});

test("the frontend mirror has exactly the same slugs", () => {
  // There is no shared-module tooling in this repo, so the list is duplicated.
  // This test is what stops the two copies drifting apart.
  const mirrorPath = path.join(__dirname, "..", "frontend", "src", "interests.js");
  const source = fs.readFileSync(mirrorPath, "utf8");
  const mirrored = [...source.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);

  assert.deepStrictEqual(
    mirrored.slice().sort(),
    INTEREST_SLUGS.slice().sort(),
    "frontend/src/interests.js has drifted from backend/interests.js"
  );
});

test("the frontend mirror slugs interests with identical code", () => {
  // Slugs matching is not enough here. If the frontend slugged "Lo-Fi" one way
  // and the backend another, the client would show a chip the server then
  // stored under a different key. Compare the function bodies themselves.
  const mirrorPath = path.join(__dirname, "..", "frontend", "src", "interests.js");
  const source = fs.readFileSync(mirrorPath, "utf8");

  for (const fn of [normalizeInterest, labelForInterest]) {
    assert.ok(
      source.includes(fn.toString()),
      `frontend/src/interests.js ${fn.name} has drifted from backend/interests.js`
    );
  }
});

const { COUNTRY_CODES } = require("./countries");

test("the frontend country mirror has exactly the same codes", () => {
  const mirrorPath = path.join(__dirname, "..", "frontend", "src", "countries.js");
  const source = fs.readFileSync(mirrorPath, "utf8");
  const mirrored = [...source.matchAll(/code:\s*"([A-Z]{2})"/g)].map((m) => m[1]);

  assert.deepStrictEqual(
    mirrored.slice().sort(),
    COUNTRY_CODES.slice().sort(),
    "frontend/src/countries.js has drifted from backend/countries.js"
  );
});
