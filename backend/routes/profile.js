// routes/profile.js - read and write the current user's profile.
const express = require("express");
const { authMiddleware } = require("../middleware/auth.js");
const { sanitizeProfileInput, AGE_BANDS, GENDERS } = require("../profileFields.js");
const {
  INTEREST_GROUPS,
  isKnownInterest,
  labelForInterest,
} = require("../interests.js");
const { moderateMessage } = require("../moderation.js");

const router = express.Router();

// The suggestions the picker offers. Public: it is a static list. It no longer
// bounds what the backend will accept — anything can be an interest — so this
// is a starting point for the picker, not a contract.
router.get("/options", (req, res) => {
  res.json({ ageBands: AGE_BANDS, genders: GENDERS, groups: INTEREST_GROUPS });
});

router.get("/", authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    isAdultConfirmed: Boolean(u.isAdultConfirmed),
    profile: {
      ageBand: u.profile?.ageBand || "",
      countryCode: u.profile?.countryCode || "",
      city: u.profile?.city || u.profile?.region || "",
      gender: u.profile?.gender || "",
      interests: u.profile?.interests || [],
      bio: u.profile?.bio || "",
    },
  });
});

router.put("/", authMiddleware, async (req, res) => {
  const { confirmAdult, ...fields } = req.body || {};

  const result = sanitizeProfileInput(fields);
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }

  // The bio is user-authored text shown to strangers, which is exactly what the
  // chat moderation gate is for. sanitizeProfileInput is pure and synchronous,
  // so this lives here rather than inside it. Gate 2 fails open, same as chat.
  if (result.profile.bio) {
    const verdict = await moderateMessage(result.profile.bio);
    if (!verdict.ok) {
      return res
        .status(400)
        .json({ error: "moderation didn't like that bio. try rewording it" });
    }
  }

  // Interests are free text now, so a tag outside the vocabulary is the same
  // kind of content as a bio and gets the same gate. Only the typed ones are
  // sent, joined into a single string, so a full board of eight costs one Groq
  // call rather than eight. Fails open, same as chat.
  const typedTags = (result.profile.interests || []).filter(
    (slug) => !isKnownInterest(slug)
  );
  if (typedTags.length > 0) {
    const verdict = await moderateMessage(typedTags.map(labelForInterest).join(", "));
    if (!verdict.ok) {
      return res
        .status(400)
        .json({ error: "moderation didn't like one of those interests. try another word" });
    }
  }

  const user = req.user;

  if (confirmAdult === true && !user.isAdultConfirmed) {
    user.isAdultConfirmed = true;
    user.adultConfirmedAt = new Date();
  }

  user.profile = { ...(user.profile?.toObject?.() || {}), ...result.profile };
  user.profile.updatedAt = new Date();

  try {
    await user.save();
  } catch (err) {
    console.error("Failed to save profile:", err.message);
    return res.status(500).json({ error: "that didn't save. try again" });
  }

  res.json({ success: true, profile: user.profile });
});

module.exports = router;
