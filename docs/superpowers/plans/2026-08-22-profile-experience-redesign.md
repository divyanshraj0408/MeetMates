# Profile Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the profile from a wall of identical white pills into stepped onboarding, a single-page edit screen with a live preview of what a partner actually sees, and a sticker-sheet interest picker that sounds like the rest of Pingo.

**Architecture:** Location becomes structured — an ISO country code plus a normalised city — behind two new pure modules (`countries.js`, and `normalizeCity` in `profileFields.js`). The partner payload moves out of `server.js` into a pure, tested `buildPartnerPayload`. `ProfileForm` splits into shared field components driven by a stepped `Onboarding` and a single-page `EditProfile`, the latter carrying a sticky bar that renders the real `ProfilePanel` from the same six fields the socket emits.

**Tech Stack:** Node.js, Express, Mongoose, Socket.IO, React 19 (Vite), plain CSS. Backend tests `node:test`, frontend tests `vitest`, layout verified with Playwright.

**Spec:** [../specs/2026-08-22-profile-experience-redesign-design.md](../specs/2026-08-22-profile-experience-redesign-design.md)

**Branch:** Continue on `feat/user-profiles`. Each task commits. **Do not push, do not commit to `main`.**

**Baseline:** backend 84 tests, frontend 8 tests.

---

## One deviation from the spec, decided up front

The spec says the preview renders from "the same pure function the socket emit
uses". Taken literally that needs `buildPartnerPayload` mirrored to the frontend
— a **third** duplicated module after interests and countries, each with its own
parity test. That is more machinery than the guarantee is worth.

Instead:

- `buildPartnerPayload` is **backend-only**, pure, and tested to emit exactly six
  keys from a full Mongoose document. That is what stops identity leaking.
- The preview passes the edit form's own state — the same six fields — into the
  **same `ProfilePanel` component** the partner sees. Shared rendering is what
  stops the preview from looking different.

Two guarantees, two mechanisms, no third mirror.

---

## File Structure

**Backend**
- Create `backend/countries.js` — ISO 3166-1 alpha-2 list, source of truth.
- Create `backend/partnerPayload.js` — `buildPartnerPayload(profile)`, pure.
- Create `backend/partnerPayload.test.js`.
- Modify `backend/profileFields.js` — `normalizeCity`, `isKnownCountryCode`, country/city rules replacing country/region.
- Modify `backend/profileFields.test.js`, `backend/interests.test.js` (country parity).
- Modify `backend/models/User.js` — `countryCode`/`city`, indexes.
- Modify `backend/server.js` — use `buildPartnerPayload`.

**Frontend**
- Create `frontend/src/countries.js` — mirror.
- Create `frontend/src/components/profile/fields/` — `AgeField`, `PlaceField`, `GenderField`, `InterestsField`, `BioField`. One field per file, each usable standalone by a step or stacked by the edit page.
- Create `frontend/src/components/profile/ProgressBar.jsx`.
- Rewrite `Onboarding.jsx` — stepped.
- Rewrite `EditProfile.jsx` — single page, sticky preview bar.
- Modify `ProfilePanel.jsx` — `countryCode`/`city`, resolve country name.
- Rewrite `profile.css`.
- Delete `ProfileForm.jsx` — replaced by the field components.

---

## Task 1: The country list

**Files:** Create `backend/countries.js`, `frontend/src/countries.js`; modify `backend/interests.test.js`.

- [ ] **Step 1: Generate the backend list**

Do not hand-type 250 entries. Create `backend/_gen-countries.cjs`:

```js
// One-off generator. Names come from Intl at generation time and are then
// frozen into a static file — resolving them at runtime would let Node and the
// browser disagree and break the parity test.
const fs = require("fs");
const CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " "
  );

const dn = new Intl.DisplayNames(["en"], { type: "region" });
const list = CODES.map((code) => ({ code, name: dn.of(code) || code })).sort(
  (a, b) => a.name.localeCompare(b.name)
);

const body = list.map((c) => `  { code: "${c.code}", name: ${JSON.stringify(c.name)} },`).join("\n");

fs.writeFileSync(
  "countries.js",
  `// countries.js - ISO 3166-1 alpha-2. Source of truth; mirrored in
// frontend/src/countries.js, with a parity test in interests.test.js.
// Written as static data rather than resolved from Intl at runtime, so the
// backend and the browser cannot disagree about a name.
const COUNTRIES = [
${body}
];

const COUNTRY_CODES = COUNTRIES.map((c) => c.code);
const COUNTRY_SET = new Set(COUNTRY_CODES);

function isKnownCountryCode(code) {
  return typeof code === "string" && COUNTRY_SET.has(code);
}

module.exports = { COUNTRIES, COUNTRY_CODES, isKnownCountryCode };
`
);
console.log("wrote", list.length, "countries");
```

Run: `cd backend && node _gen-countries.cjs && rm _gen-countries.cjs`
Expected: prints `wrote 249 countries` and leaves `backend/countries.js`.

Confirm `IN` resolves to `India` and not to a code:

Run: `cd backend && node -e "const {COUNTRIES}=require('./countries.js');console.log(COUNTRIES.find(c=>c.code==='IN'))"`
Expected: `{ code: 'IN', name: 'India' }`. If the name comes back as `IN`, this Node build lacks full ICU — stop and report rather than shipping a list of codes.

- [ ] **Step 2: Create the mirror**

```bash
cd /Users/divyanshraj/Geeky/MeetMates
cp backend/countries.js frontend/src/countries.js
```

Then in `frontend/src/countries.js` make exactly three edits:

1. Change `const COUNTRIES = [` to `export const COUNTRIES = [`.
2. Replace the `COUNTRY_CODES` / `COUNTRY_SET` / `isKnownCountryCode` block with:

```js
export const COUNTRY_BY_CODE = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.name])
);
```

3. Delete the `module.exports` line.

The frontend only renders and resolves names; validation stays server-side.

- [ ] **Step 3: Extend the parity test**

Append to `backend/interests.test.js`:

