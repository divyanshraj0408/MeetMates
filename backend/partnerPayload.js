// partnerPayload.js - everything a matched partner is allowed to see.
//
// Built field by field on purpose. Spreading a user document here is how
// senderEmail reached every 1:1 message, and how a stray GET /api/profile
// returned an email and a photo. One function, one test, one place to check.

const PARTNER_FIELDS = [
  "ageBand",
  "countryCode",
  "city",
  "gender",
  "interests",
  "bio",
];

function buildPartnerPayload(profile) {
  const p = profile || {};
  return {
    ageBand: p.ageBand || "",
    countryCode: p.countryCode || "",
    // `region` predates structured location. Nothing should still have it,
    // but reading it costs a line and losing someone's city costs trust.
    city: p.city || p.region || "",
    gender: p.gender || "",
    interests: Array.isArray(p.interests) ? [...p.interests] : [],
    bio: p.bio || "",
  };
}

module.exports = { buildPartnerPayload, PARTNER_FIELDS };
