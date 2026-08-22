# Matching Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the two decorative chips on the start page into working gender and country matching filters.

**Architecture:** Two pure, unit-tested modules (`matchAttrs.js` builds the two-field attribute record, `matchFilters.js` decides whether a pair is allowed) plus wiring in `server.js`: per-socket attribute and filter maps, one consolidated pairing loop, and a 15-second timer that relaxes the location filter and doubles as the retry loop the queue currently lacks. The frontend lifts filter state out of the two `<div>`s into real buttons.

**Tech Stack:** Node + Express + Socket.IO (CommonJS, double quotes, 2-space indent), React 19 + Vite (`.jsx`, plain CSS), `node:test` for backend, `vitest` for frontend.

**Spec:** `docs/superpowers/specs/2026-08-22-matching-filters-design.md`

---

## Read this before Task 1

Facts about the existing code that the tasks depend on. Verify them if anything
below does not match what you see.

**`matchUsers()` only runs on an event.** It is called from `findChat`, `next`
and `leaveChat`. There is no timer. This is why Task 5 exists.

**There are two pairing loops and one is unreachable.** `matchUsersByVideoPreference`
splits the queue by `videoEnabledUsers`; `matchRemainingUsers` pairs the rest.
`WITH_VIDEO` is hardcoded `true` in `frontend/src/components/Login.jsx:21`, so
everyone lands in the video bucket and `matchRemainingUsers` never runs. Task 3
collapses them into one loop **before** any filter logic is added, so that the
consolidation can be verified as behaviour-preserving on its own.

**`WaitingRoom.jsx` is dead code.** `App.jsx` case `"waiting"` renders
`<StartPage loading={true} />`. Do not edit `WaitingRoom.jsx`; the waiting UI in
Task 8 goes into `StartingPage.jsx` behind the `loading` prop.

**`App.jsx` does not hold the user's own profile.** `EditProfile` fetches it
itself. Task 6 has `StartingPage` do the same rather than adding state to
`App.jsx`.

**CSS is bundled globally and `.filter` / `.filters` are already unprefixed
generic names.** Every new selector in this plan is prefixed `mf-`. Do not add
new bare component selectors.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/matchAttrs.js` (new) | Build the two-field `{gender, countryCode}` record from a profile. Field by field, never spread. |
| `backend/matchAttrs.test.js` (new) | Prove no extra field can leak into matching state. |
| `backend/matchFilters.js` (new) | Pure predicate: sanitize filter input, decide whether one side accepts another, decide whether a pair is allowed. |
| `backend/matchFilters.test.js` (new) | Every decision in the spec, as a test. |
| `backend/server.js` (modify) | Queue state maps, one pairing loop, relax timer, `widenSearch` handler. |
| `frontend/src/components/StartingPage.jsx` (modify) | Chips become buttons; owns filter state; waiting-state UI. |
| `frontend/src/components/startpage.css` (modify) | `mf-` prefixed chip and waiting styles. |
| `frontend/src/App.jsx` (modify) | Pass filters on `findChat`; handle `searchWidened`; emit `widenSearch`. |

---

### Task 1: The attribute record

Matching needs each waiting user's gender and country. This builds that record
the same way `partnerPayload.js` does — explicitly, so a future careless spread
cannot put an email into matchmaking state.

**Files:**
- Create: `backend/matchAttrs.js`
- Test: `backend/matchAttrs.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/matchAttrs.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { buildMatchAttrs, MATCH_FIELDS } = require("./matchAttrs.js");

test("keeps only the two fields matching is allowed to see", () => {
  const attrs = buildMatchAttrs({
    gender: "woman",
    countryCode: "IN",
    city: "Delhi",
    bio: "hi",
    interests: ["chess"],
  });
  assert.deepStrictEqual(attrs, { gender: "woman", countryCode: "IN" });
});

test("cannot leak an identity field even when the document carries one", () => {
  // The guard that matters. A spread here is how an email reaches match state.
  const attrs = buildMatchAttrs({
    gender: "man",
    countryCode: "US",
    email: "someone@example.com",
    name: "Someone",
    googleId: "12345",
  });
  assert.deepStrictEqual(Object.keys(attrs).sort(), MATCH_FIELDS.slice().sort());
  assert.strictEqual(attrs.email, undefined);
  assert.strictEqual(attrs.name, undefined);
});

