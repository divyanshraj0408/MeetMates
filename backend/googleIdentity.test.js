const { test } = require("node:test");
const assert = require("node:assert");
const { buildUserFieldsFromGooglePayload } = require("./googleIdentity");

const payload = (over = {}) => ({
  email: "someone@gmail.com",
  email_verified: true,
  name: "Divyansh Raj",
  picture: "https://example.com/p.png",
  sub: "google-123",
  ...over,
});

test("accepts a verified Google account and returns the fields to persist", () => {
  const r = buildUserFieldsFromGooglePayload(payload(), { withVideo: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fields.email, "someone@gmail.com");
  assert.strictEqual(r.fields.googleId, "google-123");
  assert.strictEqual(r.fields.name, "Divyansh Raj");
  assert.strictEqual(r.fields.isGoogleUser, true);
});

test("normalizes the email, so case differences cannot create a second account", () => {
  const r = buildUserFieldsFromGooglePayload(
    payload({ email: "  SomeOne@GMAIL.com " }),
    { withVideo: true }
  );
  assert.strictEqual(r.fields.email, "someone@gmail.com");
});

test("rejects an unverified Google email", () => {
  const r = buildUserFieldsFromGooglePayload(
    payload({ email_verified: false }),
    { withVideo: true }
  );
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /not verified/i);
});

test("rejects a payload with no email", () => {
  const r = buildUserFieldsFromGooglePayload(payload({ email: "" }), {});
  assert.strictEqual(r.ok, false);
});

test("preserves withVideo:false instead of forcing video on", () => {
  // `withVideo || true` is always true. This is the regression guard.
  const r = buildUserFieldsFromGooglePayload(payload(), { withVideo: false });
  assert.strictEqual(r.fields.withVideo, false);
});

test("defaults withVideo to true when the client omits it", () => {
  const r = buildUserFieldsFromGooglePayload(payload(), {});
  assert.strictEqual(r.fields.withVideo, true);
});

test("never returns a password field", () => {
  const r = buildUserFieldsFromGooglePayload(payload(), { withVideo: true });
  assert.strictEqual("password" in r.fields, false);
});

test("tolerates a missing name and picture", () => {
  const r = buildUserFieldsFromGooglePayload(
    payload({ name: undefined, picture: undefined }),
    {}
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fields.name, "");
  assert.strictEqual(r.fields.profilePicture, "");
});
