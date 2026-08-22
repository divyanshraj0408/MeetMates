// matchAttrs.js - the only two profile fields matchmaking is allowed to know.
// Built field by field rather than spread from the user document, for the same
// reason as partnerPayload.js: a spread is how name, email and googleId quietly
// end up somewhere they should never be. This record never leaves the server.
const MATCH_FIELDS = ["gender", "countryCode"];

function buildMatchAttrs(profile) {
  const p = profile || {};
  return {
    gender: p.gender || "",
    countryCode: p.countryCode || "",
  };
}

module.exports = { buildMatchAttrs, MATCH_FIELDS };