test("missing or absent profile yields empty strings, not undefined", () => {
  // Empty string is the wildcard the filter checks for; undefined would work by
  // accident today and break the moment someone writes `=== ""`.
  for (const input of [null, undefined, {}]) {
    assert.deepStrictEqual(buildMatchAttrs(input), { gender: "", countryCode: "" });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test matchAttrs.test.js`
Expected: FAIL with `Cannot find module './matchAttrs.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/matchAttrs.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test matchAttrs.test.js`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add backend/matchAttrs.js backend/matchAttrs.test.js
git commit -m "feat: add the two-field match attribute record"
```

---

### Task 2: The filter predicate

Every decision from the spec lives here. Pure — no sockets, no database, no
timers — which makes it the first part of matching that is testable at all.

**Files:**
- Create: `backend/matchFilters.js`
- Test: `backend/matchFilters.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/matchFilters.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert");
const {
  sanitizeFilters,
  accepts,
  canPairByFilters,
  NO_GENDER_FILTER,
  LOCATION_WORLDWIDE,
  LOCATION_COUNTRY,
} = require("./matchFilters.js");

const anyone = { gender: NO_GENDER_FILTER, location: LOCATION_WORLDWIDE };
const wantsWomen = { gender: "woman", location: LOCATION_WORLDWIDE };
const sameCountry = { gender: NO_GENDER_FILTER, location: LOCATION_COUNTRY };

test("sanitizeFilters falls back to no filter for anything unrecognised", () => {
  // The filter arrives over a socket from a client we do not control.
  assert.deepStrictEqual(sanitizeFilters({ gender: "wizard", location: "moon" }), anyone);
  assert.deepStrictEqual(sanitizeFilters({}), anyone);
  assert.deepStrictEqual(sanitizeFilters(null), anyone);
  assert.deepStrictEqual(sanitizeFilters(undefined), anyone);
});

test("sanitizeFilters keeps the values the chips can produce", () => {
  assert.deepStrictEqual(sanitizeFilters({ gender: "man", location: "country" }), {
    gender: "man",
    location: LOCATION_COUNTRY,
  });
  assert.deepStrictEqual(sanitizeFilters({ gender: "woman", location: "worldwide" }), {
    gender: "woman",
    location: LOCATION_WORLDWIDE,
  });
});

test("no filter accepts everyone", () => {
  assert.strictEqual(accepts(anyone, {}, { gender: "man", countryCode: "US" }), true);
  assert.strictEqual(accepts(anyone, {}, { gender: "non-binary", countryCode: "" }), true);
});

test("a gender filter rejects a mismatch", () => {
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "man" }), false);
});

test("a gender filter accepts a match", () => {
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "woman" }), true);
});

test("an unset gender is a wildcard", () => {
  // Most accounts have no profile filled in. Excluding them would empty the pool.
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "" }), true);
});

test("'prefer not to say' is a wildcard, exactly like unset", () => {
  // Chosen to avoid being sorted on. A hard non-match would hide them from
  // every filtering user, which is the opposite of what they asked for.
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "prefer not to say" }), true);
});

test("'non-binary' is a real answer, not a wildcard", () => {
  // Reachable via "Anybody" only. A known limit of a three-state chip.
  assert.strictEqual(accepts(wantsWomen, {}, { gender: "non-binary" }), false);
  assert.strictEqual(accepts(anyone, {}, { gender: "non-binary" }), true);
});

test("same-country matches on the country code", () => {
  const self = { gender: "", countryCode: "IN" };
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "IN" }), true);
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "US" }), false);
});

test("an unset country is a wildcard", () => {
  const self = { gender: "", countryCode: "IN" };
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "" }), true);
});

test("same-country behaves as worldwide when the searcher has no country", () => {
  // Nothing to compare against, so the filter cannot mean anything.
  const self = { gender: "", countryCode: "" };
  assert.strictEqual(accepts(sameCountry, self, { countryCode: "US" }), true);
});

