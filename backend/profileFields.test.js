const { test } = require("node:test");
const assert = require("node:assert");
const { sanitizeProfileInput, AGE_BANDS, GENDERS } = require("./profileFields");

test("accepts a complete, valid profile", () => {
  const r = sanitizeProfileInput({
    ageBand: "22-25",
    country: "India",
    region: "Delhi",
    gender: "man",
    interests: ["cricket", "coding"],
    bio: "3rd year, indie rock, terrible at FIFA",
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.profile.ageBand, "22-25");
  assert.deepStrictEqual(r.profile.interests, ["cricket", "coding"]);
});

test("accepts an entirely empty profile — every field is optional", () => {
  const r = sanitizeProfileInput({});
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.profile, {});
});

test("omitting interests leaves them untouched rather than wiping them", () => {
  // The route merges this over the stored profile, so returning [] here would
  // erase a user's interests on any update that did not resend them — which
  // Onboarding's "Skip for now" does.
  const r = sanitizeProfileInput({ bio: "just changing my bio" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual("interests" in r.profile, false);
});

test("an explicitly empty interests array does clear them", () => {
  const r = sanitizeProfileInput({ interests: [] });
  assert.deepStrictEqual(r.profile.interests, []);
});

test("treats empty strings as cleared fields, so a user can un-say something", () => {
  const r = sanitizeProfileInput({ gender: "", bio: "" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.profile.gender, "");
  assert.strictEqual(r.profile.bio, "");
});

test("rejects an unknown age band", () => {
  const r = sanitizeProfileInput({ ageBand: "12-15" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /age/i);
});

test("rejects an unknown gender", () => {
  const r = sanitizeProfileInput({ gender: "attack helicopter" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /list/i);
});

test("accepts an interest that is not in the vocabulary", () => {
  // The list is suggestions now. Typing your own thing is the feature.
  const r = sanitizeProfileInput({ interests: ["cricket", "Lo-fi Beats"] });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.profile.interests, ["cricket", "lo-fi-beats"]);
});

test("normalizes a typed vocabulary word onto its existing slug", () => {
  // Otherwise two people with the same interest would be stored differently
  // depending on whether they tapped the suggestion or typed it out.
  const r = sanitizeProfileInput({ interests: ["Music Production"] });
  assert.deepStrictEqual(r.profile.interests, ["music-production"]);
});

test("drops tags that normalize to nothing instead of failing the save", () => {
  const r = sanitizeProfileInput({ interests: ["chess", "!!!", "   ", "🔥"] });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.profile.interests, ["chess"]);
});

test("rejects a contact handle hidden in a typed interest", () => {
  // A free-text tag is a text box a stranger reads. Same rule as the bio.
  const r = sanitizeProfileInput({ interests: ["snapchat shreya04"] });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /social handle/);
});

test("does not read a handle into ordinary typed interests", () => {
  // False positives are what make a filter hated. None of these are handles.
  const r = sanitizeProfileInput({
    interests: ["fb marketplace", "ig photography", "wa tourism"],
  });
  assert.strictEqual(r.ok, true, r.reason);
});

test("rejects more than eight interests", () => {
  const nine = [
    "indie", "hip-hop", "classical", "pop", "metal",
    "anime", "k-drama", "movies", "sitcoms",
  ];
  const r = sanitizeProfileInput({ interests: nine });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /8|eight/i);
});

test("collapses duplicate interests rather than rejecting them", () => {
  // Including duplicates that only look different before normalizing, which is
  // now the common case: tap the "Cricket" suggestion, then type "cricket".
  const r = sanitizeProfileInput({
    interests: ["cricket", "cricket", "Cricket", " CRICKET ", "coding"],
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.profile.interests, ["cricket", "coding"]);
});

test("rejects a bio over 200 characters", () => {
  const r = sanitizeProfileInput({ bio: "a".repeat(201) });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /200/);
});

test("rejects a bio containing a contact handle, and says which kind", () => {
  const r = sanitizeProfileInput({ bio: "hmu on ig: divyansh" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /social handle/i);
});

test("trims whitespace from text fields", () => {
  const r = sanitizeProfileInput({ bio: "  hello  " });
  assert.strictEqual(r.profile.bio, "hello");
});

test("never returns a field the caller did not send", () => {
  const r = sanitizeProfileInput({ bio: "hi" });
  assert.strictEqual("name" in r.profile, false);
  assert.strictEqual("email" in r.profile, false);
});

test("exposes the bands and genders the UI needs", () => {
  assert.ok(AGE_BANDS.includes("18-21"));
  assert.ok(GENDERS.includes("prefer not to say"));
});

const { normalizeCity } = require("./profileFields");

test("normalizeCity trims, collapses whitespace and title-cases", () => {
  assert.strictEqual(normalizeCity("  new  DELHI "), "New Delhi");
  assert.strictEqual(normalizeCity("delhi"), "Delhi");
  assert.strictEqual(normalizeCity("SÃO PAULO"), "São Paulo");
});

test("normalizeCity leaves already-clean input alone", () => {
  assert.strictEqual(normalizeCity("Delhi"), "Delhi");
  assert.strictEqual(normalizeCity("New Delhi"), "New Delhi");
});

test("normalizeCity keeps hyphens and apostrophes, drops other punctuation", () => {
  assert.strictEqual(normalizeCity("stoke-on-trent"), "Stoke-On-Trent");
  assert.strictEqual(normalizeCity("n'djamena"), "N'Djamena");
  assert.strictEqual(normalizeCity("Delhi!!! 110085"), "Delhi");
});

test("normalizeCity handles empty and rubbish input", () => {
  assert.strictEqual(normalizeCity(""), "");
  assert.strictEqual(normalizeCity("   "), "");
  assert.strictEqual(normalizeCity(undefined), "");
  assert.strictEqual(normalizeCity("!!!"), "");
});

test("accepts a valid country code and normalises the city", () => {
  const r = sanitizeProfileInput({ countryCode: "IN", city: "  new delhi " });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.profile.countryCode, "IN");
  assert.strictEqual(r.profile.city, "New Delhi");
});

test("rejects an unknown country code", () => {
  const r = sanitizeProfileInput({ countryCode: "XX" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /country/i);
});

test("rejects a country name where a code belongs", () => {
  const r = sanitizeProfileInput({ countryCode: "India" });
  assert.strictEqual(r.ok, false);
});

test("an empty country code clears the field", () => {
  const r = sanitizeProfileInput({ countryCode: "" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.profile.countryCode, "");
});

test("no longer accepts the old free-text country and region", () => {
  const r = sanitizeProfileInput({ country: "India", region: "Delhi" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual("country" in r.profile, false);
  assert.strictEqual("region" in r.profile, false);
});
