// profileFields.js - the rules for a valid profile update, kept pure so they
// can be tested without a database or a request.
const {
  isKnownInterest,
  labelForInterest,
  normalizeInterest,
  MAX_INTERESTS,
} = require("./interests.js");
const { findContactHandle } = require("./contactHandles.js");
const { isKnownCountryCode } = require("./countries.js");

const AGE_BANDS = ["18-21", "22-25", "26-30", "31-40", "41+"];
const GENDERS = ["man", "woman", "non-binary", "prefer not to say"];
const MAX_BIO = 200;
const MAX_CITY = 85;

const fail = (reason) => ({ ok: false, reason });

// One canonical form serves both display and matching, so no separate lowercase
// key is needed: "delhi", "Delhi " and "  new  DELHI " all land on a single
// value an index can match on.
function normalizeCity(input) {
  return String(input || "")
    .normalize("NFC")
    // Keep letters from any script, plus the punctuation real place names use.
    .replace(/[^\p{L}\p{M}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) =>
          /[-']/.test(part)
            ? part
            : part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase()
        )
        .join("")
    )
    .join(" ")
    .slice(0, MAX_CITY);
}

/**
 * Every field is optional; an empty string clears a field, so a user who fills
 * in gender and regrets it can empty it rather than only change it.
 * @returns {{ok:true, profile:object} | {ok:false, reason:string}}
 */
function sanitizeProfileInput(input = {}) {
  const profile = {};

  if ("ageBand" in input) {
    const v = String(input.ageBand || "");
    if (v && !AGE_BANDS.includes(v)) return fail("pick an age range from the list");
    profile.ageBand = v;
  }

  if ("gender" in input) {
    const v = String(input.gender || "");
    if (v && !GENDERS.includes(v)) return fail("pick one from the list");
    profile.gender = v;
  }

  if ("countryCode" in input) {
    const v = String(input.countryCode || "").trim();
    if (v && !isKnownCountryCode(v)) return fail("pick a country from the list");
    profile.countryCode = v;
  }

  if ("city" in input) {
    profile.city = normalizeCity(input.city);
  }

  if ("interests" in input) {
    const raw = Array.isArray(input.interests) ? input.interests : [];
    // Anything can be an interest now, so this normalizes rather than rejects.
    // Tags that slug down to nothing ("!!!", a lone emoji) are dropped, not
    // failed: there is no useful thing to tell someone about a tag they cannot
    // see they typed. Dedupe runs after normalizing, so "Cricket" and "cricket"
    // collapse into one — duplicates are a UI slip, not a user error.
    const unique = [...new Set(raw.map(normalizeInterest).filter(Boolean))];
    if (unique.length > MAX_INTERESTS) {
      return fail(`${MAX_INTERESTS} is the limit, pick your favourites`);
    }

    // A typed tag is user-authored text a stranger reads, so it is a place to
    // hide a handle — "insta shreya_04" is a perfectly good interest as far as
    // the schema is concerned. Only the typed ones need checking; the built-in
    // vocabulary is known-good. The AI gate runs in the route, since this
    // function is pure and synchronous.
    const typed = unique.filter((slug) => !isKnownInterest(slug));
    const handle = findContactHandle(typed.map(labelForInterest).join(", "));
    if (handle) {
      return fail(
        `take the ${handle} out of your interests — nobody can find you after a call, and that undoes it`
      );
    }

    profile.interests = unique;
  }
  // No `else`: an absent key means "unchanged", the same as every other field
  // here. Defaulting to [] made any PUT that omitted interests wipe them.

  if ("bio" in input) {
    const v = String(input.bio || "").trim();
    if (v.length > MAX_BIO) return fail(`keep it under ${MAX_BIO} characters`);
    const handle = findContactHandle(v);
    if (handle) {
      return fail(
        `take the ${handle} out — nobody can find you after a call, and that undoes it`
      );
    }
    profile.bio = v;
  }

  return { ok: true, profile };
}

module.exports = {
  sanitizeProfileInput,
  normalizeCity,
  AGE_BANDS,
  GENDERS,
  MAX_BIO,
};
