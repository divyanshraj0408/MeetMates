# Profile Experience Redesign — Design Spec

Date: 2026-08-22
Status: Approved (pending spec review)
Branch: `feat/user-profiles`

Supersedes the UI described in
[2026-08-22-user-profiles-design.md](./2026-08-22-user-profiles-design.md).
That spec's data model and privacy guarantees still hold except where this one
replaces them.

## The problem

The profile page shipped as a vertically stacked form: around forty visually
identical white pills across eight sections on a white card. It is technically
on-theme and uses almost none of the theme — no yellow, pink or purple anywhere.

Concretely:

- **No hierarchy.** Every chip looks the same whether it is selected or not, so
  the page reads as one undifferentiated field of pills.
- **No progress.** Nothing tells you how far through you are or that you are
  building something.
- **No preview.** You cannot see what a partner will actually be shown, which is
  the one thing a user of an anonymity-conscious app most wants to know.
- **Save is below two screens of scroll.**
- **The copy is polite** — "Your profile", "Where you are", "About you" — in a
  product whose homepage says "Social anxiety? Let's multiply it."

Free-text `country` and `region` are also a data problem: region becomes a
matching input next sprint, and typo'd free text will be worthless for that.

## Goal

Make the profile feel like building something, make what a partner sees
impossible to be surprised by, and make the whole flow sound like the rest of
Pingo.

## Non-Goals

- Matching logic. Fields are shaped for it; nothing here matches.
- The Never Have I Ever game.
- Blocking, reporting, or account deletion. Still deferred.
- Resolving the tagline tension (see the end of this document).

---

## Schema

### Location becomes structured

```js
  profile: {
    ageBand:     String,   // unchanged
    countryCode: String,   // ISO 3166-1 alpha-2, e.g. "IN"   ← replaces `country`
    city:        String,   // normalised display form, "Delhi" ← replaces `region`
    gender:      String,   // unchanged
    interests:   [String], // unchanged
    bio:         String,   // unchanged
    updatedAt:   Date,
  },
```

`normalizeCity` is pure and tested. It trims, collapses internal whitespace,
strips anything that is not a letter, space, hyphen or apostrophe, title-cases
each word, and caps at 85 characters. `"  new  DELHI "` becomes `"New Delhi"`.

One canonical form serves both display and matching, so no separate lowercase
lookup key is needed. Storing an ISO code rather than a country name means the
value is stable and matchable while the displayed name comes from one list.

### What the partner sees

Country **and** city, nothing finer. The partner payload carries
`{ ageBand, countryCode, city, gender, interests, bio }` and the client resolves
`countryCode` to a name, exactly as it already resolves interest slugs to labels.

### Indexes

```js
userSchema.index({ "profile.interests": 1 });      // multikey
userSchema.index({ "profile.ageBand": 1 });
userSchema.index({ "profile.gender": 1 });
userSchema.index({ "profile.countryCode": 1, "profile.city": 1 });
```

**These buy nothing today.** Matchmaking is an in-memory FIFO over sockets, not
a database query — `waitingUsers.push(socket.id)`, first two paired. The indexes
are cheap insurance for the matching sprint. No further compound indexes are
added, because the query shape does not exist yet and a wrong compound index is
worse than none: it costs writes and misleads the next reader about intent.

### Migration

None. The profile feature lives only on this unmerged branch and has never been
run against a real database, so no document has a `profile.region`.

The read path nonetheless tolerates the legacy shape: if `city` is absent and a
legacy `region` string is present, `region` is read as the city. Three lines,
and it means being wrong about the above cannot silently corrupt location data.

### The country list

`backend/countries.js` holds the ISO list and is the source of truth.
`frontend/src/countries.js` mirrors it, guarded by the same disk-reading parity
test that protects the interest vocabulary.

The list is ISO 3166-1 alpha-2 with English short names, written as static data
in the repo rather than pulled from a package — no new dependencies, and a
country list does not change often enough to justify one. Roughly 250 entries,
sorted by name. `isKnownCountryCode` validates against it on write.

---

## Onboarding

Seven screens, one question each:

**18+ gate → age → where → gender → interests → bio → done**

Each screen is a RightGrostek prompt at `clamp(2.2rem, 11vw, 3.4rem)` — 3–5em
on desktop, scaled down so a long prompt still fits two lines at 380px — with the
controls filling the space below it.

