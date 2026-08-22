# User Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user describe themselves — age band, country and region, gender, interests and a short bio — and show that to the person they are matched with, without ever making them findable.

**Architecture:** Two pure, heavily-tested backend modules carry the rules: a fixed interest vocabulary (mirrored to the frontend, with a parity test so the copies cannot drift) and a contact-handle detector that keeps the bio from defeating unlinkability. A `profile` subdocument hangs off `User`, served by `GET`/`PUT /api/profile`. One `ProfileForm` component backs both onboarding and editing. The partner's profile reaches the other client over the socket at pairing time, carrying profile fields only.

**Tech Stack:** Node.js, Express, Mongoose, Socket.IO, React 19 (Vite), plain CSS. Backend tests `node:test`, frontend tests `vitest`.

**Spec:** [../specs/2026-08-22-user-profiles-design.md](../specs/2026-08-22-user-profiles-design.md)

**Branch:** `main` is 13 commits ahead of `origin/main`. Branch before starting. Each task commits. **Do not push, and do not commit to `main`.**

---

## File Structure

**Backend**
- Create `backend/interests.js` — the thirty-five-tag vocabulary, grouped. Source of truth.
- Create `backend/interests.test.js` — validation plus a parity check against the frontend copy.
- Create `backend/contactHandles.js` — `findContactHandle(text)`, pure.
- Create `backend/contactHandles.test.js` — the detector's cases, positive and negative.
- Create `backend/routes/profile.js` — `GET` and `PUT /api/profile`.
- Create `backend/profileFields.js` — `sanitizeProfileInput`, pure; the rules `PUT` enforces.
- Create `backend/profileFields.test.js`.
- Modify `backend/models/User.js` — the `profile` subdocument and `isAdultConfirmed`.
- Modify `backend/server.js` — mount the profile routes; emit `partnerProfile` on pairing.

**Frontend**
- Create `frontend/src/interests.js` — mirror of the backend vocabulary.
- Create `frontend/src/components/profile/ProfileForm.jsx` — used by onboarding and editing.
- Create `frontend/src/components/profile/Onboarding.jsx` — first-run wrapper, 18+ gate.
- Create `frontend/src/components/profile/EditProfile.jsx` — edit wrapper.
- Create `frontend/src/components/profile/ProfilePanel.jsx` — the in-call panel.
- Create `frontend/src/components/profile/profile.css` — all selectors `pf-` prefixed.
- Modify `frontend/src/App.jsx` — `onboarding` and `editProfile` screens, partner profile state.
- Modify `frontend/src/components/StartingPage.jsx` — an edit-profile entry point.
- Modify `frontend/src/components/VideoChat.jsx` — render the panel.

CSS uses a `pf-` prefix for the same reason chat uses `gc-`: this app has already lost days to unscoped class names leaking between pages.

---

## Task 1: The interest vocabulary

**Files:**
- Create: `backend/interests.js`, `backend/interests.test.js`
- Create: `frontend/src/interests.js`

The list must exist in both runtimes — backend validates, frontend renders the picker — and there is no shared-module tooling here. So: the backend copy is the source of truth, the frontend copy mirrors it, and a test reads the frontend file from disk and fails if they diverge.

- [ ] **Step 1: Write the failing tests**

Create `backend/interests.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const {
  INTEREST_GROUPS,
  INTEREST_SLUGS,
  isKnownInterest,
} = require("./interests");

test("exposes thirty-five slugs across seven groups", () => {
  assert.strictEqual(INTEREST_GROUPS.length, 7);
  assert.strictEqual(INTEREST_SLUGS.length, 35);
});

test("every slug is unique and url-safe", () => {
  assert.strictEqual(new Set(INTEREST_SLUGS).size, INTEREST_SLUGS.length);
  for (const slug of INTEREST_SLUGS) {
    assert.match(slug, /^[a-z0-9-]+$/, `bad slug: ${slug}`);
  }
});

test("every group has an emoji and a non-empty tag list", () => {
  for (const group of INTEREST_GROUPS) {
    assert.ok(group.key, "group needs a key");
    assert.ok(group.emoji, `group ${group.key} needs an emoji slug`);
    assert.ok(group.tags.length > 0, `group ${group.key} has no tags`);
  }
});

test("isKnownInterest accepts real slugs and rejects anything else", () => {
  assert.strictEqual(isKnownInterest("cricket"), true);
  assert.strictEqual(isKnownInterest("underwater-basket-weaving"), false);
  assert.strictEqual(isKnownInterest(""), false);
  assert.strictEqual(isKnownInterest(undefined), false);
});

test("the frontend mirror has exactly the same slugs", () => {
  // There is no shared-module tooling in this repo, so the list is duplicated.
  // This test is what stops the two copies drifting apart.
  const mirrorPath = path.join(__dirname, "..", "frontend", "src", "interests.js");
  const source = fs.readFileSync(mirrorPath, "utf8");
  const mirrored = [...source.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);

  assert.deepStrictEqual(
    mirrored.slice().sort(),
    INTEREST_SLUGS.slice().sort(),
    "frontend/src/interests.js has drifted from backend/interests.js"
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './interests'`.