test("a pair needs both sides to accept, in either order", () => {
  const woman = { filter: anyone, attrs: { gender: "woman", countryCode: "IN" } };
  const man = { filter: anyone, attrs: { gender: "man", countryCode: "IN" } };
  const manWantingWomen = { filter: wantsWomen, attrs: { gender: "man", countryCode: "IN" } };

  assert.strictEqual(canPairByFilters(woman, man), true);
  assert.strictEqual(canPairByFilters(manWantingWomen, woman), true);
  // The filtering side is rejected whichever argument position it occupies.
  assert.strictEqual(canPairByFilters(manWantingWomen, man), false);
  assert.strictEqual(canPairByFilters(man, manWantingWomen), false);
});

test("a missing filter or attrs record does not throw", () => {
  // A socket can reach the loop before its profile read has resolved.
  assert.strictEqual(canPairByFilters({}, {}), true);
  assert.strictEqual(accepts(undefined, undefined, undefined), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test matchFilters.test.js`
Expected: FAIL with `Cannot find module './matchFilters.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/matchFilters.js`:

```js
// matchFilters.js - whether two waiting people are allowed to be paired.
// Pure: no sockets, no database, no timers. Every rule the spec argues about
// is decided here and nowhere else.
const NO_GENDER_FILTER = "";
const LOCATION_WORLDWIDE = "worldwide";
const LOCATION_COUNTRY = "country";

// The chip offers three states; two of them name a gender to filter on.
const FILTERABLE_GENDERS = ["man", "woman"];

// Attributes that mean "no answer given" and so match every filter. Unset is
// obvious. "prefer not to say" is here because someone picks that value
// specifically to not be sorted on — treating it as a hard non-match would
// silently hide them from everyone who set a filter.
//
// "non-binary" is deliberately NOT here: it is a real answer, not a missing
// one, so it matches "Anybody" and nothing else.
const WILDCARD_GENDERS = ["", "prefer not to say"];

/** Filters arrive over a socket, so nothing here trusts the shape it is given. */
function sanitizeFilters(input) {
  const f = input || {};
  return {
    gender: FILTERABLE_GENDERS.includes(f.gender) ? f.gender : NO_GENDER_FILTER,
    location: f.location === LOCATION_COUNTRY ? LOCATION_COUNTRY : LOCATION_WORLDWIDE,
  };
}

/**
 * Would the owner of `filter` accept being paired with `otherAttrs`?
 * `selfAttrs` is needed because "my country" is relative to whoever set it.
 */
function accepts(filter, selfAttrs, otherAttrs) {
  const f = filter || {};
  const self = selfAttrs || {};
  const other = otherAttrs || {};

  if (f.gender) {
    const theirs = other.gender || "";
    if (!WILDCARD_GENDERS.includes(theirs) && theirs !== f.gender) return false;
  }

  if (f.location === LOCATION_COUNTRY) {
    // Either side missing a country is a wildcard: with nothing to compare,
    // the filter has no opinion rather than a negative one.
    if (self.countryCode && other.countryCode && other.countryCode !== self.countryCode) {
      return false;
    }
  }

  return true;
}

/**
 * Gender filtering is one-way — picking "Women" does not require her to have
 * opted into men. Both sides are still consulted, because pairing A with B when
 * A's filter rejects B would violate A's filter.
 * @param {{filter: object, attrs: object}} a
 * @param {{filter: object, attrs: object}} b
 */
function canPairByFilters(a, b) {
  return (
    accepts(a.filter, a.attrs, b.attrs) && accepts(b.filter, b.attrs, a.attrs)
  );
}

module.exports = {
  sanitizeFilters,
  accepts,
  canPairByFilters,
  NO_GENDER_FILTER,
  LOCATION_WORLDWIDE,
  LOCATION_COUNTRY,
  FILTERABLE_GENDERS,
  WILDCARD_GENDERS,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test matchFilters.test.js`
Expected: PASS, 13 tests

- [ ] **Step 5: Prove the wildcard rule is load-bearing**

Temporarily change `WILDCARD_GENDERS` to `[""]` and re-run. The
`"prefer not to say"` test must fail. Restore the line afterwards.

Run: `cd backend && node --test matchFilters.test.js`
Expected: exactly 1 failure, then PASS again after restoring.

- [ ] **Step 6: Commit**

```bash
git add backend/matchFilters.js backend/matchFilters.test.js
git commit -m "feat: add the pure match filter predicate"
```

---

### Task 3: One pairing loop

Behaviour-preserving refactor, done **before** filters so it can be judged on
its own. `matchUsersByVideoPreference` and `matchRemainingUsers` become one
loop. No filter logic in this task.

**Files:**
- Modify: `backend/server.js` — replace `matchUsers`, `matchUsersByVideoPreference`, `matchRemainingUsers` (currently lines 317–390)

- [ ] **Step 1: Replace the three functions**

Delete `matchUsers`, `matchUsersByVideoPreference` and `matchRemainingUsers`
entirely, and put this in their place. Keep `canPair` exactly as it is.

```js
// One loop. There used to be two: matchUsersByVideoPreference split the queue
// into video and text-only users, then matchRemainingUsers paired whatever was
// left. WITH_VIDEO has been hardcoded true in Login.jsx since the opt-out
// checkbox was removed, so every user landed in the video bucket and
// matchRemainingUsers never ran. Two near-identical loops would mean writing
// every future pairing rule twice and keeping the copies in step.
function matchUsers() {
  let i = 0;
  while (i < waitingUsers.length - 1) {
    const user1 = waitingUsers[i];
    let matched = false;

    for (let j = i + 1; j < waitingUsers.length; j++) {
      const user2 = waitingUsers[j];
      if (!canPair(user1, user2)) continue;

      waitingUsers.splice(j, 1);
      waitingUsers.splice(i, 1);
      createChatPair(
        user1,
        user2,
        videoEnabledUsers.has(user1) || videoEnabledUsers.has(user2)
      );
      matched = true;
      break;
    }

    if (!matched) i++;
  }
}
```

- [ ] **Step 2: Verify the server still boots**

Run:
```bash
cd backend && PORT=39990 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 600)"
```
Expected: prints `booted`

- [ ] **Step 3: Run the whole backend suite**

Run: `cd backend && node --test`
Expected: all tests pass, same count as before this task

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "refactor: collapse the two pairing loops into one"
```

---

### Task 4: Filters reach the queue

**Files:**
- Modify: `backend/server.js` — imports, state near line 113, `findChat` handler at line 152, `matchUsers` from Task 3, `disconnect` handler at line 272

- [ ] **Step 1: Add the imports**

Next to the existing `require` of `./partnerPayload.js` near line 19:

```js
const { buildMatchAttrs } = require("./matchAttrs.js");
const { sanitizeFilters, canPairByFilters } = require("./matchFilters.js");
```

- [ ] **Step 2: Add the queue state**

Directly below `let authenticatedUsers = new Map();` (line 117):

```js
// What each waiting socket asked for, and the two profile fields matching is
// allowed to know about them. Both are keyed by socket id and cleared on
// disconnect. Filters are a session choice and are never persisted.
const waitingFilters = new Map();
const waitingAttrs = new Map();
```

- [ ] **Step 3: Load attributes when a user enters the queue**

Replace the body of the `findChat` handler (line 152). The handler becomes
`async`; the profile read is one round trip on queue entry rather than one per
candidate inside an O(n²) loop.

```js
  socket.on("findChat", async (collegeEmail, withVideo = false, filters) => {
    const userEmail = socket.userEmail || collegeEmail;

    if (chatPairs[socket.id]) {
      const partner = chatPairs[socket.id].partner;
      if (partner && io.sockets.sockets.get(partner)) {
        io.to(partner).emit("partnerLeft", { partnerId: socket.id });
      }
      cleanupChatPair(socket.id);
    }

    waitingFilters.set(socket.id, sanitizeFilters(filters));

    // One read per queue entry. Failure is non-fatal: empty attributes are
    // wildcards, so a database hiccup widens the match rather than blocking it.
    const profile = await visibleProfileFor(socket).catch(() => null);
    waitingAttrs.set(socket.id, buildMatchAttrs(profile));

    // The socket can disconnect during the await.
    if (!io.sockets.sockets.get(socket.id)) return;

    waitingUsers = waitingUsers.filter((id) => id !== socket.id);
    waitingUsers.push(socket.id);
    withVideo
      ? videoEnabledUsers.add(socket.id)
      : videoEnabledUsers.delete(socket.id);

    socket.emit("waiting");
    console.log(`User ${userEmail} looking for chat, video: ${withVideo}`);
    matchUsers();
  });
```

- [ ] **Step 4: Consult the filters in the loop**

In `matchUsers` (Task 3), replace the single `if (!canPair(user1, user2)) continue;`
line with:

```js
      if (!canPair(user1, user2)) continue;
      if (!filtersAllowPair(user1, user2)) continue;
```

And add this helper directly above `matchUsers`:

```js
// Bridges the socket-keyed maps to the pure predicate. A socket with no entry
// yet — its profile read has not resolved — is treated as unfiltered and
// attribute-less, which makes it matchable rather than stuck.
function filtersAllowPair(id1, id2) {
  return canPairByFilters(
    { filter: waitingFilters.get(id1), attrs: waitingAttrs.get(id1) },
    { filter: waitingFilters.get(id2), attrs: waitingAttrs.get(id2) }
  );
}
```

- [ ] **Step 5: Clean up on disconnect**

In the `disconnect` handler, below `nextCooldownUsers.delete(socket.id);` (line 282):

```js
    waitingFilters.delete(socket.id);
    waitingAttrs.delete(socket.id);
```

- [ ] **Step 6: Verify the server boots and the suite passes**

Run:
```bash
cd backend && PORT=39991 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 600)" && node --test
```
Expected: `booted`, then all tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/server.js
git commit -m "feat: consult gender and country filters when pairing"
```

---

### Task 5: The relax timer

Fifteen seconds after joining the queue a waiting user's **location** filter
drops to worldwide. Gender is never relaxed automatically — it widens only when
the user asks. This timer is also the retry loop the queue has never had.

**Files:**
- Modify: `backend/server.js` — state, a queue-entry helper, the five `waitingUsers.push` sites, `disconnect`

- [ ] **Step 1: Add the timer state and helpers**

Below the `waitingAttrs` map from Task 4:

```js
// matchUsers only ever runs in response to an event, so a filtered user whose
// criteria nobody in the queue meets waits until somebody else happens to act.
// This timer is both the escape hatch and the retry loop.
const relaxTimers = new Map();
const RELAX_AFTER_MS = 15000;
```

And these two functions next to `canPair` (near line 326):

```js
// Every route into the waiting queue goes through here, so nobody can be left
// waiting without a timer attached.
function enqueue(socketId) {
  if (!waitingUsers.includes(socketId)) waitingUsers.push(socketId);
  startRelaxTimer(socketId);
}

function startRelaxTimer(socketId) {
  clearRelaxTimer(socketId);
  relaxTimers.set(
    socketId,
    setTimeout(() => {
      relaxTimers.delete(socketId);

      const current = waitingFilters.get(socketId);
      // Gender is deliberately untouched: location is the preference people
      // hold weakly, and silently handing someone the gender they filtered out
      // is worse than a longer wait.
      if (!current || current.location === LOCATION_WORLDWIDE) return;

      waitingFilters.set(socketId, { ...current, location: LOCATION_WORLDWIDE });
      // Booleans meaning "this got widened", not the new filter values. The
      // widened gender value is "" — falsy — so a client testing the value
      // could never tell "gender was widened" from "gender was never set".
      io.to(socketId).emit("searchWidened", { location: true });
      matchUsers();
    }, RELAX_AFTER_MS)
  );
}

function clearRelaxTimer(socketId) {
  const timer = relaxTimers.get(socketId);
  if (timer) clearTimeout(timer);
  relaxTimers.delete(socketId);
}
```

Add `LOCATION_WORLDWIDE` to the `matchFilters.js` import from Task 4 Step 1:

```js
const {
  sanitizeFilters,
  canPairByFilters,
  LOCATION_WORLDWIDE,
} = require("./matchFilters.js");
```

- [ ] **Step 2: Route every queue entry through `enqueue`**

Replace each of these, leaving surrounding code alone:

| Line (approx) | Was | Becomes |
|---|---|---|
| 163 (`findChat`) | `waitingUsers.push(socket.id);` | `enqueue(socket.id);` |
| 192 (`next`) | `waitingUsers.push(socket.id);` | `enqueue(socket.id);` |
| 202 (`next`, partner) | `waitingUsers.push(partnerId);` | `enqueue(partnerId);` |
| 211–213 (`next`, else) | the `if (!waitingUsers.includes(...)) { ... }` block | `enqueue(socket.id);` |
| 228 (`leaveChat`, partner) | `waitingUsers.push(partnerId);` | `enqueue(partnerId);` |

Note `findChat` keeps its preceding `waitingUsers = waitingUsers.filter(...)`
line — `enqueue` replaces only the `push`.

- [ ] **Step 3: Clear the timer when someone leaves the queue**

In `matchUsers`, immediately after the two `splice` calls and before
`createChatPair`:

```js
      clearRelaxTimer(user1);
      clearRelaxTimer(user2);
```

In the `disconnect` handler, beside the deletes from Task 4:

```js
    clearRelaxTimer(socket.id);
```

In the `leaveChat` handler, after `waitingUsers = waitingUsers.filter((id) => id !== socket.id);` (line 237):

```js
    clearRelaxTimer(socket.id);
```

- [ ] **Step 4: Add the `widenSearch` handler**

Beside the other `socket.on` handlers, after the `leaveChat` handler:

```js
  // The user asked to widen the search themselves. This is the only thing that
  // clears a gender filter — nothing on the server does it behind their back.
  socket.on("widenSearch", () => {
    const current = waitingFilters.get(socket.id);
    if (!current) return;

    waitingFilters.set(socket.id, {
      gender: NO_GENDER_FILTER,
      location: LOCATION_WORLDWIDE,
    });
    socket.emit("searchWidened", { gender: true, location: true });
    matchUsers();
  });
```

Add `NO_GENDER_FILTER` to the `matchFilters.js` import:

```js
const {
  sanitizeFilters,
  canPairByFilters,
  LOCATION_WORLDWIDE,
  NO_GENDER_FILTER,
} = require("./matchFilters.js");
```

- [ ] **Step 5: Verify no `waitingUsers.push` remains outside `enqueue` and `createChatPair`**

Run: `cd backend && grep -n "waitingUsers.push" server.js`
Expected: exactly two hits, both inside `enqueue` and `createChatPair`
(`createChatPair` pushes back when a socket vanished mid-pair; leave it).

- [ ] **Step 6: Verify the server boots and the suite passes**

Run:
```bash
cd backend && PORT=39992 node -e "process.env.MONGODB_URI='mongodb://127.0.0.1:1/x'; require('./server.js'); setTimeout(()=>{console.log('booted'); process.exit(0)}, 600)" && node --test
```
Expected: `booted`, then all tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/server.js
git commit -m "feat: relax the location filter after fifteen seconds"
```

---

### Task 6: The chips become buttons

**Files:**
- Modify: `frontend/src/components/StartingPage.jsx` — the `.filters` block at lines 76–98
- Modify: `frontend/src/components/startpage.css`

- [ ] **Step 1: Add filter state and the country fetch**

At the top of `StartingPage.jsx`, add `axios` to the imports:

```jsx
import axios from "axios";
```

Add these constants above the component:

```jsx
// Kept in step with backend/matchFilters.js by hand. Three strings is below the
// bar that earned interests.js and countries.js a mirrored file plus a parity
// test; the server sanitizes anything it does not recognise anyway.
const GENDER_CYCLE = ["", "man", "woman"];
const GENDER_LABEL = { "": "Anybody", man: "Men", woman: "Women" };
```

Inside the component, below the `mobileTab` state:

```jsx
  const [genderFilter, setGenderFilter] = useState(
    () => localStorage.getItem("filterGender") || ""
  );
  const [locationFilter, setLocationFilter] = useState(
    () => localStorage.getItem("filterLocation") || "worldwide"
  );
  // "My country" needs a country to compare against. EditProfile fetches its own
  // profile rather than App holding it, so this follows the same pattern.
  const [myCountry, setMyCountry] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setMyCountry(res.data.profile?.countryCode || ""))
      .catch(() => setMyCountry(""));
  }, []);

  const cycleGender = () => {
    const next = GENDER_CYCLE[(GENDER_CYCLE.indexOf(genderFilter) + 1) % GENDER_CYCLE.length];
    setGenderFilter(next);
    localStorage.setItem("filterGender", next);
  };

  const toggleLocation = () => {
    const next = locationFilter === "country" ? "worldwide" : "country";
    setLocationFilter(next);
    localStorage.setItem("filterLocation", next);
  };
