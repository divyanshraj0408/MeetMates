const { test } = require("node:test");
const assert = require("node:assert");
const { buildMatchAttrs, MATCH_FIELDS } = require("./matchAttrs.js");

test("keeps only the two fields matching is allowed to see", () => {
  const attrs = buildMatchAttrs({
    gender: "woman",
    countryCode: "IN",
    city: "Delhi",
    bio: "hi",
    interests: ["chess"],
  });
  assert.deepStrictEqual(attrs, { gender: "woman", countryCode: "IN" });
});

test("cannot leak an identity field even when the document carries one", () => {
  // The guard that matters. A spread here is how an email reaches match state.
  const attrs = buildMatchAttrs({
    gender: "man",
    countryCode: "US",
    email: "someone@example.com",
    name: "Someone",
    googleId: "12345",
  });
  assert.deepStrictEqual(Object.keys(attrs).sort(), MATCH_FIELDS.slice().sort());
  assert.strictEqual(attrs.email, undefined);
  assert.strictEqual(attrs.name, undefined);
});

test("missing or absent profile yields empty strings, not undefined", () => {
  // Empty string is the wildcard the filter checks for; undefined would work by
  // accident today and break the moment someone writes `=== ""`.
  for (const input of [null, undefined, {}]) {
    assert.deepStrictEqual(buildMatchAttrs(input), { gender: "", countryCode: "" });
  }
});