- [ ] **Step 3: Write the backend vocabulary**

Create `backend/interests.js`:

```js
// interests.js - the fixed interest vocabulary. Source of truth; mirrored in
// frontend/src/interests.js, with a parity test in interests.test.js.
//
// Fixed rather than free text: "music", "Music" and "listening to music" are
// three strings and one interest, which makes matching guesswork and gives the
// game mushy material to generate from.
//
// Emoji are slugs on em-content.zobj.net/source/apple/419/, matching the
// pattern already used in StartingPage.jsx. One per group, not per tag —
// thirty-five emoji is noise, seven reads as structure.
const INTEREST_GROUPS = [
  {
    key: "music",
    label: "Music",
    emoji: "musical-note_1f3b5",
    tags: [
      { slug: "indie", label: "Indie" },
      { slug: "hip-hop", label: "Hip-hop" },
      { slug: "classical", label: "Classical" },
      { slug: "pop", label: "Pop" },
      { slug: "metal", label: "Metal" },
    ],
  },
  {
    key: "screen",
    label: "Screen",
    emoji: "popcorn_1f37f",
    tags: [
      { slug: "anime", label: "Anime" },
      { slug: "k-drama", label: "K-drama" },
      { slug: "movies", label: "Movies" },
      { slug: "sitcoms", label: "Sitcoms" },
    ],
  },
  {
    key: "play",
    label: "Play",
    emoji: "video-game_1f3ae",
    tags: [
      { slug: "cricket", label: "Cricket" },
      { slug: "football", label: "Football" },
      { slug: "gym", label: "Gym" },
      { slug: "chess", label: "Chess" },
      { slug: "valorant", label: "Valorant" },
      { slug: "bgmi", label: "BGMI" },
    ],
  },
  {
    key: "make",
    label: "Make",
    emoji: "artist-palette_1f3a8",
    tags: [
      { slug: "coding", label: "Coding" },
      { slug: "design", label: "Design" },
      { slug: "photography", label: "Photography" },
      { slug: "writing", label: "Writing" },
      { slug: "music-production", label: "Music production" },
    ],
  },
  {
    key: "mind",
    label: "Mind",
    emoji: "brain_1f9e0",
    tags: [
      { slug: "books", label: "Books" },
      { slug: "history", label: "History" },
      { slug: "space", label: "Space" },
      { slug: "startups", label: "Startups" },
      { slug: "finance", label: "Finance" },
    ],
  },
  {
    key: "out",
    label: "Out",
    emoji: "airplane_2708-fe0f",
    tags: [
      { slug: "travel", label: "Travel" },
      { slug: "food", label: "Food" },
      { slug: "cafes", label: "Cafes" },
      { slug: "trekking", label: "Trekking" },
      { slug: "biking", label: "Biking" },
    ],
  },
  {
    key: "other",
    label: "Other",
    emoji: "sparkles_2728",
    tags: [
      { slug: "pets", label: "Pets" },
      { slug: "fashion", label: "Fashion" },
      { slug: "standup", label: "Standup" },
      { slug: "politics", label: "Politics" },
      { slug: "languages", label: "Languages" },
    ],
  },
];

const INTEREST_SLUGS = INTEREST_GROUPS.flatMap((g) => g.tags.map((t) => t.slug));
const INTEREST_SET = new Set(INTEREST_SLUGS);

function isKnownInterest(slug) {
  return typeof slug === "string" && INTEREST_SET.has(slug);
}

const MAX_INTERESTS = 8;

module.exports = {
  INTEREST_GROUPS,
  INTEREST_SLUGS,
  isKnownInterest,
  MAX_INTERESTS,
};
```

- [ ] **Step 4: Write the frontend mirror**

Produce the mirror mechanically rather than retyping it, so the two cannot
differ by a typo:

```bash
cd /Users/divyanshraj/Geeky/MeetMates
cp backend/interests.js frontend/src/interests.js
```

Then make exactly these four edits to `frontend/src/interests.js`:

1. Change the first comment line to
   `// interests.js - mirror of backend/interests.js. Kept in step by the parity`
   `// test in backend/interests.test.js. Edit the backend copy first.`
2. Change `const INTEREST_GROUPS = [` to `export const INTEREST_GROUPS = [`.
3. Replace these three lines:

```js
const INTEREST_SLUGS = INTEREST_GROUPS.flatMap((g) => g.tags.map((t) => t.slug));
const INTEREST_SET = new Set(INTEREST_SLUGS);
```

with:

```js
export const INTEREST_SLUGS = INTEREST_GROUPS.flatMap((g) =>
  g.tags.map((t) => t.slug)
);
export const MAX_INTERESTS = 8;
export const EMOJI_BASE = "https://em-content.zobj.net/source/apple/419";
```

4. Delete the `isKnownInterest` function, the `const MAX_INTERESTS = 8;` line and
   the whole `module.exports = { ... };` block — the frontend only renders the
   picker, it does not validate.

