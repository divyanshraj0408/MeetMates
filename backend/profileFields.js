// profileFields.js - the rules for a valid profile update, kept pure so they
// can be tested without a database or a request.
const { isKnownInterest, MAX_INTERESTS } = require("./interests.js");
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
    // Duplicates are a UI slip, not a user error — collapse rather than reject.
    const unique = [...new Set(raw.map((s) => String(s)))];
    const unknown = unique.find((s) => !isKnownInterest(s));
    if (unknown) return fail(`don't know what "${unknown}" is`);
    if (unique.length > MAX_INTERESTS) {
      return fail(`${MAX_INTERESTS} is the limit, pick your favourites`);
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
