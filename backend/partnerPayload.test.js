const { test } = require("node:test");
const assert = require("node:assert");
const { buildPartnerPayload, PARTNER_FIELDS } = require("./partnerPayload");

test("returns exactly the six visible fields", () => {
  const out = buildPartnerPayload({
    ageBand: "22-25",
    countryCode: "IN",
    city: "Delhi",
    gender: "man",
    interests: ["cricket"],
    bio: "hi",
  });
  assert.deepStrictEqual(Object.keys(out).sort(), PARTNER_FIELDS.slice().sort());
});

test("strips identity from a full user document", () => {
  // The shape a Mongoose user actually has. This is the leak this file exists
  // to prevent — the codebase has shipped it twice before.
  const out = buildPartnerPayload({
    ageBand: "22-25",
    city: "Delhi",
    name: "Divyansh Raj",
    email: "d@gmail.com",
    googleId: "g-123",
    profilePicture: "https://example.com/p.png",
    password: "hashed",
    _id: "abc",
  });
  for (const leak of ["name", "email", "googleId", "profilePicture", "password", "_id"]) {
    assert.strictEqual(leak in out, false, `${leak} reached the partner payload`);
  }
});

test("falls back to a legacy region as the city", () => {
  // Nothing should have this shape, but being wrong about that must not lose
  // someone's location.
  const out = buildPartnerPayload({ region: "Delhi" });
  assert.strictEqual(out.city, "Delhi");
});

test("prefers city over a legacy region when both exist", () => {
  const out = buildPartnerPayload({ city: "Mumbai", region: "Delhi" });
  assert.strictEqual(out.city, "Mumbai");
});

test("returns empty strings and an empty array for a blank profile", () => {
  const out = buildPartnerPayload({});
  assert.strictEqual(out.ageBand, "");
  assert.deepStrictEqual(out.interests, []);
});

test("tolerates null and undefined", () => {
  assert.deepStrictEqual(Object.keys(buildPartnerPayload(null)).sort(), PARTNER_FIELDS.slice().sort());
  assert.deepStrictEqual(Object.keys(buildPartnerPayload(undefined)).sort(), PARTNER_FIELDS.slice().sort());
});
