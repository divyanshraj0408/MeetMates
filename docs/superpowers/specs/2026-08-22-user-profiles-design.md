# User Profiles — Design Spec

Date: 2026-08-22
Status: Approved (pending spec review)

First of three related specs. The other two — profile-based matching, and the
Never Have I Ever game — depend on this one and are not designed here.

## The product decision this rests on

Before any schema, one question had to be settled: what is Pingo now?

It has been an anonymous video roulette. The 1:1 chat was made deliberately
anonymous — no names, no avatars, and `senderEmail` was removed from the wire so
a stranger could not learn who you are. Profiles pull in the opposite direction.

The resolution is that "anonymous" was covering two different things:

- **Linkability** — can this stranger find you afterwards? Name, email, photo,
  social handle.
- **Disclosure** — what do they learn about you during the call? Age, gender,
  region, interests.

It is a video call. The camera already reveals approximate age, gender
presentation, and often region. Disclosure was never really protected. What was
protected, and what is worth keeping, is unlinkability.

**Pingo is therefore unlinkable but descriptive.** A stranger sees what you are
like and cannot find you afterwards. Profiles are visible during a call and feed
matching; name, email, profile photo and any handle never appear.

## Goal

Let a user describe themselves — age band, country and region, gender,
interests, and a short bio — and show that to the person they are matched with,
without making them findable.

## Non-Goals

- **Matching logic.** This spec stores and displays; it does not change how
  people are paired. That is the next spec, which consumes these fields.
- **The game.** Interest tags are shaped to be good input for it, but nothing
  here generates prompts.
- **Gender filtering.** Gender is displayed, never filterable. See Deferred.
- **Profiles in the public room.** Display is scoped to the 1:1 call.
- **Account deletion.** Named in Deferred; it is not built here.

## Age model

A single mandatory checkbox at onboarding: *"I confirm I am 18 or over."*
Stored as `isAdultConfirmed` with a timestamp. Under-18 users are not admitted.

Age is separately an **optional profile field**, stored and shown as a band
rather than a number.

These are two different things and the distinction is deliberate. The checkbox
is the gate; the band is a profile attribute. Because the gate does the
enforcing, no date of birth is ever collected — the exact number is not needed,
and data not held cannot leak.

Self-declared age is weak wherever it is used. This design is the one where
being lied to does least harm: a minor who lies enters a pool where everyone
expects adults, rather than one where safety depends on segregating minors from
adults by a claim that takes one click to falsify.

## Schema

Added to `backend/models/User.js`:

```js
  isAdultConfirmed: { type: Boolean, default: false },
  adultConfirmedAt: { type: Date },

  profile: {
    ageBand:   { type: String, enum: AGE_BANDS },
    country:   { type: String, trim: true, maxlength: 56 },
    region:    { type: String, trim: true, maxlength: 85 },
    gender:    { type: String, enum: GENDERS },
    interests: { type: [String], validate: atMostEightKnownTags },
    bio:       { type: String, trim: true, maxlength: 200 },
    updatedAt: { type: Date },
  },
```

`AGE_BANDS` is `["18-21", "22-25", "26-30", "31-40", "41+"]`.
`GENDERS` is `["man", "woman", "non-binary", "prefer not to say"]`.

Every profile field is optional. A user who skips onboarding entirely still has
a working account.

**Region must stay broad** — a state or a city, never a neighbourhood or
postcode. A precise location alongside a live video feed erodes unlinkability
in a way the other fields do not.

## Interests are a fixed vocabulary

Interests are tag slugs drawn from a fixed list of thirty-five, not free text,
capped at eight per user.

Free text would make matching guesswork — "music", "Music" and "listening to
music" are three different strings and one interest — and would give the game
mushy material to generate from. A fixed vocabulary gives exact overlap counts
for matching and clean, predictable input for prompt generation.

The vocabulary lives in one module shared by the frontend picker and backend
validation, so the two cannot drift. The starting set, grouped for the picker:

```
music        indie · hip-hop · classical · pop · metal
screen       anime · k-drama · movies · sitcoms
play         cricket · football · gym · chess · valorant · bgmi
make         coding · design · photography · writing · music-production
mind         books · history · space · startups · finance
out          travel · food · cafes · trekking · biking
other        pets · fashion · standup · politics · languages
```

