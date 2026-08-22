# Never Have I Ever — Design

**Date:** 2026-08-23 · **Status:** approved, not yet implemented

An icebreaker inside the video call. Groq generates the statements, seeded with
what both players are into.

## Mechanics

Either player taps the game button — no invite. The statement appears on both
screens. Each privately taps **"I have"** or **"never"**. When *both* have
answered, the answers reveal together and a **next** button appears.

The other player always has a **✕** that ends the round for both.

**Both-answered is the only thing that advances anything.** One person tapping
alone reveals nothing, unlocks no next, and climbs no tier.

## The heat ladder

Four tiers: `playful → cheeky → flirty → suggestive`. One step up every **two
completed** rounds. Ending and restarting begins at `playful` again, so the top
cannot be reached by re-inviting.

Unilateral start is safe *because* of the ladder: round one is playful, and heat
is only reachable through mutual play. That is the whole consent story — if the
ladder stops gating, the design stops working.

## Generation

`openai/gpt-oss-120b`, six statements per call, one call per tier, cached per
pair. First call on game start; the next tier is prefetched during play, so only
the first has visible latency (~720ms measured).

Four things learned by running it, all load-bearing:

1. **`reasoning_effort: "low"` is required.** Without it reasoning consumes the
   token budget and `content` comes back **empty** with `finish_reason: length`.
   Silent, and the same shape as the bug that killed the moderation gate.
2. **Tier prompts need contrast anchors.** "flirty" and "suggestive" written as
   plain adjectives produced near-identical output. Adding *"if this could
   appear in a round for coworkers it is too tame, rewrite it"* moved the top
   tier decisively. Without anchors the ladder is cosmetic.
3. **Normalize to ASCII in code.** The model emits `‑` (U+2011) and curly quotes
   even when told plain ASCII only. Asking does not work.
4. **Seed with the intersection** of both players' interest slugs, falling back
   to union, then to none. Shared interests are what make statements land.

### Prompt injection

Interests are free text as of this week, and they feed this prompt. Pass
**slugs**, never raw typed text. `normalizeInterest` already strips punctuation
and newlines and caps at 24 characters, so `ignore previous instructions`
arrives as the single token `ignore-previous-instruct`. The mitigation is to not
undo that.

### No output moderation — deliberate

Generated statements are **not** run through a safety classifier.

`moderateMessage` cannot be used: its S2 category blocks sexual content by
design and would reject the feature wholesale. A second, permissive policy was
proposed and declined — the model self-limits (confirmed by testing: it refuses
to get graphic), and a classifier would dilute what makes the feature work.

Recorded so the tradeoff is visible rather than forgotten: this is reversible in
one place. If output drifts, a gate goes in `neverHaveIEver.js` between the Groq
response and the cache, and nothing else changes.

### Failure is silent

Groq down, rate-limited, or returning junk: no next statement, the card closes
with "out of questions". No error UI. A broken game must never break the call.

## UI

A card overlaying the **bottom** of the remote video — `ProfilePanel` owns the
top. Statement centred, two chunky buttons, tier shown as four dots so the
escalation is visible rather than sneaky. Entry is one button in the existing
`.video-controls` cluster.

Mobile-first at 380px, where it sits over the big video and leaves the chat
panel untouched. All selectors prefixed `nhie-`; no bare component selectors.
Palette follows the existing `pf-` cards.

## Architecture

| File | Responsibility |
|---|---|
| `backend/neverHaveIEver.js` (new) | Tier ladder, prompt building, Groq call, ASCII normalization, parsing |
| `backend/neverHaveIEver.test.js` (new) | Ladder arithmetic, intersection, normalization, malformed responses |
| `backend/server.js` | Socket events `gameStart` `gameAnswer` `gameNext` `gameEnd` |
| `frontend/src/components/game/NeverHaveIEver.jsx` (new) | The card |
| `frontend/src/components/game/nhie.css` (new) | `nhie-` styles |
| `frontend/src/components/VideoChat.jsx` | Mount the card, add the control button |

**Round state lives in the existing pair record**, not a new Map. It dies with
the pair, so there is nothing to leak and nothing to clean up. Two separate leaks
in the matching-filters work came from per-socket Maps outliving their purpose.

The Groq call is isolated in `neverHaveIEver.js` so everything except the
network hop is pure and testable — the same split that made `matchFilters.js`
provable.

## Testing

`node:test` over the pure parts: tier index from completed-round count, the
freeze when only one player answers, interest intersection and its two
fallbacks, ASCII normalization of the exact glyphs observed (`‑`, `"`, `"`),
parsing a six-line response, and parsing a malformed or empty one into "no
statements" rather than a crash.

The Groq call itself is not unit tested; it is verified by the E2E checklist.

## Out of scope

Scores, history, persistence, storing generated statements, rematching on the
same statement. Statements are ephemeral per pair.