```

- [ ] **Step 2: Replace the two decorative divs**

Replace the whole `<div className="filters">…</div>` block (lines 76–98) with:

```jsx
          <div className="filters">
            <button
              type="button"
              className={`filter mf-chip ${genderFilter ? "mf-chip-on" : ""}`}
              onClick={cycleGender}
              disabled={loading}
              aria-label={`match with ${GENDER_LABEL[genderFilter]}`}
            >
              <img
                src="https://em-content.zobj.net/source/apple/419/man_1f468.png"
                alt=""
                style={{ width: "20px" }}
              />
              <img
                src="https://em-content.zobj.net/source/apple/419/woman-red-hair_1f469-200d-1f9b0.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />
              {GENDER_LABEL[genderFilter]}
            </button>

            <button
              type="button"
              className={`filter mf-chip ${locationFilter === "country" ? "mf-chip-on" : ""}`}
              onClick={toggleLocation}
              disabled={loading || !myCountry}
              title={myCountry ? "" : "add your country to your profile first"}
            >
              <img
                src="https://em-content.zobj.net/source/apple/419/globe-showing-asia-australia_1f30f.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />
              {locationFilter === "country" && myCountry ? "My country" : "Worldwide"}
            </button>
          </div>
```

- [ ] **Step 3: Send the filters up on start**

Change the "Lets Vibe" button's handler (line 102) from `onClick={onStartChat}` to:

```jsx
            onClick={() =>
              onStartChat({
                gender: genderFilter,
                // A country filter with no country of your own does nothing,
                // so do not send one.
                location: myCountry ? locationFilter : "worldwide",
              })
            }