A segmented progress bar sits above the prompt: **five segments, one per content
step** (age, where, gender, interests, bio). The 18+ gate and the done screen are
not segments — the gate precedes the flow and the done screen is its completion,
so counting them would make the bar start part-full and end before the end. Each
segment fills solid `#0099ff` as its step is passed. A bar, not a "step 3 of 6"
label, because the brief asks for progress you can feel rather than read.

Back is always available. The primary button always reads **next** and is never
disabled: not answering a step is how you skip it. One control instead of two,
and no state in which the user is stuck.

The 18+ gate is step zero and is the only screen that blocks. It is a full
screen rather than a checkbox above a form, because it is the one thing the user
must actually decide.

There is **no global skip**. Five taps of *next* gets you through having entered
nothing, so the escape hatch exists without a button advertising it next to a
progress bar.

The done screen is the payoff, not a receipt. It shows the user's own profile
rendered through the **same `ProfilePanel`** a partner will see — expanded, this
time, since the point is to show them what they built — above a single button
reading **let's go** that lands them in the lobby.

Someone who tapped through entering nothing sees the panel's empty state and a
line offering to fill it in later from the lobby. That is the one place the flow
acknowledges an empty profile, and it does so after the fact rather than by
blocking.

---

## Edit

Single page, every field visible, nothing staged. Landing here must never feel
like repeating onboarding.

A sticky bottom bar holds two things: **Save**, and the real `ProfilePanel` in
its collapsed "Who's this?" state. Tapping it expands the panel over the form.

The preview is the same component a partner sees, rendered from
`buildPartnerPayload(profile)` — the **same pure function the socket emit uses**.
This is the structural point: there is one payload builder, so the preview
cannot drift from what is actually transmitted. Previewing the collapsed state
first also matches how a partner meets it — as a pill they choose to open, not
an always-open card.

`buildPartnerPayload` is built field by field and is tested with a full Mongoose
user document to prove it emits exactly six keys and never `name`, `email`,
`googleId` or `profilePicture`.

---

## Revision, 2026-08-22 (post-build)

Three changes after seeing it running. Recorded here rather than left to
diverge from the code.

**Interests are an input with suggestions, not a grouped board.** Seven labelled
sections was more classification than picking a few tags needs. You type, live
suggestions appear, and picking one drops it in as a removable chip. The
vocabulary is unchanged and still fixed — suggestions need a list, and the
server validates against one. Groups remain in the data, colouring chips and
feeding the game's prompts later; they are simply no longer announced. The
counter and the eight-tag limit are unaffected.

**The in-call toggle is the ID-card icon alone.** "who's this?" is gone. The
collapse behaviour stays — the video is unobstructed until tapped — and an
`aria-label` carries the meaning for anyone who cannot see the icon.

**The lobby's edit entry is a chip, not a bare button.** It reads "your vibe" and
matches the `.filter` chips directly above it. Removing it entirely was
considered and rejected: it is the only route to the edit screen, so removing it
would make a profile permanently unchangeable after onboarding.

The sections below describe the pre-revision design of the chip board; the rest
of the spec stands.

## Interest chips

Seven groups over four palette colours:

| Group | Fill | Text |
|-------|------|------|
| music | `#ff5ca2` | white |
| screen | `#9b71ff` | white |
| play | `#0099ff` | white |
| make | `#ffea00` | `#0d0d0d` |
| mind | `#ff5ca2` | white |
| out | `#0099ff` | white |
| other | `#9b71ff` | white |

Unselected: white fill, `#0d0d0d` border, no shadow.
Selected: category fill, 3px black border, hard offset shadow, and a ±2°
rotation alternating by index.

The rotation uses `transform`, which does not affect layout, so a wrapping
container will not reflow as chips are picked. A picked board should read as a
sticker sheet rather than a form.

### The counter

Eight dots that fill as interests are chosen, replacing the current small grey
`3/8`. At eight the counter goes solid and reads **full board**. Remaining chips
still disable, but the message is completion rather than refusal.

---

## Voice

Every string in the flow is rewritten. Current on the left.

| Now | Becomes |
|-----|---------|
| Your profile | your vibe |
| Tell us a bit about you | let's get you set up |
| Where you are | where you at |
| About you | say something |
| Age | how old are you |
| Gender | how do you show up |
| Interests | what are you into |
| Save | lock it in |
| Saving... | locking in... |
| Start vibing | let's go |
| Skip for now | *(removed)* |
| Keep it broad — a city, not your street | city is fine, street is weird |
| No handles or numbers — Pingo keeps you unfindable after a call | no handles or numbers. nobody can find you after a call and we'd like to keep it that way |
| Pick at most 8 interests | eight is the limit, pick your favourites |
| Could not save. Try again. | that didn't save. try again |
| Please take the {handle} out of your bio — ... | take the {handle} out — pingo keeps you unfindable, and that undoes it |