Thirty-five tags across seven groups. Weighted towards what an Indian college
and early-career audience actually picks, since that is who uses Pingo — a
generic global list would leave most users with two vague tags and give both
matching and the game nothing to work with. The list is data, not structure:
adding to it later needs no schema change.

## The bio is the hole in unlinkability

Every other field is safely non-identifying. The bio is not. A user writes
*"IG: @divyansh"* or *"add me on snap"* and the entire model collapses — not
through an attack, just through someone being friendly.

The bio therefore gets three protections the other fields do not:

1. A 200-character cap.
2. A pass through the existing moderation gate (`moderateMessage`) before it is
   saved. It is user-authored text shown to strangers, exactly what that gate is
   for.
3. A **contact-handle check** rejecting social handles, phone numbers and email
   addresses, with a message explaining why rather than a silent failure.

Only the third is new. It should catch at minimum: `@handle`, `ig:`/`insta`/
`snap`/`tg`/`telegram` followed by a name, bare digit runs of 10 or more, and
obfuscated emails (`me at gmail dot com`).

**This reduces casual leakage; it does not prevent disclosure.** Someone
determined can read their handle aloud on camera and nothing in software stops
that. The goal is that the default is unlinkable, not that it is enforced.

## Onboarding

Shown after the first Google sign-in, before the lobby.

The 18+ checkbox is the only mandatory item. Everything else is skippable: a
long form on first use costs users, and a half-filled profile still matches
better than an empty one.

Interests are pushed hardest of the optional fields, because both matching
quality and game quality rest on them.

A returning user with an empty profile sees a dismissible nudge in the lobby,
never a wall.

## Where profiles appear

In the **1:1 call only** — a collapsible panel beside the video showing age
band, country and region, gender, interest tags and bio.

Deliberately not in the public room. That room now shows real first names;
layering profiles onto a named group chat is a separate product question that
should be answered on purpose rather than by extension.

## Editing

An edit screen reachable from the lobby, using the same form as onboarding.
Every field is individually clearable — a user who fills in gender and regrets
it must be able to empty it, not just change it.

## Testing

Pure and unit-testable:
- Age band validation: each valid band accepted, anything else rejected.
- Tag validation: unknown slugs rejected; more than eight rejected; duplicates
  collapsed.
- The contact-handle detector, which is the piece protecting unlinkability and
  so deserves real cases: `@divyansh`, `ig: divyansh`, `snap - divyansh`,
  `9876543210`, `+91 98765 43210`, `me at gmail dot com`, and negatives that
  must pass — `I'm 3rd year`, `email me later maybe`, `at the gym at 5`.
- Bio length cap enforced at the schema level, not only in the UI.

Manual:
- First sign-in shows onboarding; the 18+ box blocks continuing until ticked.
- Skipping every optional field still lands in the lobby with a working account.
- A profile fills in, persists across reload, and each field clears individually.
- The panel appears in a 1:1 call and never in the public room.
- A bio containing a handle is rejected with an explanation.
- Name, email and profile photo appear nowhere in the call UI or in any socket
  payload — the same devtools check used for `senderEmail`.

## Deferred

- **Number of past relationships.** Requested, deliberately left out. Shown to a
  stranger on a live video call it is high-sensitivity and weak as a matching
  signal, and alongside the game's naughty tier it sets a tone that worsens the
  harassment dynamics below. Easy to add later if wanted.
- **Gender filtering.** Gender is displayed, not filterable. Filtering is what
  concentrates unwanted attention: the pool skews male, anyone listing female is
  swamped, and they leave. Revisit only together with blocking and reporting.
- **Blocking and reporting.** Not needed for this spec, and a prerequisite for
  gender filtering. Also the honest answer to "what if my match is abusive",
  which profiles make more pointed by making people more identifiable to each
  other in the moment.
- **Account and data deletion.** Once Pingo stores age, gender, region and a
  bio, this stops being optional politeness. Its own small spec.

## Decisions taken

- Pingo is unlinkable but descriptive: descriptive attributes shown, identity
  never.
- 18+ by checkbox at onboarding; age separately optional and banded; no date of
  birth collected.
- Interests are a fixed shared vocabulary, capped at eight.
- The bio is moderated and contact-handle checked; everything else is not.
- Profiles display in 1:1 calls only.
- Gender is stored and shown but not filterable.
