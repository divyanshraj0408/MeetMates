# Matching Filters Design

**Date:** 2026-08-22
**Status:** approved, not yet implemented

## What this is

The start page has two chips — "Anybody" and "Worldwide" — that have always been
decorative `<div>`s. Gender and country are now stored on the profile, so the
chips can do what they have been claiming to do since the page was written.

## What exists today

`matchUsers()` in `backend/server.js` pairs the first two compatible sockets in a
FIFO array. Three facts about it shape this design:

**It only runs on an event.** `findChat`, `next` and `leaveChat` call it. There
is no timer. Today that is invisible, because any two waiting people always pair,
so the queue never holds two people at once for long. Filters break that
assumption: the queue can hold several mutually incompatible people, and nothing
will retry the match until somebody else happens to act.

**There are two near-identical pairing loops, and one is unreachable.**
`matchUsersByVideoPreference` splits the queue into video and text-only users,
then `matchRemainingUsers` pairs whatever is left. `WITH_VIDEO` is hardcoded
`true` in `Login.jsx:21` since the opt-out checkbox was removed, so every user
lands in the video bucket and `matchRemainingUsers` never runs. Adding a filter
check without consolidating would mean writing the same predicate twice and
keeping two copies in step.

**Profile data is not in the matching layer at all.** `visibleProfileFor(socket)`
does a `findOne` at pair time. The match loop is O(n²) over the queue, so a DB
read inside it is not an option.

## Decisions

These were chosen explicitly; they are not defaults.

### Gender filtering is one-way

Picking "Women" means you are matched with women. It does not require the other
person to have opted into your gender.

In practice both sides' filters are still consulted, because pairing A with B
when A's filter rejects B would violate A's filter. The rule is:

```
pair is valid  <->  accepts(A.filter, A.attrs, B.attrs)
               AND  accepts(B.filter, B.attrs, A.attrs)
```

A filter is evaluated against its owner's own attributes as well as the
candidate's, because "my country" is relative to whoever set it.

An unset filter accepts everyone. So a person who set no filter is matchable by
anyone; a person who set "Women" is not handed a man.

The alternative — requiring both people to have actively opted into each other's
gender — was considered and rejected as too restrictive for the current user
base.

### Missing attributes are wildcards

Someone who never set a gender is eligible for every gender filter. Someone who
never set a country is eligible for "my country". The pool stays usable while
most accounts have empty profiles.

**Consequence, stated so it is not discovered later:** picking "Women" can hand
you someone whose gender is unknown. That is the accepted cost of not making
profileless users invisible.

**`"prefer not to say"` is treated exactly like unset** — a wildcard, eligible
for every filter. Someone picks that value specifically to not be sorted on;
treating it as a hard non-match would silently hide them from every filtering
user, which is the opposite of what they asked for.

**`"non-binary"` is not a wildcard.** It matches "Anybody" and nothing else,
because it is a real answer rather than a missing one. This means non-binary
users are unreachable by anyone filtering for men or women. That follows from a
three-state chip and is called out here as a known limit, not an oversight.

The chip's three states map onto the stored `GENDERS` values as: Anybody ->
no filter, Men -> `"man"`, Women -> `"woman"`.

### Location is country-level only

Two states: worldwide, or same country. `countryCode` is a stored ISO alpha-2
code, so this is an exact string comparison.

City was rejected: `normalizeCity` is free text, so "Delhi" and "New Delhi" are
different cities that will never match each other, and on a small user base a
city filter finds nobody. Regions were rejected as needing a 249-country mapping
that does not exist.

If the searcher has no country set, "my country" has nothing to compare against
and behaves as worldwide.

### Location relaxes automatically, gender never does

The stall case that survives the wildcard rule: you want women, three men are
queued, nobody new arrives. Today all four would have paired.

Fifteen seconds after joining the queue, a waiting user's **location** filter
drops to worldwide and the match runs again. **Gender is never relaxed
automatically.** It widens only when the user presses "match me with anyone".

Location is the preference people hold weakly and gender is the one they hold
strongly, so this unsticks the common case without silently handing someone the
thing they explicitly filtered out. Auto-relaxing everything was rejected for
that reason; never relaxing anything was rejected because on this user base most
sessions would end in a manual downgrade anyway.

The same timer doubles as the retry loop the queue currently lacks.

## Architecture

```
findChat(email, filters)
   ├─ read {gender, countryCode} once, cache by socket id
   ├─ store this session's filters by socket id
   ├─ start the 15s relax timer
   └─ matchUsers()
         └─ for each candidate pair: canPairByFilters(a, b)
```

### `backend/matchFilters.js` (new)

Pure. No sockets, no database, no timers. Two exported functions:

```js
accepts(filter, selfAttrs, otherAttrs) -> boolean
canPairByFilters(a, b) -> boolean   // a, b = { filter, attrs }
```

This is where every decision above is encoded, and it is the only part of
matching that is currently testable at all.

### Attribute cache

A `Map<socketId, {gender, countryCode}>`, filled by one read when the user enters
the queue and deleted on disconnect.

It holds **exactly those two fields**, never the user document. This is the same
discipline as `buildPartnerPayload`: a spread here is how an email would end up
in matchmaking state. The cache is not sent to any client — it exists only to
decide pairings.

Filters live in a parallel `Map<socketId, {gender, location}>`. They are a
session choice, not profile data, and are not persisted server-side.

### One pairing loop

`matchUsersByVideoPreference` and `matchRemainingUsers` collapse into a single
loop that walks the queue and pairs the first compatible couple, where compatible
means `canPair` (the existing next-cooldown rule) **and** `canPairByFilters`.

`withVideo` stays in the pair record and the `chatStart` payload; only the
dead queue-splitting goes.

### Relax timer

`Map<socketId, TimeoutId>`. Set on queue entry, cleared on match, on disconnect,
and on leaving the queue. On fire: set that socket's location filter to
worldwide, emit `searchWidened` so the UI can say so, and call `matchUsers()`.

## Frontend

The two chips become buttons:

- **Gender** cycles Anybody → Men → Women
- **Location** toggles Worldwide → My country

Both persist to `localStorage` next to `withVideo`, and both ride along on the
`findChat` payload.

"My country" is unavailable, with a short hint, when the profile has no country
set — it would be a no-op otherwise.

The waiting screen shows the active filters, says when the search widens, and
carries the "match me with anyone" button.

All new CSS is prefixed. Any new scroll container gets `min-height: 0` checked on
every ancestor.

## Testing

`matchFilters.js` gets a `node:test` suite covering: an unset filter accepting
everyone; a set filter rejecting a mismatch; unset and `"prefer not to say"`
attributes as wildcards; `"non-binary"` matching only "Anybody"; "my country"
with the searcher's own country missing; and the both-sides-consulted rule, in
both orders.

The pairing-loop consolidation is behaviour-preserving when no filters are set,
which the existing pairing tests should confirm without modification.

## Out of scope

- **Interest-based matching.** Separate problem, separate spec.
- **The online count.** "12 making sure she's ok" will start including people you
  cannot be matched with. Worth fixing; not here.
- **Blocking and reporting.** Still deferred.

## What this is not

One-way gender filtering is only as good as a self-reported, unverified field.
Anyone who wants to reach women can set their own gender to "woman". This filter
shapes ordinary use. It is not a safety control and must not be described to
users as one.
