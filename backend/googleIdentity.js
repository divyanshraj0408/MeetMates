// googleIdentity.js - turn a verified Google ID-token payload into the fields
// we persist. Kept free of network and database calls so the rules below are
// testable; token verification stays in the route.

/**
 * @param {object} payload  the decoded Google ID token payload
 * @param {object} options  { withVideo } from the client request
 * @returns {{ok:true, fields:object} | {ok:false, reason:string}}
 */
function buildUserFieldsFromGooglePayload(payload = {}, options = {}) {
  // The password path normalized; this one did not, so a payload differing
  // only in case created a second account for the same person.
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "Email not provided by Google" };

  // Google sends email_verified false for some federated Workspace accounts.
  // Only an explicit false is a rejection; absent is treated as verified,
  // since Google omits it on some legacy payloads.
  if (payload.email_verified === false) {
    return { ok: false, reason: "This Google account's email is not verified" };
  }

  return {
    ok: true,
    fields: {
      email,
      name: payload.name || "",
      googleId: payload.sub,
      profilePicture: payload.picture || "",
      isGoogleUser: true,
      isVerified: true,
      // ?? not ||: `withVideo || true` is always true, so opting out of video
      // never took effect.
      withVideo: options.withVideo ?? true,
    },
  };
}

module.exports = { buildUserFieldsFromGooglePayload };