```js
const { COUNTRY_CODES } = require("./countries");

test("the frontend country mirror has exactly the same codes", () => {
  const mirrorPath = path.join(__dirname, "..", "frontend", "src", "countries.js");
  const source = fs.readFileSync(mirrorPath, "utf8");
  const mirrored = [...source.matchAll(/code:\s*"([A-Z]{2})"/g)].map((m) => m[1]);

  assert.deepStrictEqual(
    mirrored.slice().sort(),
    COUNTRY_CODES.slice().sort(),
    "frontend/src/countries.js has drifted from backend/countries.js"
  );
});
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && npm test`
Expected: 85 tests pass (84 + 1).

- [ ] **Step 5: Prove the new guard fails on drift**

Change one country code in `frontend/src/countries.js` (for example `IN` to `XX`), run `cd backend && npm test`, confirm the country parity test FAILS, then revert and confirm it passes.

Report both outcomes. A guard nobody has watched fail is not a guard.

- [ ] **Step 6: Commit**

```bash
git add backend/countries.js frontend/src/countries.js backend/interests.test.js
git commit -m "feat: add the ISO country list"
```

---

## Task 2: City normalisation and the new location rules

**Files:** Modify `backend/profileFields.js`, `backend/profileFields.test.js`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/profileFields.test.js`:

```js
const { normalizeCity } = require("./profileFields");

test("normalizeCity trims, collapses whitespace and title-cases", () => {
  assert.strictEqual(normalizeCity("  new  DELHI "), "New Delhi");
  assert.strictEqual(normalizeCity("delhi"), "Delhi");
  assert.strictEqual(normalizeCity("SÃO PAULO"), "São Paulo");
});

test("normalizeCity leaves already-clean input alone", () => {
  assert.strictEqual(normalizeCity("Delhi"), "Delhi");
  assert.strictEqual(normalizeCity("New Delhi"), "New Delhi");
});

test("normalizeCity keeps hyphens and apostrophes, drops other punctuation", () => {
  assert.strictEqual(normalizeCity("stoke-on-trent"), "Stoke-On-Trent");
  assert.strictEqual(normalizeCity("n'djamena"), "N'Djamena");
  assert.strictEqual(normalizeCity("Delhi!!! 110085"), "Delhi");
});

test("normalizeCity handles empty and rubbish input", () => {
  assert.strictEqual(normalizeCity(""), "");
  assert.strictEqual(normalizeCity("   "), "");
  assert.strictEqual(normalizeCity(undefined), "");
  assert.strictEqual(normalizeCity("!!!"), "");
});

test("accepts a valid country code and normalises the city", () => {
  const r = sanitizeProfileInput({ countryCode: "IN", city: "  new delhi " });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.profile.countryCode, "IN");
  assert.strictEqual(r.profile.city, "New Delhi");
});

test("rejects an unknown country code", () => {
  const r = sanitizeProfileInput({ countryCode: "XX" });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /country/i);
});

test("rejects a country name where a code belongs", () => {
  const r = sanitizeProfileInput({ countryCode: "India" });
  assert.strictEqual(r.ok, false);
});

