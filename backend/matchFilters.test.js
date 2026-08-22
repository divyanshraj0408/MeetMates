const { test } = require("node:test");
const assert = require("node:assert");
const {
  sanitizeFilters,
  accepts,
  canPairByFilters,
  NO_GENDER_FILTER,
  LOCATION_WORLDWIDE,
  LOCATION_COUNTRY,
  FILTERABLE_GENDERS,
  WILDCARD_GENDERS,
} = require("./matchFilters.js");

const anyone = { gender: NO_GENDER_FILTER, location: LOCATION_WORLDWIDE };
const wantsWomen = { gender: "woman", location: LOCATION_WORLDWIDE };
const sameCountry = { gender: NO_GENDER_FILTER, location: LOCATION_COUNTRY };

test("sanitizeFilters falls back to no filter for anything unrecognised", () => {
  // The filter arrives over a socket from a client we do not control.
  assert.deepStrictEqual(sanitizeFilters({ gender: "wizard", location: "moon" }), anyone);
  assert.deepStrictEqual(sanitizeFilters({}), anyone);
  assert.deepStrictEqual(sanitizeFilters(null), anyone);
  assert.deepStrictEqual(sanitizeFilters(undefined), anyone);
});

test("sanitizeFilters keeps the values the chips can produce", () => {
  assert.deepStrictEqual(sanitizeFilters({ gender: "man", location: "country" }), {
    gender: "man",
    location: LOCATION_COUNTRY,
  });
  assert.deepStrictEqual(sanitizeFilters({ gender: "woman", location: "worldwide" }), {
    gender: "woman",
    location: LOCATION_WORLDWIDE,
  });
});

test("no filter accepts everyone", () => {
  assert.strictEqual(accepts(anyone, {}, { gender: "man", countryCode: "US" }), true);
  assert.strictEqual(accepts(anyone, {}, { gender: "non-binary", countryCode: "" }), true);
});

test("a gender filter rejects a mismatch", () => {
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "man" }), false);
});

test("a gender filter accepts a match", () => {
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "woman" }), true);
});

test("an unset gender is a wildcard", () => {
  // Most accounts have no profile filled in. Excluding them would empty the pool.
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "" }), true);
});

test("'prefer not to say' is a wildcard, exactly like unset", () => {
  // Chosen to avoid being sorted on. A hard non-match would hide them from
  // every filtering user, which is the opposite of what they asked for.
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "prefer not to say" }), true);
});

test("'non-binary' is a real answer, not a wildcard", () => {
  // Reachable via "Anybody" only. A known limit of a three-state chip.
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "non-binary" }), false);
  assert.strictEqual(accepts(anyone, {}, { gender: "non-binary" }), true);
});

test("same-country matches on the country code", () => {
  const self = { gender: "", countryCode: "IN" };
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "IN" }), true);
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "US" }), false);
});

test("an unset country is a wildcard", () => {
  const self = { gender: "", countryCode: "IN" };
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "" }), true);
});

test("same-country behaves as worldwide when the searcher has no country", () => {
  // Nothing to compare against, so the filter cannot mean anything.
  const self = { gender: "", countryCode: "" };
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "US" }), true);
});

test("a pair needs both sides to accept, in either order", () => {
  const woman = { filter: anyone, attrs: { gender: "woman", countryCode: "IN" } };
  const man = { filter: anyone, attrs: { gender: "man", countryCode: "IN" } };
  const manWantingWomen = { filter: wantsWomen, attrs: { gender: "man", countryCode: "IN" } };

  assert.strictEqual(canPairByFilters(woman, man), true);
  assert.strictEqual(canPairByFilters(manWantingWomen, woman), true);
  // The filtering side is rejected whichever argument position it occupies.
  assert.strictEqual(canPairByFilters(manWantingWomen, man), false);
  assert.strictEqual(canPairByFilters(man, manWantingWomen), false);
});

test("a missing filter or attrs record does not throw", () => {
  // A socket can reach the loop before its profile read has resolved.
  assert.strictEqual(canPairByFilters({}, {}), true);
  assert.strictEqual(accepts(undefined, undefined, undefined), true);
});

const { GENDERS } = require("./profileFields.js");

test("the filter vocabulary stays a subset of the stored genders", () => {
  // matchFilters deliberately does not import profileFields — staying pure
  // keeps interests, contactHandles and countries out of the matching path.
  // The cost is duplicated string literals, and the failure they invite is
  // silent: rename a value in profileFields and every filter would reject
  // everyone, with all 127 tests still green. This is the guard for that.
  for (const gender of FILTERABLE_GENDERS) {
    assert.ok(GENDERS.includes(gender), `${gender} is not a stored gender`);
  }

  // "" means "no answer", so it is the one wildcard with no counterpart.
  for (const gender of WILDCARD_GENDERS.filter(Boolean)) {
    assert.ok(GENDERS.includes(gender), `${gender} is not a stored gender`);
  }

  // "non-binary" is deliberately neither: it is a real answer, so it is not a
  // wildcard, and the chip has no state for it, so it is not filterable. The
  // consequence — non-binary users are reachable only by someone searching
  // "Anybody" — is a known limit recorded in the spec.
  const DELIBERATELY_NEITHER = ["non-binary"];

  // Every other stored gender must be one or the other. A value added to
  // profileFields with no decision made here would otherwise be silently
  // unmatchable by everyone using a filter, and no test would say so.
  for (const gender of GENDERS) {
    if (DELIBERATELY_NEITHER.includes(gender)) continue;
    assert.ok(
      FILTERABLE_GENDERS.includes(gender) || WILDCARD_GENDERS.includes(gender),
      `${gender} is neither filterable nor a wildcard — decide which in matchFilters.js`
    );
  }
});