The parity test compares slugs only, so labels and grouping stay in sync by
hand — but the slugs are what storage and matching depend on, and those are
guarded.

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && npm test`
Expected: 61 tests pass (56 existing + 5 new).

- [ ] **Step 6: Prove the parity test actually catches drift**

Temporarily change one slug in `frontend/src/interests.js` (for example `cricket` to `crickett`), run `cd backend && npm test`, and confirm the parity test FAILS. Then change it back and confirm it passes again.

A guard that cannot fail is not a guard. Report both outcomes.

- [ ] **Step 7: Commit**

```bash
git add backend/interests.js backend/interests.test.js frontend/src/interests.js
git commit -m "feat: add the fixed interest vocabulary"
```

---

## Task 2: The contact-handle detector

**Files:**
- Create: `backend/contactHandles.js`, `backend/contactHandles.test.js`

Every other profile field is non-identifying by construction. The bio is not: one user writing "IG: @divyansh" defeats unlinkability entirely — no attacker involved, just someone being friendly. This is the piece protecting that.

It errs toward rejecting, because a false rejection costs a rephrase and a false accept costs the guarantee.

- [ ] **Step 1: Write the failing tests**

Create `backend/contactHandles.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { findContactHandle } = require("./contactHandles");

const flags = (text) => findContactHandle(text) !== null;

test("catches an @handle", () => {
  assert.strictEqual(flags("hmu @divyansh"), true);
  assert.strictEqual(flags("@divyansh_raj"), true);
});

test("catches a named platform followed by a handle", () => {
  assert.strictEqual(flags("ig: divyansh"), true);
  assert.strictEqual(flags("insta divyansh"), true);
  assert.strictEqual(flags("snap - divyansh"), true);
  assert.strictEqual(flags("telegram: dr0408"), true);
  assert.strictEqual(flags("my discord is dr0408"), true);
});

test("catches a phone number in several shapes", () => {
  assert.strictEqual(flags("9876543210"), true);
  assert.strictEqual(flags("+91 98765 43210"), true);
  assert.strictEqual(flags("call me on 98765-43210"), true);
});

test("catches a plain and an obfuscated email", () => {
  assert.strictEqual(flags("divyansh@gmail.com"), true);
  assert.strictEqual(flags("me at gmail dot com"), true);
});

test("does not flag ordinary bios", () => {
  const fine = [
    "3rd year, into indie rock and terrible at FIFA",
    "email me later maybe",
    "at the gym at 5",
    "born in 2004, still figuring it out",
    "I rate every cafe out of 10",
    "chess rating 1200 and falling",
    "ask me about space",
  ];
  for (const bio of fine) {
    assert.strictEqual(flags(bio), false, `false positive on: ${bio}`);
  }
});