test("an empty country code clears the field", () => {
  const r = sanitizeProfileInput({ countryCode: "" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.profile.countryCode, "");
});

test("no longer accepts the old free-text country and region", () => {
  const r = sanitizeProfileInput({ country: "India", region: "Delhi" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual("country" in r.profile, false);
  assert.strictEqual("region" in r.profile, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test`
Expected: FAIL — `normalizeCity` is not exported.

- [ ] **Step 3: Implement**

In `backend/profileFields.js`, add to the requires:

```js
const { isKnownCountryCode } = require("./countries.js");
```

Add above `sanitizeProfileInput`:

```js
const MAX_CITY = 85;

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
```

Replace the `country` and `region` blocks with:

```js
  if ("countryCode" in input) {
    const v = String(input.countryCode || "").trim();
    if (v && !isKnownCountryCode(v)) return fail("Pick a country from the list.");
    profile.countryCode = v;
  }

  if ("city" in input) {
    profile.city = normalizeCity(input.city);
  }
```

Delete `MAX_COUNTRY` and `MAX_REGION`, and add `normalizeCity` to the exports.

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npm test`
Expected: 94 tests pass (85 + 9).

If the old `country`/`region` tests from the previous spec now fail, delete them — those fields no longer exist. Report which you removed.

- [ ] **Step 5: Rewrite the backend's user-facing strings**

The spec's voice table covers these too — they surface inside the new flow, so
leaving them would put "Pick an age range from the list." under a prompt reading
"how old are you?".

In `backend/profileFields.js`:

| Now | Becomes |
|-----|---------|
| `Pick an age range from the list.` | `pick an age range from the list` |
| `Pick a gender from the list.` | `pick one from the list` |
| `"{x}" is not an interest we know.` | `don't know what "{x}" is` |
| `Pick at most 8 interests.` | `eight is the limit, pick your favourites` |
| `Keep your bio under 200 characters.` | `keep it under 200 characters` |
| `Please take the {handle} out of your bio — Pingo keeps you unfindable after a call, and that undoes it.` | `take the {handle} out — nobody can find you after a call, and that undoes it` |
| `Pick a country from the list.` (added this task) | `pick a country from the list` |

In `backend/routes/profile.js`:

| Now | Becomes |
|-----|---------|
| `That bio was blocked by moderation. Try rewording it.` | `moderation didn't like that bio. try rewording it` |
| `Could not save your profile.` | `that didn't save. try again` |

Any test asserting on the old wording matches loosely (`/8|eight/i`, `/social
handle/i`), so they should still pass. If one fails on exact text, update the
test — do not revert the string.

- [ ] **Step 6: Run to verify pass**

Run: `cd backend && npm test`
Expected: 94 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/profileFields.js backend/profileFields.test.js backend/routes/profile.js
git commit -m "feat: structured country code, normalised city, and the voice rewrite"
```

---

## Task 3: The partner payload

**Files:** Create `backend/partnerPayload.js`, `backend/partnerPayload.test.js`; modify `backend/models/User.js`, `backend/server.js`, `backend/routes/profile.js`.

- [ ] **Step 1: Write the failing tests**

Create `backend/partnerPayload.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { buildPartnerPayload, PARTNER_FIELDS } = require("./partnerPayload");

test("returns exactly the six visible fields", () => {
  const out = buildPartnerPayload({
    ageBand: "22-25",
    countryCode: "IN",
    city: "Delhi",
    gender: "man",
    interests: ["cricket"],
    bio: "hi",
  });
  assert.deepStrictEqual(Object.keys(out).sort(), PARTNER_FIELDS.slice().sort());
});

test("strips identity from a full user document", () => {
  // The shape a Mongoose user actually has. This is the leak this file exists
  // to prevent — the codebase has shipped it twice before.
  const out = buildPartnerPayload({
    ageBand: "22-25",
    city: "Delhi",
    name: "Divyansh Raj",
    email: "d@gmail.com",
    googleId: "g-123",
    profilePicture: "https://example.com/p.png",
    password: "hashed",
    _id: "abc",
  });
  for (const leak of ["name", "email", "googleId", "profilePicture", "password", "_id"]) {
    assert.strictEqual(leak in out, false, `${leak} reached the partner payload`);
  }
});

test("falls back to a legacy region as the city", () => {
  // Nothing should have this shape, but being wrong about that must not lose
  // someone's location.
  const out = buildPartnerPayload({ region: "Delhi" });
  assert.strictEqual(out.city, "Delhi");
});

test("prefers city over a legacy region when both exist", () => {
  const out = buildPartnerPayload({ city: "Mumbai", region: "Delhi" });
  assert.strictEqual(out.city, "Mumbai");
});

test("returns empty strings and an empty array for a blank profile", () => {
  const out = buildPartnerPayload({});
  assert.strictEqual(out.ageBand, "");
  assert.deepStrictEqual(out.interests, []);
});

test("tolerates null and undefined", () => {
  assert.deepStrictEqual(Object.keys(buildPartnerPayload(null)).sort(), PARTNER_FIELDS.slice().sort());
  assert.deepStrictEqual(Object.keys(buildPartnerPayload(undefined)).sort(), PARTNER_FIELDS.slice().sort());
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './partnerPayload'`.

- [ ] **Step 3: Implement**

Create `backend/partnerPayload.js`:

```js
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
```

- [ ] **Step 4: Use it in server.js**

In `backend/server.js`, add to the requires:

```js
const { buildPartnerPayload } = require("./partnerPayload.js");
```

and replace the whole return block inside `visibleProfileFor`:

```js
    return {
      ageBand: p.ageBand || "",
      country: p.country || "",
      region: p.region || "",
      gender: p.gender || "",
      interests: p.interests || [],
      bio: p.bio || "",
    };
```

with:

```js
    return buildPartnerPayload(p);
```

- [ ] **Step 5: Update the schema**

In `backend/models/User.js`, replace the `country` and `region` fields inside `profile`:

```js
    country: { type: String, trim: true, maxlength: 56, default: "" },
    region: { type: String, trim: true, maxlength: 85, default: "" },
```

with:

```js
    countryCode: { type: String, trim: true, maxlength: 2, default: "" },
    city: { type: String, trim: true, maxlength: 85, default: "" },
```

and add these indexes directly above `module.exports`:

```js
// Matchmaking is an in-memory FIFO today and queries none of this. These are
// for the matching sprint; adding them now costs almost nothing and removes a
// migration later. Deliberately no compound index beyond location — the query
// shape does not exist yet, and a wrong compound is worse than none.
userSchema.index({ "profile.interests": 1 });
userSchema.index({ "profile.ageBand": 1 });
userSchema.index({ "profile.gender": 1 });
userSchema.index({ "profile.countryCode": 1, "profile.city": 1 });
```

- [ ] **Step 6: Update the profile route's GET**

In `backend/routes/profile.js`, the `GET /` handler returns the profile for the edit form. Replace its `profile` object's `country` and `region` lines with:

```js
      countryCode: u.profile?.countryCode || "",
      city: u.profile?.city || u.profile?.region || "",
```

This is the user's own profile, so it is not the partner payload — but it uses the same legacy fallback.

- [ ] **Step 7: Verify**

Run: `cd backend && npm test`
Expected: 100 tests pass (94 + 6).

Run: `cd backend && grep -n "p.country\|p.region\|profile.country\b\|profile.region" server.js routes/profile.js models/User.js`
Expected: no output except the deliberate `p.region` fallback inside `partnerPayload.js` — which this grep does not cover, so genuinely expect nothing here.

Run: `cd backend && PORT=39999 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 500)"`
Expected: `Server running on port 39999` then `booted`.

- [ ] **Step 8: Commit**

```bash
git add backend/partnerPayload.js backend/partnerPayload.test.js backend/models/User.js backend/server.js backend/routes/profile.js
git commit -m "feat: one tested builder for the partner payload"
```

---

## Task 4: The stylesheet

**Files:** Rewrite `frontend/src/components/profile/profile.css`.

Category colour is applied by a class derived from the group key —
`pf-chip-music`, `pf-chip-play` — so the mapping lives in CSS alone. No colour
is added to the vocabulary module, so the parity test is untouched.

- [ ] **Step 1: Replace the file**

Replace `frontend/src/components/profile/profile.css` entirely:

```css
/* Every selector is pf- prefixed. Unscoped component class names leaked between
   pages in this app once and cost days to unpick. */

.pf-page {
  min-height: 100dvh;
  background: linear-gradient(to bottom right, #00c6ff, #0072ff);
  display: flex;
  flex-direction: column;
  color: #0d0d0d; /* own your colour: a surface that inherits goes black-on-black */
}

/* ---------- shared controls ---------- */

.pf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.pf-chip {
  border: 3px solid #0d0d0d;
  border-radius: 999px;
  background: #fff;
  color: #0d0d0d;
  padding: 9px 16px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.09s, box-shadow 0.09s;
}

.pf-chip:hover:not(:disabled):not(.pf-chip-on) {
  transform: translate(-2px, -2px);
  box-shadow: 2px 2px 0 #0d0d0d;
}

/* Selected chips tilt. transform does not affect layout, so a wrapping row
   will not reflow as they are picked. */
.pf-chip-on {
  box-shadow: 3px 3px 0 #0d0d0d;
  transform: rotate(-2deg);
}

.pf-chip-on:nth-child(even) {
  transform: rotate(2deg);
}

.pf-chip:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Category colours. One class per interest group, four palette colours over
   seven groups. */
.pf-chip-music.pf-chip-on,
.pf-chip-mind.pf-chip-on {
  background: #ff5ca2;
  color: #fff;
}

.pf-chip-play.pf-chip-on,
.pf-chip-out.pf-chip-on {
  background: #0099ff;
  color: #fff;
}

.pf-chip-screen.pf-chip-on,
.pf-chip-other.pf-chip-on {
  background: #9b71ff;
  color: #fff;
}

.pf-chip-make.pf-chip-on {
  background: #ffea00;
  color: #0d0d0d;
}

/* Age and gender chips have no category; they take the house blue. */
.pf-chip-plain.pf-chip-on {
  background: #0099ff;
  color: #fff;
}

.pf-input,
.pf-select,
.pf-bio {
  width: 100%;
  border: 3px solid #0d0d0d;
  border-radius: 12px;
  padding: 13px 14px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 1rem;
  background: #fff;
  color: #0d0d0d;
}

.pf-select {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #0d0d0d 50%),
    linear-gradient(135deg, #0d0d0d 50%, transparent 50%);
  background-position: calc(100% - 20px) 50%, calc(100% - 14px) 50%;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-right: 40px;
}

.pf-bio {
  min-height: 110px;
  resize: none;
}

.pf-input:focus,
.pf-select:focus,
.pf-bio:focus {
  outline: none;
  border-color: #0099ff;
}

.pf-hint {
  margin-top: 8px;
  font-size: 0.82rem;
  opacity: 0.65;
}

.pf-error {
  color: #d43f24;
  font-size: 0.92rem;
  font-weight: 600;
  margin-top: 10px;
}

.pf-emoji {
  width: 20px;
  height: 20px;
  vertical-align: middle;
}

/* ---------- interests counter ---------- */

.pf-counter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 0.85rem;
  font-weight: 700;
}

.pf-dots {
  display: flex;
  gap: 5px;
}

.pf-dot {
  width: 11px;
  height: 11px;
  border: 2px solid #0d0d0d;
  border-radius: 50%;
  background: #fff;
}

.pf-dot-on {
  background: #0099ff;
}

.pf-counter-full {
  background: #ffea00;
  border: 2px solid #0d0d0d;
  border-radius: 999px;
  padding: 2px 10px;
}

.pf-group {
  margin-bottom: 18px;
}

.pf-group-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.85rem;
  font-weight: 700;
  opacity: 0.75;
  margin-bottom: 8px;
}

/* ---------- onboarding ---------- */

.pf-step {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 18px 0;
  max-width: 620px;
  width: 100%;
  margin-inline: auto;
}

.pf-progress {
  display: flex;
  gap: 5px;
  margin-bottom: 26px;
  flex: 0 0 auto;
}

.pf-progress-seg {
  flex: 1;
  height: 7px;
  border: 2px solid #0d0d0d;
  border-radius: 999px;
  background: #fff;
}

.pf-progress-seg-on {
  background: #0099ff;
}

.pf-prompt {
  font-family: "RightGrostek", sans-serif;
  font-size: clamp(2.2rem, 11vw, 3.4rem);
  line-height: 1.02;
  color: #fff;
  margin-bottom: 22px;
  flex: 0 0 auto;
}

/* The only scrolling region in a step. Its ancestors — .pf-page and .pf-step —
   both carry min-height:0, without which this grows the page instead. */
.pf-step-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 20px;
}

.pf-step-nav {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0 max(16px, env(safe-area-inset-bottom));
  background: transparent;
}

.pf-back {
  background: none;
  border: none;
  color: #fff;
  font-family: "Rethink Sans", sans-serif;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 10px 4px;
}

.pf-next {
  margin-left: auto;
  background: #ff5ca2;
  color: #fff;
  border: 4px solid #0d0d0d;
  border-radius: 32px;
  padding: 13px 32px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 4px 4px 0 #0d0d0d;
}

.pf-next:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 #0d0d0d;
}

.pf-next:disabled {
  opacity: 0.5;
  box-shadow: none;
  cursor: not-allowed;
}

.pf-gate {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #ffea00;
  border: 3px solid #0d0d0d;
  border-radius: 14px;
  padding: 16px;
  font-weight: 700;
  font-size: 1.05rem;
  cursor: pointer;
  box-shadow: 4px 4px 0 #0d0d0d;
}

.pf-gate input {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
}

/* ---------- edit page ---------- */

.pf-edit {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  max-width: 620px;
  width: 100%;
  margin-inline: auto;
}

.pf-edit-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 18px 24px;
}

.pf-edit-title {
  font-family: "RightGrostek", sans-serif;
  font-size: 2.1rem;
  color: #fff;
  margin-bottom: 4px;
}

.pf-edit-sub {
  color: #fff;
  opacity: 0.85;
  font-size: 0.92rem;
  margin-bottom: 22px;
}

.pf-field {
  background: #fffaff;
  border: 3px solid #0d0d0d;
  border-radius: 16px;
  padding: 18px;
  margin-bottom: 16px;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.55);
}

.pf-field-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: "RightGrostek", sans-serif;
  font-size: 1.15rem;
  margin-bottom: 12px;
}

/* Sticky bar: the real collapsed panel, plus save. */
.pf-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px max(12px, env(safe-area-inset-bottom));
  background: #0d0d0d;
  border-top: 3px solid #0d0d0d;
}

.pf-bar-preview {
  flex: 1;
  min-width: 0;
}

.pf-save {
  flex: 0 0 auto;
  background: #ff5ca2;
  color: #fff;
  border: 3px solid #fff;
  border-radius: 999px;
  padding: 12px 24px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.pf-save:disabled {
  opacity: 0.6;
  cursor: default;
}

.pf-sheet {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 18px;
}

.pf-sheet-inner {
  width: 100%;
  max-width: 420px;
}

/* ---------- the in-call panel ---------- */

.pf-panel {
  max-width: 280px;
  color: #f2f2f7;
}

.pf-panel-incall {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
}

.pf-panel-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 7px 13px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.pf-panel-body {
  margin-top: 9px;
  background: rgba(0, 0, 0, 0.82);
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  padding: 14px;
  color: #f2f2f7;
  backdrop-filter: blur(10px);
}

.pf-panel-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 9px;
}

.pf-fact {
  background: #0099ff;
  color: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.78rem;
  font-weight: 700;
}

.pf-panel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pf-panel-tag {
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.78rem;
}

.pf-panel-bio {
  margin-top: 9px;
  font-size: 0.85rem;
  line-height: 1.45;
  opacity: 0.92;
}

.pf-panel-empty {
  font-size: 0.85rem;
  opacity: 0.75;
}
```

- [ ] **Step 2: Confirm every selector is prefixed**

Run: `cd frontend && grep -oE '^\.[a-zA-Z][a-zA-Z0-9_-]*' src/components/profile/profile.css | grep -v '^\.pf-'`
Expected: NO output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/profile/profile.css
git commit -m "feat: profile stylesheet with category colours and sticky bar"
```

---

## Task 5: Field components

**Files:** Create five files under `frontend/src/components/profile/fields/`, plus `ProgressBar.jsx`. Delete `ProfileForm.jsx`.

Each field renders **only its control** — no heading. Onboarding supplies a
large prompt above it; the edit page supplies a small label. That is what lets
the same component serve both without a mode flag.

- [ ] **Step 1: Create `fields/AgeField.jsx`**

```jsx
export const AGE_BANDS = ["18-21", "22-25", "26-30", "31-40", "41+"];

function AgeField({ value, onChange }) {
  return (
    <div className="pf-chips">
      {AGE_BANDS.map((band) => (
        <button
          key={band}
          type="button"
          className={`pf-chip pf-chip-plain ${value === band ? "pf-chip-on" : ""}`}
          onClick={() => onChange(value === band ? "" : band)}
        >
          {band}
        </button>
      ))}
    </div>
  );
}

export default AgeField;
```

- [ ] **Step 2: Create `fields/GenderField.jsx`**

```jsx
export const GENDERS = ["man", "woman", "non-binary", "prefer not to say"];

function GenderField({ value, onChange }) {
  return (
    <div className="pf-chips">
      {GENDERS.map((g) => (
        <button
          key={g}
          type="button"
          className={`pf-chip pf-chip-plain ${value === g ? "pf-chip-on" : ""}`}
          onClick={() => onChange(value === g ? "" : g)}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

export default GenderField;
```

- [ ] **Step 3: Create `fields/PlaceField.jsx`**

```jsx
import { COUNTRIES } from "../../../countries.js";

// A native select, not a custom combobox: on mobile it already has type-ahead
// and an optimised picker, for no custom code and no accessibility risk.
function PlaceField({ countryCode, city, onChange }) {
  return (
    <>
      <select
        className="pf-select"
        value={countryCode || ""}
        onChange={(e) => onChange({ countryCode: e.target.value, city })}
      >
        <option value="">pick a country</option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      <div style={{ height: 10 }} />

      <input
        className="pf-input"
        placeholder="city"
        value={city || ""}
        onChange={(e) => onChange({ countryCode, city: e.target.value })}
        maxLength={85}
      />
      <p className="pf-hint">city is fine, street is weird</p>
    </>
  );
}

export default PlaceField;
```

- [ ] **Step 4: Create `fields/InterestsField.jsx`**

```jsx
import { INTEREST_GROUPS, MAX_INTERESTS, EMOJI_BASE } from "../../../interests.js";

function InterestsField({ value = [], onChange }) {
  const full = value.length >= MAX_INTERESTS;

  const toggle = (slug) => {
    if (value.includes(slug)) {
      onChange(value.filter((s) => s !== slug));
    } else if (!full) {
      onChange([...value, slug]);
    }
  };

  return (
    <>
      <div className="pf-counter">
        <div className="pf-dots">
          {Array.from({ length: MAX_INTERESTS }, (_, i) => (
            <span key={i} className={`pf-dot ${i < value.length ? "pf-dot-on" : ""}`} />
          ))}
        </div>
        <span className={full ? "pf-counter-full" : ""}>
          {full ? "full board" : `${value.length}/${MAX_INTERESTS}`}
        </span>
      </div>

      {INTEREST_GROUPS.map((group) => (
        <div key={group.key} className="pf-group">
          <p className="pf-group-label">
            <img className="pf-emoji" src={`${EMOJI_BASE}/${group.emoji}.png`} alt="" />
            {group.label}
          </p>
          <div className="pf-chips">
            {group.tags.map((tag) => {
              const on = value.includes(tag.slug);
              return (
                <button
                  key={tag.slug}
                  type="button"
                  className={`pf-chip pf-chip-${group.key} ${on ? "pf-chip-on" : ""}`}
                  onClick={() => toggle(tag.slug)}
                  disabled={!on && full}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export default InterestsField;
```

- [ ] **Step 5: Create `fields/BioField.jsx`**

```jsx
const MAX_BIO = 200;

function BioField({ value = "", onChange }) {
  return (
    <>
      <textarea
        className="pf-bio"
        placeholder="one or two lines. what should someone know?"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_BIO}
      />
      <p className="pf-hint">
        {MAX_BIO - value.length} left. no handles or numbers — nobody can find
        you after a call and we'd like to keep it that way
      </p>
    </>
  );
}

export default BioField;
```

- [ ] **Step 6: Create `ProgressBar.jsx`**

```jsx
// Five segments, one per content step. The 18+ gate and the done screen are not
// segments: counting them would make the bar start part-full and finish early.
function ProgressBar({ total, done }) {
  return (
    <div className="pf-progress">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`pf-progress-seg ${i < done ? "pf-progress-seg-on" : ""}`}
        />
      ))}
    </div>
  );
}

export default ProgressBar;
```

- [ ] **Step 7: Delete the old form**

```bash
git rm frontend/src/components/profile/ProfileForm.jsx
```

Nothing imports it yet after this task's callers are rewritten in Tasks 6 and 7 — but deleting it now means the build fails loudly if something still does, which is better than it lingering.

- [ ] **Step 8: Verify**

Run: `cd frontend && npm run build`
Expected: **FAIL** — `Onboarding.jsx` and `EditProfile.jsx` still import the deleted `ProfileForm`. That is the expected state until Task 7; report the failure and continue.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/profile
git commit -m "feat: profile field components and progress bar"
```

---

## Task 6: Stepped onboarding

**Files:** Rewrite `frontend/src/components/profile/Onboarding.jsx`.

- [ ] **Step 1: Replace the file**

```jsx
import { useState } from "react";
import axios from "axios";
import ProgressBar from "./ProgressBar.jsx";
import ProfilePanel from "./ProfilePanel.jsx";
import AgeField from "./fields/AgeField.jsx";
import PlaceField from "./fields/PlaceField.jsx";
import GenderField from "./fields/GenderField.jsx";
import InterestsField from "./fields/InterestsField.jsx";
import BioField from "./fields/BioField.jsx";
import { EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const CONTENT_STEPS = 5;

function Onboarding({ onDone }) {
  const [step, setStep] = useState(0); // 0 = gate, 1..5 = content, 6 = done
  const [isAdult, setIsAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState({
    ageBand: "",
    countryCode: "",
    city: "",
    gender: "",
    interests: [],
    bio: "",
  });

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await axios.put(
        `${import.meta.env.VITE_BACKEND_URL}/api/profile`,
        { ...profile, confirmAdult: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setStep(6);
    } catch (err) {
      setError(err.response?.data?.error || "that didn't save. try again");
    } finally {
      setSaving(false);
    }
  };

  // The gate is the only screen that blocks.
  if (step === 0) {
    return (
      <div className="pf-page">
        <div className="pf-step">
          <div className="pf-progress" />
          <h1 className="pf-prompt">
            quick thing
            <br />
            first
          </h1>
          <div className="pf-step-body">
            <label className="pf-gate">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={() => setIsAdult((on) => !on)}
              />
              <span>i'm 18 or over</span>
            </label>
            {error && <p className="pf-error">{error}</p>}
          </div>
          <div className="pf-step-nav">
            <button
              type="button"
              className="pf-next"
              disabled={!isAdult}
              onClick={() => setStep(1)}
            >
              next
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="pf-page">
        <div className="pf-step">
          <div className="pf-progress" />
          <h1 className="pf-prompt">that's you</h1>
          <div className="pf-step-body">
            <ProfilePanel profile={profile} startOpen />
            <p className="pf-hint" style={{ color: "#fff", opacity: 0.9 }}>
              this is all anyone sees. you can change it any time from the lobby.
            </p>
          </div>
          <div className="pf-step-nav">
            <button type="button" className="pf-next" onClick={onDone}>
              let's go
            </button>
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { prompt: "how old are you?", node: <AgeField value={profile.ageBand} onChange={(ageBand) => set({ ageBand })} /> },
    { prompt: "where you at?", node: <PlaceField countryCode={profile.countryCode} city={profile.city} onChange={set} /> },
    { prompt: "how do you show up?", node: <GenderField value={profile.gender} onChange={(gender) => set({ gender })} /> },
    { prompt: "what are you into?", node: <InterestsField value={profile.interests} onChange={(interests) => set({ interests })} /> },
    { prompt: "say something", node: <BioField value={profile.bio} onChange={(bio) => set({ bio })} /> },
  ];

  const current = steps[step - 1];
  const isLast = step === CONTENT_STEPS;

  return (
    <div className="pf-page">
      <div className="pf-step">
        <ProgressBar total={CONTENT_STEPS} done={step - 1} />
        <h1 className="pf-prompt">{current.prompt}</h1>
        <div className="pf-step-body">
          {current.node}
          {error && <p className="pf-error">{error}</p>}
        </div>
        <div className="pf-step-nav">
          <button type="button" className="pf-back" onClick={() => setStep(step - 1)}>
            back
          </button>
          {/* Never disabled: not answering is how you skip a step. */}
          <button
            type="button"
            className="pf-next"
            disabled={saving}
            onClick={() => (isLast ? save() : setStep(step + 1))}
          >
            {isLast ? (saving ? "locking in..." : "lock it in") : "next"}
            {isLast && !saving && (
              <img
                className="pf-emoji"
                src={`${EMOJI_BASE}/high-voltage_26a1.png`}
                alt=""
                style={{ marginLeft: 8 }}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
```

- [ ] **Step 2: Verify the flow shape**

Run: `cd frontend && grep -c "pf-back" src/components/profile/Onboarding.jsx`
Expected: `1` — back exists, and only on content steps. The gate has no back (there is nowhere to go) and the done screen has no back (the save already happened).

Run: `cd frontend && grep -n "disabled=" src/components/profile/Onboarding.jsx`
Expected: exactly two — `!isAdult` on the gate, and `saving` on the final button. **No content step's next button is ever disabled.**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/profile/Onboarding.jsx
git commit -m "feat: stepped onboarding, one question per screen"
```

---

## Task 7: Edit page with a live preview

**Files:** Rewrite `frontend/src/components/profile/EditProfile.jsx`, modify `ProfilePanel.jsx`.

- [ ] **Step 1: Update ProfilePanel for the new shape and the two contexts**

Replace `frontend/src/components/profile/ProfilePanel.jsx`:

```jsx
import { useState } from "react";
import { INTEREST_GROUPS, EMOJI_BASE } from "../../interests.js";
import { COUNTRY_BY_CODE } from "../../countries.js";
import "./profile.css";

const LABELS = Object.fromEntries(
  INTEREST_GROUPS.flatMap((g) => g.tags.map((t) => [t.slug, t.label]))
);

/**
 * The only thing a matched partner sees. Rendered in two places: over the
 * partner's video during a call, and as the live preview on the edit screen —
 * the same component in both, so the preview cannot show something the partner
 * would not.
 */
function ProfilePanel({ profile, inCall = false, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const p = profile || {};

  const country = COUNTRY_BY_CODE[p.countryCode] || "";
  const place = [p.city, country].filter(Boolean).join(", ");
  const tags = p.interests || [];
  const hasAnything = p.ageBand || place || p.gender || p.bio || tags.length > 0;

  // In a call an empty profile shows nothing at all. On the edit screen the
  // empty state is the point — it is what the user is being warned about.
  if (inCall && !hasAnything) return null;

  return (
    <div className={`pf-panel ${inCall ? "pf-panel-incall" : ""}`}>
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
        {open ? "hide" : "who's this?"}
      </button>

      {open && (
        <div className="pf-panel-body">
          {!hasAnything && (
            <p className="pf-panel-empty">
              nothing here yet. they'd just see a blank card.
            </p>
          )}

          {(p.ageBand || place || p.gender) && (
            <div className="pf-panel-facts">
              {p.ageBand && <span className="pf-fact">{p.ageBand}</span>}
              {place && <span className="pf-fact">{place}</span>}
              {p.gender && <span className="pf-fact">{p.gender}</span>}
            </div>
          )}

          {tags.length > 0 && (
            <div className="pf-panel-tags">
              {tags.map((slug) => (
                <span key={slug} className="pf-panel-tag">
                  {LABELS[slug] || slug}
                </span>
              ))}
            </div>
          )}

          {p.bio && <p className="pf-panel-bio">{p.bio}</p>}
        </div>
      )}
    </div>
  );
}

export default ProfilePanel;
```

- [ ] **Step 2: Pass `inCall` from VideoChat**

In `frontend/src/components/VideoChat.jsx`, change the render to:

```jsx
          <ProfilePanel profile={partnerProfile} inCall />
```

Without this the panel loses its absolute positioning over the video tile.

- [ ] **Step 3: Replace EditProfile**

```jsx
import { useEffect, useState } from "react";
import axios from "axios";
import ProfilePanel from "./ProfilePanel.jsx";
import AgeField from "./fields/AgeField.jsx";
import PlaceField from "./fields/PlaceField.jsx";
import GenderField from "./fields/GenderField.jsx";
import InterestsField from "./fields/InterestsField.jsx";
import BioField from "./fields/BioField.jsx";
import { EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const Emoji = ({ slug }) => (
  <img className="pf-emoji" src={`${EMOJI_BASE}/${slug}.png`} alt="" />
);

const EMPTY = {
  ageBand: "",
  countryCode: "",
  city: "",
  gender: "",
  interests: [],
  bio: "",
};

function EditProfile({ onDone, onBack }) {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(false);

  const auth = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, auth)
      .then((res) => setProfile({ ...EMPTY, ...(res.data.profile || {}) }))
      .catch(() => setProfile(EMPTY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await axios.put(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, profile, auth);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "that didn't save. try again");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="pf-page">
        <div className="loader" style={{ margin: "auto" }} />
      </div>
    );
  }

  return (
    <div className="pf-page">
      <div className="pf-edit">
        <div className="pf-edit-scroll">
          <h1 className="pf-edit-title">your vibe</h1>
          <p className="pf-edit-sub">this is all anyone sees. nothing else.</p>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="birthday-cake_1f382" /> how old are you
            </p>
            <AgeField value={profile.ageBand} onChange={(ageBand) => set({ ageBand })} />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="globe-showing-asia-australia_1f30f" /> where you at
            </p>
            <PlaceField
              countryCode={profile.countryCode}
              city={profile.city}
              onChange={set}
            />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="man_1f468" /> how do you show up
            </p>
            <GenderField value={profile.gender} onChange={(gender) => set({ gender })} />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="sparkles_2728" /> what are you into
            </p>
            <InterestsField
              value={profile.interests}
              onChange={(interests) => set({ interests })}
            />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="writing-hand_270d-fe0f" /> say something
            </p>
            <BioField value={profile.bio} onChange={(bio) => set({ bio })} />
          </div>

          {error && <p className="pf-error">{error}</p>}

          <button type="button" className="pf-back" onClick={onBack} disabled={saving}>
            back to the lobby
          </button>
        </div>

        {/* The real panel, in the collapsed state a partner first meets. */}
        <div className="pf-bar">
          <div className="pf-bar-preview" onClick={() => setSheet(true)}>
            <ProfilePanel profile={profile} />
          </div>
          <button type="button" className="pf-save" onClick={save} disabled={saving}>
            {saving ? "locking in..." : "lock it in"}
          </button>
        </div>
      </div>

      {sheet && (
        <div className="pf-sheet" onClick={() => setSheet(false)}>
          <div className="pf-sheet-inner" onClick={(e) => e.stopPropagation()}>
            <ProfilePanel profile={profile} startOpen />
          </div>
        </div>
      )}
    </div>
  );
}

export default EditProfile;
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds now that nothing imports the deleted `ProfileForm`; 8 tests pass.

Run: `cd frontend && grep -rn "ProfileForm" src`
Expected: NO output.

Run: `cd frontend && grep -rn "profile.region\|profile.country\b" src`
Expected: NO output — the frontend is fully on `countryCode`/`city`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/profile frontend/src/components/VideoChat.jsx
git commit -m "feat: edit page with a live preview of the partner view"
```

---

## Task 8: Layout verification

**Files:** none committed — a scratch harness.

The sticky bar creates a new scroll container. This project has twice shipped a
scroll container that grew the page instead, so this is measured rather than
inspected.

- [ ] **Step 1: Build a harness**

In the session scratchpad create `pfharness.html`. `C` is
`/Users/divyanshraj/Geeky/MeetMates/frontend/src`:

```html
<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="C/App.css">
<link rel="stylesheet" href="C/components/profile/profile.css">
</head><body>
<div class="pf-page"><div class="pf-edit">
  <div class="pf-edit-scroll" id="scroll">
    <h1 class="pf-edit-title">your vibe</h1>
    <p class="pf-edit-sub">this is all anyone sees. nothing else.</p>
    <div class="pf-field"><p class="pf-field-label">how old are you</p>
      <div class="pf-chips">
        <button class="pf-chip pf-chip-plain">18-21</button>
        <button class="pf-chip pf-chip-plain pf-chip-on">22-25</button>
        <button class="pf-chip pf-chip-plain">26-30</button>
      </div></div>
    <div class="pf-field"><p class="pf-field-label">where you at</p>
      <select class="pf-select"><option>India</option></select>
      <div style="height:10px"></div>
      <input class="pf-input" value="Delhi">
      <p class="pf-hint">city is fine, street is weird</p></div>
    <div class="pf-field" id="interests"><p class="pf-field-label">what are you into</p>
      <div class="pf-counter"><div class="pf-dots" id="dots"></div><span>3/8</span></div>
      <div id="groups"></div></div>
    <div class="pf-field"><p class="pf-field-label">say something</p>
      <textarea class="pf-bio">3rd year, indie rock, terrible at FIFA</textarea></div>
  </div>
  <div class="pf-bar">
    <div class="pf-bar-preview"><div class="pf-panel">
      <button class="pf-panel-toggle">who's this?</button></div></div>
    <button class="pf-save">lock it in</button>
  </div>
</div></div>
<script type="module">
  // Real vocabulary, so the harness overflows exactly as the app does.
  const { INTEREST_GROUPS } = await import("C/interests.js");
  document.getElementById("dots").innerHTML =
    Array.from({length:8},(_,i)=>`<span class="pf-dot ${i<3?"pf-dot-on":""}"></span>`).join("");
  document.getElementById("groups").innerHTML = INTEREST_GROUPS.map(g=>
    `<div class="pf-group"><p class="pf-group-label">${g.label}</p><div class="pf-chips">` +
    g.tags.map((t,i)=>`<button class="pf-chip pf-chip-${g.key} ${i===0?"pf-chip-on":""}">${t.label}</button>`).join("") +
    `</div></div>`).join("");
</script>
</body></html>
```

Serve it from `frontend/src` with `python3 -m http.server` so the module import
resolves — a `file://` page cannot import a module from another origin.

- [ ] **Step 2: Measure**

With Playwright at 380×740, 380×640 and 1440×900, assert for each:

- `.pf-edit-scroll` scrolls — `scrollHeight > clientHeight`
- its first child is reachable — setting `scrollTop = 0` sticks
- `document.documentElement.scrollHeight - window.innerHeight === 0` — the page does not grow
- `scrollWidth - clientWidth === 0` — no horizontal overflow
- `.pf-bar` stays at the viewport bottom while `.pf-edit-scroll` is scrolled

Report the numbers. If the page grows, walk **up** the ancestor chain looking
for a missing `min-height: 0` — that has been the cause every previous time.

- [ ] **Step 3: Repeat for an onboarding step**

Same measurements on `.pf-step-body` with the interests step, at 380×640 — the
worst case, since that step is the longest and the shortest viewport.

- [ ] **Step 4: Confirm no unverified emoji slipped in**

Run: `cd frontend && grep -rhoE '[a-z-]+_[0-9a-f]{4,}(-[0-9a-f]+)*' src/components/profile src/interests.js | sort -u`

Every slug returned must already be one of the fourteen previously verified to
return 200 from `em-content.zobj.net`. This redesign introduces **no new emoji**
— if the list contains one you do not recognise, curl it before shipping. A bad
slug renders a broken image, which looks worse than no emoji.

- [ ] **Step 5: Screenshot and look**

Capture the edit page and the interests step at 380px wide, and view them.
Check: chips read as stickers not checkboxes, selected chips are visibly
coloured and tilted, the counter is legible, and the sticky bar does not cover
the last field's content.

- [ ] **Step 6: Commit any fixes**

If measurement forced a CSS change:

```bash
git add frontend/src/components/profile/profile.css
git commit -m "fix: contain the profile scroll regions"
```

---

## Task 9: Manual end-to-end verification

No code. `cd backend && npm start`, `cd frontend && npm run dev`. Use a 380px viewport.

- [ ] Sign in with a Google account that has never used Pingo. The 18+ gate appears alone, and **next is disabled until it is ticked**.
- [ ] Tap through all five steps entering nothing. Each step's next is enabled the whole time; the progress bar fills; you reach the done screen.
- [ ] The done screen shows the empty-state panel and the line about filling it in later.
- [ ] Sign in again with the same account. Onboarding does **not** reappear.
- [ ] Redo onboarding on a fresh account, filling every step. Back from step 3 to step 2 keeps what you entered.
- [ ] Pick nine interests. The ninth is refused, the counter reads **full board**, and the remaining chips grey out.
- [ ] Selected chips are visibly coloured by category — pink, blue, purple, yellow — and tilted. Unselected are white.
- [ ] Open Edit from the lobby. Everything you entered is pre-filled. It does not feel like redoing onboarding.
- [ ] Change the city to `  new  delhi `, save, reload. It reads **New Delhi**.
- [ ] Tap the preview in the sticky bar. The panel opens over the form showing exactly what you entered.
- [ ] Edit a field with the sheet closed, reopen it. The change is there — the preview is live, not a snapshot.
- [ ] Put `ig: divyansh` in the bio and save. Rejected, in the new voice.
- [ ] Save a bio reading `at the gym at 5, born 2004`. **Accepted** — false positives here are what make a filter hated.
- [ ] Pair two browsers into a call. Each sees the other's panel over the partner's video tile, collapsed, expanding on tap. It shows **city, country** — nothing finer.
- [ ] **Devtools → Network → WS: the `partnerProfile` frame contains exactly `ageBand`, `countryCode`, `city`, `gender`, `interests`, `bio` — and no `name`, `email`, `googleId` or `profilePicture`.**
- [ ] A partner who skipped everything shows no panel at all in-call, rather than an empty one.
- [ ] Every emoji renders. No broken-image icons.
- [ ] Nothing in the flow says "Your profile", "Save", or any other pre-rewrite string.
