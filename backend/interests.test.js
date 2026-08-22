const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const {
  INTEREST_GROUPS,
  INTEREST_SLUGS,
  isKnownInterest,
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

test("isKnownInterest accepts real slugs and rejects anything else", () => {
  assert.strictEqual(isKnownInterest("cricket"), true);
  assert.strictEqual(isKnownInterest("underwater-basket-weaving"), false);
  assert.strictEqual(isKnownInterest(""), false);
  assert.strictEqual(isKnownInterest(undefined), false);
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
