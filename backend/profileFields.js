// profileFields.js - the rules for a valid profile update, kept pure so they
// can be tested without a database or a request.
const { isKnownInterest, MAX_INTERESTS } = require("./interests.js");
const { findContactHandle } = require("./contactHandles.js");

const AGE_BANDS = ["18-21", "22-25", "26-30", "31-40", "41+"];
const GENDERS = ["man", "woman", "non-binary", "prefer not to say"];
const MAX_BIO = 200;
const MAX_COUNTRY = 56;
const MAX_REGION = 85;

const fail = (reason) => ({ ok: false, reason });

/**
 * Every field is optional; an empty string clears a field, so a user who fills
 * in gender and regrets it can empty it rather than only change it.
 * @returns {{ok:true, profile:object} | {ok:false, reason:string}}
 */
function sanitizeProfileInput(input = {}) {
  const profile = {};

  if ("ageBand" in input) {
    const v = String(input.ageBand || "");
    if (v && !AGE_BANDS.includes(v)) return fail("Pick an age range from the list.");
    profile.ageBand = v;
  }

  if ("gender" in input) {
    const v = String(input.gender || "");
    if (v && !GENDERS.includes(v)) return fail("Pick a gender from the list.");
    profile.gender = v;
  }

  if ("country" in input) {
    const v = String(input.country || "").trim();
    if (v.length > MAX_COUNTRY) return fail("That country name is too long.");
    profile.country = v;
  }

  if ("region" in input) {
    const v = String(input.region || "").trim();
    if (v.length > MAX_REGION) return fail("That region name is too long.");
    profile.region = v;
  }

  if ("interests" in input) {
    const raw = Array.isArray(input.interests) ? input.interests : [];
    // Duplicates are a UI slip, not a user error — collapse rather than reject.
    const unique = [...new Set(raw.map((s) => String(s)))];
    const unknown = unique.find((s) => !isKnownInterest(s));
    if (unknown) return fail(`"${unknown}" is not an interest we know.`);
    if (unique.length > MAX_INTERESTS) {
      return fail(`Pick at most ${MAX_INTERESTS} interests.`);
    }
    profile.interests = unique;
  } else {
    profile.interests = [];
  }

  if ("bio" in input) {
    const v = String(input.bio || "").trim();
    if (v.length > MAX_BIO) return fail(`Keep your bio under ${MAX_BIO} characters.`);
    const handle = findContactHandle(v);
    if (handle) {
      return fail(
        `Please take the ${handle} out of your bio — Pingo keeps you unfindable ` +
          `after a call, and that undoes it.`
      );
    }
    profile.bio = v;
  }

  return { ok: true, profile };
}

module.exports = {
  sanitizeProfileInput,
  AGE_BANDS,
  GENDERS,
  MAX_BIO,
};