```

- [ ] **Step 4: Add the styles**

Append to `frontend/src/components/startpage.css`:

```css
/* Match filters. `.filter` is an existing unprefixed class shared with the old
   decorative chips; everything new here is prefixed. */
.mf-chip {
  display: flex;
  align-items: center;
  border: none;
  color: inherit;
  font-family: "Rethink Sans", sans-serif;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.15s, transform 0.09s;
}

.mf-chip:hover:not(:disabled) {
  transform: translateY(-2px);
}

.mf-chip-on {
  background: #0099ff;
  color: #fff;
}

.mf-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

- [ ] **Step 5: Build and check the chips**

Run: `cd frontend && npm run build`
Expected: builds clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StartingPage.jsx frontend/src/components/startpage.css
git commit -m "feat: make the gender and location chips real controls"
```

---

### Task 7: Wire the filters through App

**Files:**
- Modify: `frontend/src/App.jsx` — `handleStartChat` (line 272), socket listeners (near line 162), the `"start"` and `"waiting"` cases (lines 450 and 472)

- [ ] **Step 1: Accept filters in `handleStartChat`**

Change the signature and the emit:

```jsx
  const handleStartChat = async (email, withVideo, filters) => {
```

```jsx
    socket.emit("findChat", email, withVideo, filters);
```

- [ ] **Step 2: Track when the search widens**

Beside the other `useState` calls near line 39:

```jsx
  const [searchWidened, setSearchWidened] = useState(null);
```

With the other `socket.on` registrations near line 162:

```jsx
    socket.on("searchWidened", (what) => setSearchWidened(what));
```

With the other `socket.off` calls near line 260:

```jsx
      socket.off("searchWidened");
```

Clear it whenever a fresh search starts — inside `handleStartChat`, directly
above the `socket.emit("findChat", ...)` line:

```jsx
    setSearchWidened(null);
```

- [ ] **Step 3: Add the widen handler**

Below `handleStartChat`:

```jsx
  const handleWidenSearch = () => socket.emit("widenSearch");
```

- [ ] **Step 4: Pass the props in both StartPage cases**

In the `"start"` case (line 450), replace the `onStartChat` prop with:

```jsx
            onStartChat={(filters) =>
              handleStartChat(
                readStoredEmail(),
                localStorage.getItem("withVideo") === "true",
                filters
              )
            }
```

In the `"waiting"` case (line 472), replace the `onStartChat` prop the same way,
and add these three props beside `loading={true}`:

```jsx
            onWidenSearch={handleWidenSearch}
            searchWidened={searchWidened}
            onLogout={logout}
```

`onLogout` is added because the `"waiting"` case currently passes `logout`,
which `StartPage` does not read — the Log Out button does nothing while waiting.

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: builds clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: carry match filters through to findChat"
```

---

### Task 8: The waiting state says what it is doing

**Files:**
- Modify: `frontend/src/components/StartingPage.jsx`
- Modify: `frontend/src/components/startpage.css`

- [ ] **Step 1: Accept the new props**

Add to the destructured props:

```jsx
  onWidenSearch,
  searchWidened,
```

- [ ] **Step 2: Render the waiting notice**

Directly below the "Lets Vibe" button and above the `pf-edit-link` button:

```jsx
          {loading && (
            <div className="mf-searching">
              {searchWidened?.gender ? (
                <p className="mf-searching-note">looking for anyone now.</p>
              ) : searchWidened ? (
                <p className="mf-searching-note">
                  no luck nearby — looking worldwide now.
                </p>
              ) : (
                <p className="mf-searching-note">
                  looking for{" "}
                  {genderFilter ? GENDER_LABEL[genderFilter].toLowerCase() : "anyone"}
                  {locationFilter === "country" && myCountry ? " in your country" : ""}.
                </p>
              )}

              {genderFilter && !searchWidened?.gender && (
                <button type="button" className="mf-widen" onClick={onWidenSearch}>
                  match me with anyone
                </button>
              )}
            </div>
          )}
```

- [ ] **Step 3: Add the styles**

Append to `frontend/src/components/startpage.css`:

```css
.mf-searching {
  margin-top: 16px;
  text-align: center;
}

.mf-searching-note {
  margin: 0 0 10px;
  font-size: 0.9rem;
  opacity: 0.85;
}

.mf-widen {
  background: transparent;
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-radius: 999px;
  padding: 8px 18px;
  font-family: "Rethink Sans", sans-serif;
  font-size: 0.9rem;
  cursor: pointer;
}

.mf-widen:hover {
  background: rgba(255, 255, 255, 0.15);
}
```

- [ ] **Step 4: Build and run the frontend tests**

Run: `cd frontend && npm run build && npx vitest run`
Expected: builds clean, 17 tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StartingPage.jsx frontend/src/components/startpage.css
git commit -m "feat: show what the search is doing while waiting"
```

---

### Task 9: End-to-end verification

Unit tests prove the predicate. Only two browsers prove the pairing. **This
needs a reachable MongoDB** — set `MONGODB_URI` before starting the backend.

- [ ] **Step 1: Start both servers**

```bash
cd backend && npm start
cd frontend && npm run dev
```

- [ ] **Step 2: Work the checklist**

Two browser profiles, two Google accounts, both with profiles filled in.

1. Both set "Anybody" + "Worldwide" → they pair, exactly as before.
2. A sets "Women", B's profile says `man` → they do **not** pair; A keeps waiting.
3. A sets "Women", B's profile says `woman` → they pair.
4. A sets "Women", B has **no gender set** → they pair (the wildcard rule).
5. A sets "Women", B's gender is `"prefer not to say"` → they pair.
6. A sets "Women", B's gender is `"non-binary"` → they do **not** pair.
7. Both set "My country", same country → they pair.
8. Both set "My country", different countries → they do not pair, then **after
   15 seconds** both see "no luck nearby — looking worldwide now" and pair.
9. A sets "Women" against a queue of men, presses **"match me with anyone"** →
   pairs immediately.
10. A user with no country in their profile sees the Location chip disabled with
    the "add your country to your profile first" tooltip.
11. Reload the page → both chips come back in the state they were left in.
12. Set a filter, wait, then close the tab → server logs no error, and
    `waitingFilters`/`waitingAttrs`/`relaxTimers` do not grow across repeats.
13. **Devtools → WS → `findChat`** frame carries only `{gender, location}` —
    no name, email, `googleId` or `profilePicture` anywhere in the payload.
14. **Devtools → WS → `partnerProfile`** still carries exactly six fields and no
    identity. Task 4 touched the same profile read path.

- [ ] **Step 3: Commit anything the checklist turned up**

```bash
git add -A
git commit -m "fix: <what the checklist found>"
```

---

## Notes for whoever runs this

**The online count becomes misleading.** "12 making sure she's ok" will include
people you cannot be matched with. Known, out of scope, in the spec.

**One-way gender filtering is not a safety control.** The gender field is
self-reported and unverified. Do not describe this filter to users as protection.

**Do not add a filter check to `createChatPair`.** It pushes sockets back onto
the queue when one vanishes mid-pair; filtering there would drop them silently.