test("returns the kind of thing it found, for the error message", () => {
  assert.strictEqual(findContactHandle("ig: divyansh"), "social handle");
  assert.strictEqual(findContactHandle("9876543210"), "phone number");
  assert.strictEqual(findContactHandle("me@gmail.com"), "email address");
  assert.strictEqual(findContactHandle("hello there"), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './contactHandles'`.

- [ ] **Step 3: Write the implementation**

Create `backend/contactHandles.js`:

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm test`
Expected: 67 tests pass (61 + 6 new).

If any "does not flag ordinary bios" case fails, the detector is too aggressive — loosen that pattern rather than deleting the test. Those negatives are the guard against a filter that annoys every honest user.

- [ ] **Step 5: Commit**

```bash
git add backend/contactHandles.js backend/contactHandles.test.js
git commit -m "feat: detect contact handles in profile bios"
```

---

## Task 3: Profile field rules

**Files:**
- Create: `backend/profileFields.js`, `backend/profileFields.test.js`

`PUT /api/profile` needs one place that decides what a valid profile update is. Keeping it pure means the rules are testable without a database or a request.

- [ ] **Step 1: Write the failing tests**

Create `backend/profileFields.test.js`:

```js
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
  assert.deepStrictEqual(r.profile.interests, []);
});

test("treats empty strings as cleared fields, so a user can un-say something", () => {
  const r = sanitizeProfileInput({ gender: "", region: "", bio: "" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.profile.gender, "");
  assert.strictEqual(r.profile.region, "");
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
  assert.match(r.reason, /gender/i);
});

test("rejects unknown interest slugs", () => {
  const r = sanitizeProfileInput({ interests: ["cricket", "not-a-real-tag"] });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /interest/i);
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
  const r = sanitizeProfileInput({ interests: ["cricket", "cricket", "coding"] });
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
  const r = sanitizeProfileInput({ country: "  India  ", bio: "  hello  " });
  assert.strictEqual(r.profile.country, "India");
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './profileFields'`.

- [ ] **Step 3: Write the implementation**

Create `backend/profileFields.js`:

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm test`
Expected: 80 tests pass (67 + 13 new).

- [ ] **Step 5: Commit**

```bash
git add backend/profileFields.js backend/profileFields.test.js
git commit -m "feat: add profile field validation rules"
```

---

## Task 4: Schema and API

**Files:**
- Modify: `backend/models/User.js`
- Create: `backend/routes/profile.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Add the profile subdocument**

In `backend/models/User.js`, add these fields to the schema, directly after the existing `withVideo` field:

```js
  // The 18+ gate. A checkbox, not a date of birth: the gate does the enforcing,
  // so the exact number is never needed, and data not held cannot leak.
  isAdultConfirmed: {
    type: Boolean,
    default: false,
  },
  adultConfirmedAt: {
    type: Date,
  },

  // Shown to the person you are matched with. Deliberately contains nothing
  // that could be used to find you afterwards — see the design spec.
  profile: {
    ageBand: { type: String, default: "" },
    country: { type: String, trim: true, maxlength: 56, default: "" },
    region: { type: String, trim: true, maxlength: 85, default: "" },
    gender: { type: String, default: "" },
    interests: { type: [String], default: [] },
    bio: { type: String, trim: true, maxlength: 200, default: "" },
    updatedAt: { type: Date },
  },
```

Enum validation lives in `profileFields.js` rather than the schema, so the API can return a readable message instead of a Mongoose validation error.

- [ ] **Step 2: Create the routes**

Create `backend/routes/profile.js`:

```js
// routes/profile.js - read and write the current user's profile.
const express = require("express");
const { authMiddleware } = require("../middleware/auth.js");
const { sanitizeProfileInput, AGE_BANDS, GENDERS } = require("../profileFields.js");
const { INTEREST_GROUPS } = require("../interests.js");
const { moderateMessage } = require("../moderation.js");

const router = express.Router();

// The vocabulary the picker renders. Public: it is a static list, and serving
// it means the frontend cannot drift from what the backend will accept.
router.get("/options", (req, res) => {
  res.json({ ageBands: AGE_BANDS, genders: GENDERS, groups: INTEREST_GROUPS });
});

router.get("/", authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    isAdultConfirmed: Boolean(u.isAdultConfirmed),
    profile: {
      ageBand: u.profile?.ageBand || "",
      country: u.profile?.country || "",
      region: u.profile?.region || "",
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
        .json({ error: "That bio was blocked by moderation. Try rewording it." });
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
    return res.status(500).json({ error: "Could not save your profile." });
  }

  res.json({ success: true, profile: user.profile });
});

module.exports = router;
```

- [ ] **Step 3: Mount the routes**

In `backend/server.js`, next to the existing `authRoutes` require, add:

```js
const profileRoutes = require("./routes/profile.js");
```

and next to `app.use("/api/auth", authRoutes);`, add:

```js
app.use("/api/profile", profileRoutes);
```

- [ ] **Step 4: Verify the auth import name**

`backend/middleware/auth.js` exports `{ authMiddleware, optionalAuth }`. Confirm the destructured import in `routes/profile.js` matches:

Run: `cd backend && grep -n "module.exports" middleware/auth.js`
Expected: shows `authMiddleware` among the exports. If the export shape differs, fix the import rather than the middleware.

- [ ] **Step 5: Verify tests and boot**

Run: `cd backend && npm test`
Expected: 80 tests pass.

Run: `cd backend && PORT=39999 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port 39999` then `booted`.

- [ ] **Step 6: Verify the options endpoint responds**

With a real MongoDB available, start the server normally (`npm start`) and run:

```bash
curl -s http://localhost:3001/api/profile/options | head -c 200
```

Expected: JSON containing `ageBands`, `genders` and `groups`. Then stop the server.

- [ ] **Step 7: Commit**

```bash
git add backend/models/User.js backend/routes/profile.js backend/server.js
git commit -m "feat: profile schema and API"
```

---

## Task 5: Send the partner's profile at pairing

**Files:**
- Modify: `backend/server.js`

The two people in a call are anonymous to each other and have no id to fetch by, so the profile has to be pushed at pairing time.

**This emit is the same class of risk as the `senderEmail` leak already fixed in this codebase.** It must carry profile fields only — never name, email, `googleId` or `profilePicture`.

- [ ] **Step 1: Add a profile lookup helper**

In `backend/server.js`, add this near the other helpers, after the `registerPairChat` require:

```js
const UserModel = require("./models/User.js");
const { resolveGlobalSender } = require("./socketIdentity.js");

// The profile a partner is allowed to see. Explicitly built field by field
// rather than spread from the document: a spread here is how name, email and
// googleId would quietly reach a stranger.
async function visibleProfileFor(socket) {
  try {
    const email = await resolveGlobalSender(socket);
    if (!email) return null;
    const user = await UserModel.findOne({ email }).select("profile");
    const p = user?.profile;
    if (!p) return null;
    return {
      ageBand: p.ageBand || "",
      country: p.country || "",
      region: p.region || "",
      gender: p.gender || "",
      interests: p.interests || [],
      bio: p.bio || "",
    };
  } catch (err) {
    console.error("Failed to load partner profile:", err.message);
    return null;
  }
}
```

- [ ] **Step 2: Emit on pairing**

In `createChatPair`, after the pair has been established and both sockets have been told about each other, add:

```js
  // Each side gets the other's profile. Failure is non-fatal: a call with no
  // profile panel is fine, a call that never starts is not.
  Promise.all([visibleProfileFor(socket1), visibleProfileFor(socket2)])
    .then(([p1, p2]) => {
      if (p2) socket1.emit("partnerProfile", p2);
      if (p1) socket2.emit("partnerProfile", p1);
    })
    .catch((err) => console.error("partnerProfile emit failed:", err.message));
```

Read `createChatPair` first to find where `socket1` and `socket2` are in scope and the pairing is complete. If the variables are named differently there, use the real names rather than these.

- [ ] **Step 3: Verify no identity can reach the wire**

Run: `cd backend && grep -n -A14 "async function visibleProfileFor" server.js`

Read the returned object field by field and confirm it contains exactly: `ageBand`, `country`, `region`, `gender`, `interests`, `bio`. If it contains a spread (`...p`) or any other key, fix it — that is the leak.

- [ ] **Step 4: Verify boot**

Run: `cd backend && npm test`
Expected: 80 tests pass.

Run: `cd backend && PORT=39999 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: prints `Server running on port 39999` then `booted`.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat: send the partner's profile at pairing"
```

---

## Task 6: The profile form

**Files:**
- Create: `frontend/src/components/profile/ProfileForm.jsx`
- Create: `frontend/src/components/profile/profile.css`

One form, used by both onboarding and editing. Follows the app's existing idiom: thick borders, flat saturated fills, generous radii, Apple emoji PNGs at ~20px. Interest tags read as pickable stickers, not form checkboxes.

Every selector is `pf-` prefixed — this codebase has already lost days to unscoped class names leaking between pages.

- [ ] **Step 1: Create the form**

Create `frontend/src/components/profile/ProfileForm.jsx`:

```jsx
import { useState } from "react";
import { INTEREST_GROUPS, MAX_INTERESTS, EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const AGE_BANDS = ["18-21", "22-25", "26-30", "31-40", "41+"];
const GENDERS = ["man", "woman", "non-binary", "prefer not to say"];
const MAX_BIO = 200;

const Emoji = ({ slug, alt }) => (
  <img className="pf-emoji" src={`${EMOJI_BASE}/${slug}.png`} alt={alt} />
);

function ProfileForm({ initial = {}, onSave, saving, error, submitLabel }) {
  const [ageBand, setAgeBand] = useState(initial.ageBand || "");
  const [country, setCountry] = useState(initial.country || "");
  const [region, setRegion] = useState(initial.region || "");
  const [gender, setGender] = useState(initial.gender || "");
  const [interests, setInterests] = useState(initial.interests || []);
  const [bio, setBio] = useState(initial.bio || "");

  const atLimit = interests.length >= MAX_INTERESTS;

  const toggleInterest = (slug) => {
    setInterests((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : current.length < MAX_INTERESTS
        ? [...current, slug]
        : current
    );
  };

  const submit = (event) => {
    event.preventDefault();
    onSave({ ageBand, country, region, gender, interests, bio });
  };

  return (
    <form className="pf-form" onSubmit={submit}>
      <fieldset className="pf-field">
        <legend>
          <Emoji slug="birthday-cake_1f382" alt="" /> Age
        </legend>
        <div className="pf-chips">
          {AGE_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              className={`pf-chip ${ageBand === band ? "pf-chip-on" : ""}`}
              onClick={() => setAgeBand(ageBand === band ? "" : band)}
            >
              {band}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="globe-showing-asia-australia_1f30f" alt="" /> Where you are
        </legend>
        <div className="pf-row">
          <input
            className="pf-input"
            placeholder="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={56}
          />
          <input
            className="pf-input"
            placeholder="State or city"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            maxLength={85}
          />
        </div>
        <p className="pf-hint">Keep it broad — a city, not your street.</p>
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="man_1f468" alt="" />
          <Emoji slug="woman-red-hair_1f469-200d-1f9b0" alt="" /> Gender
        </legend>
        <div className="pf-chips">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              className={`pf-chip ${gender === g ? "pf-chip-on" : ""}`}
              onClick={() => setGender(gender === g ? "" : g)}
            >
              {g}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="sparkles_2728" alt="" /> Interests
          <span className="pf-count">
            {interests.length}/{MAX_INTERESTS}
          </span>
        </legend>
        {INTEREST_GROUPS.map((group) => (
          <div key={group.key} className="pf-group">
            <p className="pf-group-label">
              <Emoji slug={group.emoji} alt="" /> {group.label}
            </p>
            <div className="pf-chips">
              {group.tags.map((tag) => {
                const on = interests.includes(tag.slug);
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    className={`pf-chip ${on ? "pf-chip-on" : ""}`}
                    onClick={() => toggleInterest(tag.slug)}
                    disabled={!on && atLimit}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="writing-hand_270d-fe0f" alt="" /> About you
        </legend>
        <textarea
          className="pf-bio"
          placeholder="One or two lines. What should someone know?"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={MAX_BIO}
        />
        <p className="pf-hint">
          {MAX_BIO - bio.length} left. No handles or numbers — Pingo keeps you
          unfindable after a call.
        </p>
      </fieldset>

      {error && (
        <p className="pf-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="pf-save" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
        <Emoji slug="high-voltage_26a1" alt="" />
      </button>
    </form>
  );
}

export default ProfileForm;
```

- [ ] **Step 2: Create the stylesheet**

Create `frontend/src/components/profile/profile.css`:

```css
/* Every selector is pf- prefixed. Unscoped chat class names leaked between
   pages in this app once already and cost days to unpick. */

.pf-form {
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 560px;
  width: 100%;
}

.pf-field {
  border: none;
  padding: 0;
  margin: 0;
}

.pf-field legend {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: "RightGrostek", sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 10px;
  color: #0d0d0d;
}

.pf-emoji {
  width: 20px;
  height: 20px;
  vertical-align: middle;
}

.pf-count {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 500;
  opacity: 0.6;
}

.pf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Stickers, not checkboxes. */
.pf-chip {
  border: 3px solid #0d0d0d;
  border-radius: 999px;
  background: #fff;
  padding: 7px 14px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.08s;
}

.pf-chip:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 2px 2px 0 #0d0d0d;
}

.pf-chip-on {
  background: #0099ff;
  color: #fff;
  box-shadow: 2px 2px 0 #0d0d0d;
}

.pf-chip:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pf-group {
  margin-bottom: 14px;
}

.pf-group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  opacity: 0.7;
  margin-bottom: 6px;
}

.pf-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.pf-input,
.pf-bio {
  flex: 1;
  min-width: 0;
  border: 3px solid #0d0d0d;
  border-radius: 10px;
  padding: 11px 13px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.95rem;
  background: #fff;
}

.pf-bio {
  width: 100%;
  min-height: 84px;
  resize: none;
}

.pf-input:focus,
.pf-bio:focus {
  outline: none;
  border-color: #0099ff;
}

.pf-hint {
  margin-top: 6px;
  font-size: 0.78rem;
  opacity: 0.6;
}

.pf-error {
  color: #d43f24;
  font-size: 0.9rem;
  font-weight: 600;
}

.pf-save {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  align-self: flex-start;
  background: #ff5ca2;
  color: #fff;
  border: 4px solid #0099ff;
  border-radius: 32px;
  padding: 13px 28px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
}

.pf-save:disabled {
  opacity: 0.6;
  cursor: default;
}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass. Nothing imports the form yet, so this only proves it parses.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/profile/ProfileForm.jsx frontend/src/components/profile/profile.css
git commit -m "feat: add the profile form"
```

---

## Task 7: Onboarding and editing

**Files:**
- Create: `frontend/src/components/profile/Onboarding.jsx`
- Create: `frontend/src/components/profile/EditProfile.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/StartingPage.jsx`

- [ ] **Step 1: Create the onboarding screen**

Create `frontend/src/components/profile/Onboarding.jsx`:

```jsx
import { useState } from "react";
import axios from "axios";
import ProfileForm from "./ProfileForm.jsx";
import { EMOJI_BASE } from "../../interests.js";
import "./profile.css";

// The 18+ box is the only thing that blocks progress. Everything else is
// skippable: a long form on first use costs users, and a half-filled profile
// still matches better than an empty one.
function Onboarding({ onDone }) {
  const [isAdult, setIsAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (fields) => {
    if (!isAdult) {
      setError("Please confirm you are 18 or over.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await axios.put(
        `${import.meta.env.VITE_BACKEND_URL}/api/profile`,
        { ...fields, confirmAdult: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const skip = () => save({});

  return (
    <div className="pf-page">
      <div className="pf-card">
        <h1 className="pf-title">
          Tell us a bit about you
          <img className="pf-emoji-lg" src={`${EMOJI_BASE}/sparkles_2728.png`} alt="" />
        </h1>
        <p className="pf-sub">
          This is what your match sees. Your name, email and photo never are.
        </p>

        <label className="pf-adult">
          <input
            type="checkbox"
            checked={isAdult}
            onChange={() => setIsAdult((on) => !on)}
          />
          <span>I confirm I am 18 or over</span>
        </label>

        <ProfileForm
          onSave={save}
          saving={saving}
          error={error}
          submitLabel="Start vibing"
        />

        <button type="button" className="pf-skip" onClick={skip} disabled={saving}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default Onboarding;
```

- [ ] **Step 2: Create the edit screen**

Create `frontend/src/components/profile/EditProfile.jsx`:

```jsx
import { useEffect, useState } from "react";
import axios from "axios";
import ProfileForm from "./ProfileForm.jsx";
import "./profile.css";

function EditProfile({ onDone, onBack }) {
  const [initial, setInitial] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const auth = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, auth)
      .then((res) => setInitial(res.data.profile || {}))
      .catch(() => setInitial({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (fields) => {
    setError("");
    setSaving(true);
    try {
      await axios.put(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, fields, auth);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!initial) return <div className="pf-page"><div className="loader" /></div>;

  return (
    <div className="pf-page">
      <div className="pf-card">
        <h1 className="pf-title">Your profile</h1>
        <ProfileForm
          initial={initial}
          onSave={save}
          saving={saving}
          error={error}
          submitLabel="Save"
        />
        <button type="button" className="pf-skip" onClick={onBack} disabled={saving}>
          Back
        </button>
      </div>
    </div>
  );
}

export default EditProfile;
```

- [ ] **Step 3: Add the page styles**

Append to `frontend/src/components/profile/profile.css`:

```css
.pf-page {
  min-height: 100vh;
  background: linear-gradient(to bottom right, #00c6ff, #0072ff);
  display: flex;
  justify-content: center;
  padding: 32px 16px;
  overflow-y: auto;
}

.pf-card {
  background: #fffaff;
  border: 4px solid #0d0d0d;
  border-radius: 18px;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.9);
  padding: 28px;
  max-width: 620px;
  width: 100%;
  height: fit-content;
}

.pf-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: "RightGrostek", sans-serif;
  font-size: 1.9rem;
  color: #ff3f80;
  margin-bottom: 6px;
}

.pf-emoji-lg {
  width: 28px;
  height: 28px;
}

.pf-sub {
  font-size: 0.9rem;
  opacity: 0.7;
  margin-bottom: 20px;
}

.pf-adult {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #ffea00;
  border: 3px solid #0d0d0d;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 22px;
  font-weight: 700;
  cursor: pointer;
}

.pf-skip {
  margin-top: 16px;
  background: none;
  border: none;
  text-decoration: underline;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.9rem;
  cursor: pointer;
  opacity: 0.7;
}
```

- [ ] **Step 4: Wire both screens into App.jsx**

Add the imports beside the other component imports:

```jsx
import Onboarding from "./components/profile/Onboarding";
import EditProfile from "./components/profile/EditProfile";
```

Add two cases to the `renderScreen` switch, beside the existing ones:

```jsx
      case "onboarding":
        return <Onboarding onDone={() => setCurrentScreen("start")} />;

      case "editProfile":
        return (
          <EditProfile
            onDone={() => setCurrentScreen("start")}
            onBack={() => setCurrentScreen("start")}
          />
        );
```

- [ ] **Step 5: Send new users to onboarding**

`Login.jsx` calls `onStart(user.email, WITH_VIDEO)`, which lands the user on `start`. New users should see onboarding first.

The Google route already returns the user object. In `frontend/src/App.jsx`, find `handleStartChat` — the function `onStart` is bound to — and at its top, before it sets the screen, add:

```jsx
    // A user who has never confirmed their age has not been through onboarding.
    if (localStorage.getItem("needsOnboarding") === "true") {
      localStorage.removeItem("needsOnboarding");
      setCurrentScreen("onboarding");
      return;
    }
```

Then in `frontend/src/components/Login.jsx`, inside `handleGoogleResponse`, directly before `onStart(user.email, WITH_VIDEO);` add:

```jsx
      if (!user.isAdultConfirmed) {
        localStorage.setItem("needsOnboarding", "true");
      }
```

And in `backend/routes/auth.js`, add `isAdultConfirmed` to the `user` object in the `/google-login` response so the frontend can read it:

```js
        isAdultConfirmed: Boolean(user.isAdultConfirmed),
```

- [ ] **Step 6: Add the edit entry point**

In `frontend/src/components/StartingPage.jsx`, add an `onEditProfile` prop to the component signature, and inside the `left-box`, directly after the closing tag of the `vibe-btn` button, add:

```jsx
          <button type="button" className="pf-edit-link" onClick={onEditProfile}>
            Edit your profile
          </button>
```

Append to `frontend/src/components/profile/profile.css`:

```css
.pf-edit-link {
  margin-top: 14px;
  background: none;
  border: none;
  color: #fff;
  text-decoration: underline;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.9rem;
  cursor: pointer;
  opacity: 0.85;
}
```

Import the stylesheet at the top of `StartingPage.jsx`:

```jsx
import "./profile/profile.css";
```

Then pass the prop from `App.jsx` to BOTH `<StartPage>` elements (the `start` and `waiting` cases):

```jsx
            onEditProfile={() => setCurrentScreen("editProfile")}
```

- [ ] **Step 7: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass.

Run: `cd frontend && grep -c "onEditProfile" src/App.jsx`
Expected: `2` — one per StartPage element.

- [ ] **Step 8: Commit**

```bash
git add frontend/src backend/routes/auth.js
git commit -m "feat: profile onboarding and editing"
```

---

## Task 8: The in-call profile panel

**Files:**
- Create: `frontend/src/components/profile/ProfilePanel.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/components/ChatRoom.jsx`, `frontend/src/components/VideoChat.jsx`

- [ ] **Step 1: Create the panel**

Create `frontend/src/components/profile/ProfilePanel.jsx`:

```jsx
import { useState } from "react";
import { INTEREST_GROUPS, EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const LABELS = Object.fromEntries(
  INTEREST_GROUPS.flatMap((g) => g.tags.map((t) => [t.slug, t.label]))
);

function ProfilePanel({ profile }) {
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  const place = [profile.region, profile.country].filter(Boolean).join(", ");
  const hasAnything =
    profile.ageBand || place || profile.gender || profile.bio ||
    (profile.interests && profile.interests.length > 0);
  if (!hasAnything) return null;

  return (
    <div className={`pf-panel ${open ? "pf-panel-open" : ""}`}>
      <button
        type="button"
        className="pf-panel-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <img
          className="pf-emoji"
          src={`${EMOJI_BASE}/identification-card_1faaa.png`}
          alt=""
        />
        {open ? "Hide" : "Who's this?"}
      </button>

      {open && (
        <div className="pf-panel-body">
          <div className="pf-panel-facts">
            {profile.ageBand && <span className="pf-fact">{profile.ageBand}</span>}
            {place && <span className="pf-fact">{place}</span>}
            {profile.gender && <span className="pf-fact">{profile.gender}</span>}
          </div>

          {profile.interests?.length > 0 && (
            <div className="pf-chips">
              {profile.interests.map((slug) => (
                <span key={slug} className="pf-chip pf-chip-static">
                  {LABELS[slug] || slug}
                </span>
              ))}
            </div>
          )}

          {profile.bio && <p className="pf-panel-bio">{profile.bio}</p>}
        </div>
      )}
    </div>
  );
}

export default ProfilePanel;
```

- [ ] **Step 2: Add the panel styles**

Append to `frontend/src/components/profile/profile.css`:

```css
.pf-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  max-width: 260px;
}

.pf-panel-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 6px 12px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.pf-panel-body {
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.78);
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-radius: 14px;
  padding: 12px;
  color: #f2f2f7;
  backdrop-filter: blur(10px);
}

.pf-panel-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.pf-fact {
  background: #0099ff;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 0.76rem;
  font-weight: 700;
}

.pf-chip-static {
  border-width: 2px;
  border-color: rgba(255, 255, 255, 0.25);
  background: transparent;
  color: #f2f2f7;
  padding: 3px 10px;
  font-size: 0.76rem;
  cursor: default;
}

.pf-chip-static:hover {
  transform: none;
  box-shadow: none;
}

.pf-panel-bio {
  margin-top: 8px;
  font-size: 0.82rem;
  line-height: 1.4;
  opacity: 0.9;
}
```

- [ ] **Step 3: Receive the profile in App.jsx**

Add state beside the other chat state:

```jsx
  const [partnerProfile, setPartnerProfile] = useState(null);
```

In the main `useEffect`, add a listener beside the other socket listeners:

```jsx
    socket.on("partnerProfile", (profile) => setPartnerProfile(profile));
```

In the cleanup block, add:

```jsx
      socket.off("partnerProfile");
```

Clear it wherever the pairing changes. Add `setPartnerProfile(null);` on the line directly after **every** `setPartnerTyping(false);` in this file — those already mark exactly the points where a pairing starts or ends.

Then pass it to `<ChatRoom>`:

```jsx
            partnerProfile={partnerProfile}
```

- [ ] **Step 4: Thread it through to the video**

In `frontend/src/components/ChatRoom.jsx`, add `partnerProfile` to the component's destructured props and pass it to `<VideoChat>`:

```jsx
              partnerProfile={partnerProfile}
```

In `frontend/src/components/VideoChat.jsx`, add `partnerProfile` to the destructured props, add the import:

```jsx
import ProfilePanel from "./profile/ProfilePanel.jsx";
```

and render it inside the remote video box — the element with `className="video-box remote-video"` — as its last child, after the `video-label`:

```jsx
          <ProfilePanel profile={partnerProfile} />
```

`.video-box` is already `position: relative`, so the panel's absolute positioning anchors to the partner's tile.

- [ ] **Step 5: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, 8 tests pass.

Run: `cd frontend && grep -c "setPartnerProfile(null)" src/App.jsx`
Expected: the same count as `grep -c "setPartnerTyping(false)" src/App.jsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: show the partner's profile during a call"
```

---

## Task 9: Manual end-to-end verification

No code. Start both servers: `cd backend && npm start`, and `cd frontend && npm run dev`.

- [ ] Sign in with a Google account that has never used Pingo. Onboarding appears before the lobby.
- [ ] The "Start vibing" button does nothing until the 18+ box is ticked, and says so.
- [ ] **Skip for now** lands in the lobby with a working account and an empty profile.
- [ ] Sign in again with the same account. Onboarding does **not** reappear.
- [ ] From the lobby, open "Edit your profile". Previously saved values are pre-filled.
- [ ] Fill every field, save, reload, reopen. Everything persisted.
- [ ] Clear a field — empty the bio, deselect gender — save, reopen. It stayed cleared.
- [ ] Try to pick a ninth interest. The remaining chips grey out at eight.
- [ ] Put `ig: divyansh` in the bio and save. It is rejected with a message naming the social handle.
- [ ] Try `9876543210`, then `me at gmail dot com`. Both rejected.
- [ ] Save a bio reading `at the gym at 5, born 2004`. It is **accepted** — false positives here are what make the filter hated.
- [ ] Put a word from `BAD_WORDS` in the bio and save. It is rejected by
      moderation with a different message than the handle rejection, proving
      both gates are wired and distinguishable.
- [ ] Pair two browsers into a call. Each sees the other's panel on the partner's video tile.
- [ ] Open the panel. Age band, place, gender, interests and bio show.
- [ ] **Devtools → Network → WS on both browsers: confirm the `partnerProfile` frame contains no `name`, `email`, `googleId` or `profilePicture`.** This is the unlinkability check and the one thing no test covers.
- [ ] A user who skipped onboarding shows no panel at all for their partner, rather than an empty one.
- [ ] Click Next. The panel clears and is replaced by the new partner's, never showing the previous one.
- [ ] Every emoji renders — no broken-image icons anywhere in the form or the panel.
- [ ] The public room still shows first names and no profile panel.
