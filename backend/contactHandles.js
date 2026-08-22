// contactHandles.js - keeps the bio from defeating unlinkability.
//
// Profiles are shown to strangers on a live video call. Every other field is
// non-identifying by construction; the bio is free text, so it is the one place
// a user can hand over a way to find them afterwards.
//
// This errs toward rejecting: a false rejection costs a rephrase, a false
// accept costs the guarantee. It reduces casual leakage — it cannot stop
// someone reading their handle aloud on camera, and is not meant to.

const PLATFORMS =
  "ig|insta|instagram|snap|snapchat|tg|telegram|discord|fb|facebook|twitter|whatsapp|wa";

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// "me at gmail dot com"
const OBFUSCATED_EMAIL = /\b[a-z0-9._%+-]+\s+at\s+[a-z0-9.-]+\s+dot\s+[a-z]{2,}\b/i;
// "@handle" — needs two or more characters straight after the @, so "at @ 5"
// and a lone "@" do not trip it.
const AT_HANDLE = /(?:^|[^\w@])@[a-z0-9._]{2,}/i;
const PLATFORM_HANDLE = new RegExp(
  `\\b(?:${PLATFORMS})\\b\\s*(?:is|:|-|–|—)?\\s*@?[a-z0-9._]{3,}`,
  "i"
);

// A digit run totalling ten or more digits. Counting digits rather than
// matching a length of mixed characters keeps "2026-08-22" (eight digits) and
// "chess rating 1200" from being read as phone numbers.
function findPhone(text) {
  const runs = String(text).match(/\d[\d\s()+-]{7,}\d/g) || [];
  return runs.some((run) => run.replace(/\D/g, "").length >= 10);
}

/**
 * @returns {"social handle"|"phone number"|"email address"|null}
 */
function findContactHandle(text) {
  const value = String(text || "");
  if (!value.trim()) return null;

  if (EMAIL.test(value) || OBFUSCATED_EMAIL.test(value)) return "email address";
  if (findPhone(value)) return "phone number";
  if (AT_HANDLE.test(value) || PLATFORM_HANDLE.test(value)) return "social handle";
  return null;
}

module.exports = { findContactHandle };