Register is lowercase-ish and contraction-heavy. Errors stay plain and unfussy:
never apologetic, never corporate, and never cute about a failure.

---

## Constraints honoured

- Every new selector is `pf-` prefixed. No bare component selectors.
- The sticky bottom bar creates a new scroll container; `min-height: 0` is set
  on every ancestor of it, and the containment is verified by measurement at
  380px, not by inspection.
- `ProfilePanel` and the onboarding screens each set their own `color`, because
  a surface that inherits it goes black-on-black on a page that does not set one.
- Any new emoji has its `em-content.zobj.net` URL checked for a 200 before use.
- Plain CSS, `.jsx`, React 19. No TypeScript, no CSS framework, no new
  dependencies.
- Designed at 380px first.

---

## Testing

Pure and unit-tested:

- `normalizeCity` — whitespace, casing, punctuation stripping, length cap, and
  that already-clean input is unchanged.
- `isKnownCountryCode` — accepts real ISO codes, rejects invented ones, rejects
  a country *name* passed where a code belongs.
- `sanitizeProfileInput` — extended for the new fields; an unknown country code
  is rejected, a city is normalised on the way in.
- The selection limit — eight accepted, nine rejected, duplicates collapsed.
- `buildPartnerPayload` — the important one. Given a full Mongoose user
  document, returns exactly `ageBand`, `countryCode`, `city`, `gender`,
  `interests`, `bio`, and no others.
- Country list parity between backend and frontend, by the same disk-reading
  test used for interests. As with that one, the guard is proved by breaking it
  deliberately once and watching it fail.

Layout, by measurement at 380px and 1440px with 8 interests selected: the form
scrolls, the sticky bar stays put, the page does not grow, no horizontal
overflow.

Manual: the full flow on a 380px viewport, plus a devtools check that the
`partnerProfile` socket frame carries no identity.

---

## Decisions taken

- **Country and city are both shown to a partner**, nothing finer. Considered
  country-only with city as a matching-only field, which would have made the
  guarantee trivially enforceable by absence. Rejected because "oh you're in
  Delhi too" is the conversation the product exists to start, and the shipped
  panel already behaves this way.
- **Native `<select>` for country**, not the searchable combobox the brief asked
  for. On mobile — the primary target — a native select already has type-ahead,
  renders an optimised picker, and costs nothing in accessibility. A hand-rolled
  combobox is ~150 lines of focus management and `aria-activedescendant` with a
  real chance of shipping something subtly broken, which is worse than a plain
  select. The closed control is styleable, so it still matches the look.
- **Preview shows the collapsed state first**, in a sticky bottom bar. Considered
  always-expanded at the top; rejected because it eats 140–200px of a 380px
  screen and shows a state the partner only reaches by choosing to, which
  overstates what is being given away.
- **No global skip in onboarding.** Considered a quiet "do this later" link;
  rejected because it becomes the path of least resistance and matching quality
  depends entirely on this data. Five taps of *next* is the escape hatch.
- **Country list is mirrored to the frontend**, not served from
  `/api/profile/options`. Serving it would avoid ~6KB of duplication and a second
  parity test, but adds a loading state to an onboarding step and breaks the
  pattern the interest vocabulary established.
- **Indexes added now despite being unused**, with the reason recorded rather
  than left for a future reader to wonder about.

## Decisions rejected

- **Denormalising interest categories into the database.** The vocabulary file
  stays the single source of truth and the parity test stays green.
- **A separate lowercase `cityKey` for matching.** Unnecessary once
  normalisation is deterministic — `"delhi"` and `"Delhi "` both become
  `"Delhi"`, so an index on the display value is already a matching key.
- **Compound indexes beyond location.** The matching query does not exist yet.
- **Per-step "skip" buttons.** A *next* button that never blocks does the same
  job with one control.
- **Resolving the tagline tension in code.** See below.

---

## The tagline tension

The homepage still reads **"No bios. No filters. Just unhinged energy."** Pingo
now has bios, and this work shapes the fields that filter-based matching will
read next sprint.

Nothing here attempts to fix that. It is recorded because the product is
advertising the opposite of where it is going, and that should be reconciled
deliberately — by changing the copy, or by framing matching as something other
than a filter — rather than drifting into incoherence one feature at a time.
