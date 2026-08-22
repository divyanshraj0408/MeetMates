// neverHaveIEver.js - generates "Never Have I Ever" statements via Groq for
// two matched strangers on a video call. Same shape as moderation.js: axios
// direct to the Groq chat-completions endpoint, GROQ_API_KEY from the
// environment, fail open (return [] rather than throw) on any error, because
// a broken icebreaker must never break the call itself.
const axios = require("axios");

// Escalation ladder. Index also doubles as "how many pairs of rounds have
// been completed" via tierForRound below.
const TIERS = ["playful", "cheeky", "flirty", "suggestive"];

// How many statements we ask Groq for per call. Asking for more than we need:
// the length, compound-clause and second-person filters below all reject
// lines, so the usable count is lower than this. Six took ~720ms live.
const STATEMENTS_PER_BATCH = 10;

// Model verified live against the Groq API. openai/gpt-oss-120b is a
// reasoning model - see the reasoning_effort comment in generateStatements
// for why that matters.
const GROQ_MODEL = "openai/gpt-oss-120b";

// Climbs one tier every 2 completed rounds, clamped at the last tier:
// 0,1 -> playful; 2,3 -> cheeky; 4,5 -> flirty; 6+ -> suggestive.
// Anything that isn't a finite non-negative number (negatives, null,
// strings, NaN) is treated as round 0 rather than thrown on, since this
// feeds straight from client-reported round counts.
function tierForRound(completedRounds) {
  const n = Number(completedRounds);
  const rounds = Number.isFinite(n) && n > 0 ? n : 0;
  const tierIndex = Math.min(Math.floor(rounds / 2), TIERS.length - 1);
  return TIERS[tierIndex];
}

// Cap on how many interest slugs we ever interpolate into a prompt. Keeps
// the prompt short and bounds how much user-typed text reaches the model.
const MAX_SHARED_INTERESTS = 4;

// Intersection of two players' interest slugs, falling back to the union so
// the game still has *something* to work with when nobody overlaps, and to
// [] when neither player has any interests at all. Capped at
// MAX_SHARED_INTERESTS. Defensive against null/undefined/non-array input
// since these arrive from client-controlled profile state.
function sharedInterests(a, b) {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];

  const setB = new Set(listB);
  const intersection = listA.filter((slug) => setB.has(slug));

  if (intersection.length > 0) {
    return intersection.slice(0, MAX_SHARED_INTERESTS);
  }

  // No overlap: union (still deduped) so the prompt has topics to draw on.
  const union = [...new Set([...listA, ...listB])];
  return union.slice(0, MAX_SHARED_INTERESTS);
}

// The model emits non-ASCII despite being told not to in the prompt -
// U+2011 non-breaking hyphen, curly quotes, em/en dashes, ellipsis,
// non-breaking space. Asking politely does not stop this, so normalize in
// code every time. Anything left over that still isn't ASCII gets dropped
// outright (emoji, stray symbols) rather than risk mangled bytes downstream.
function toAscii(text) {
  return String(text)
    .replace(/[‐‑‒–—]/g, "-") // hyphens/dashes -> "-"
    .replace(/[‘’]/g, "'") // curly single quotes -> "'"
    .replace(/[“”]/g, '"') // curly double quotes -> '"'
    .replace(/…/g, "...") // ellipsis -> "..."
    .replace(/ /g, " ") // non-breaking space -> " "
    .replace(/[^\x00-\x7F]/g, "") // strip anything still non-ASCII
    .replace(/\s+/g, " ")
    .trim();
}

// Strips a leading list marker ("1.", "1)", "-", "*") plus following
// whitespace from a single line.
function stripListMarker(line) {
  return line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "");
}

const MAX_STATEMENT_LENGTH = 70;
const COMPOUND = /\b(and then|just to|so that|after a|while i|in order to)\b/i;

// Turns the raw model content into a clean array of statements. Must never
// throw: malformed, empty, null, or refusal responses ("I'm sorry, I can't
// help with that...") all fall through to []. Returning [] is the designed
// failure mode - the game just quietly runs out of questions.
function parseStatements(raw) {
  if (!raw || typeof raw !== "string") return [];

  const seen = new Set();
  const statements = [];

  for (const rawLine of raw.split("\n")) {
    const withoutMarker = stripListMarker(rawLine);
    const clean = toAscii(withoutMarker);
    if (!clean) continue;

    // Only keep lines that actually match the required shape. This is what
    // makes refusals ("I'm sorry, I can't help with that.") and preamble
    // ("Sure, here are some statements:") disappear rather than leak through.
    if (!/^never have i ever\s/i.test(clean)) continue;

    // Length and compound-clause filters. The prompt asks for one deed under
    // 60 characters; these are the enforcement, with a little slack. A line
    // that stacks clauses ("...and then...", "...just to...") is the failure
    // mode that makes a statement so specific nobody can put a finger down.
    if (clean.length > MAX_STATEMENT_LENGTH) continue;
    if (COMPOUND.test(clean)) continue;

    // Drop anything addressed at the other player. The prompt forbids it, but
    // the prompt also forbids non-ASCII and the model emits it anyway, so this
    // is enforced here too. A statement aimed at the person on the call is the
    // app making a pass at a stranger on the player's behalf; a short batch is
    // the cheaper failure. Word boundaries keep "youtuber" and "held" safe.
    if (/\b(you|your|yours|we|us|our|ours)\b/i.test(clean)) continue;

    // No truncation: over-length lines were rejected above rather than cut,
    // because half a statement reads worse than one fewer statement.
    if (seen.has(clean)) continue;
    seen.add(clean);
    statements.push(clean);
  }

  return statements;
}

// Per-tier tone lines. Each carries a contrast anchor rather than a bare
// adjective - bare adjectives ("flirty", "suggestive") produced near-identical
// output in live testing. The ladder only actually escalates once each rung
// is anchored against something concrete.
const TIER_TONE = {
  playful:
    "Tone: playful. Light, silly, everyday embarrassments - school mishaps, " +
    "clumsy moments, harmless lies to a teacher or parent. Things anyone would " +
    "admit to a stranger while laughing.",
  cheeky:
    "Tone: cheeky. Mischievous - proxy attendance, sneaking out, faking sick " +
    "leave, eating someone's tiffin, small revenge on a roommate. Bolder than " +
    "playful: these carry a hint of guilt, not just clumsiness.",
  flirty:
    "Tone: flirty. Crushes, DMs sent at 2am, dating apps, relationships hidden " +
    "from family, bad decisions made for someone attractive. Clearly bolder " +
    "than cheeky: about wanting or chasing someone, not breaking a small rule.",
  suggestive:
    "Tone: suggestive - the boldest a party game gets between consenting adults. " +
    "Attraction, hookups, wanting someone unavailable, drunk decisions, exes, " +
    "hotel check-ins with an ID problem. Innuendo welcome, never graphic or " +
    "anatomical. If a line could be read aloud at an office icebreaker, it is " +
    "too tame - rewrite it.",
};

// Builds the {system, user} prompt pair for one Groq call.
//
// PROMPT INJECTION NOTE: `interests` is free text a user typed, later run
// through normalizeInterest (stripped of punctuation, capped at 24 chars)
// before it ever reaches here - but it is still attacker-controlled text,
// not a trusted enum. It is interpolated ONLY into the `user` message, as a
// plain comma-joined list, and never into the system prompt: the system
// prompt is what pins the model's behaviour (tone, rules, output shape), so
// keeping user-controlled text out of it means a slug like
// "ignore-previous-instruct" is just a topic to weave in, not an instruction
// the model reads as coming from us. It is also never re-expanded, decoded,
// or unescaped - it is inserted verbatim as the plain string it already is.
function buildPrompt(tier, interests) {
  const toneLine = TIER_TONE[tier] || TIER_TONE.playful;

  const system = [
    "You write lines for a 'Never Have I Ever' game played by two Indian adult",
    "strangers (18+) who just matched on a video call. Most are late teens to",
    "late twenties.",
    "",
  toneLine,
    "",
    "THE TEST: out of ten random Indian twenty-somethings, at least three must",
    "be able to put a finger down. If a line is so specific that only one person",
    "alive has done it, it is a dead round. Common and blunt beats clever and rare.",
    "",
    "SHAPE - this is where most attempts fail:",
    "- ONE action. Not an action plus a setting plus a consequence.",
    "- Under 60 characters. Short lines cannot be overstuffed.",
    '- No "and then", no "just to", no "after a", no "so that", no "while".',
    "- No explaining why. The line stops at the deed.",
    "- No stacking Indian nouns to prove the setting. One is plenty, zero is fine.",
    "",
    "Good, because each is one deed and lots of people have done it:",
    "Never have I ever given proxy attendance for a friend",
    "Never have I ever lied to my mom about where I was",
    "Never have I ever stalked an ex on Instagram",
    "Never have I ever cried in a hostel bathroom",
    "Never have I ever kept the change from a grocery run",
    "",
    "Bad, and why:",
    "'Never have I ever let an auntie catch me holding hands in a mall and then fled'",
    "  - three things bolted together, nobody has done exactly this",
    "'Never have I ever used a fake ID to check into a budget hotel after a party'",
    "  - too many qualifiers, too rare",
    "'Never have I ever pretended to understand a teacher's joke to avoid looking stupid'",
    "  - trailing motive clause, and boring",
    "",
    "Indian texture comes from the deed itself, not from decorating it. If a line",
    "reads Indian without naming anything Indian, that is better.",
    "",
    "Avoid American tropes (prom, frat, spring break). Avoid lines everyone",
    "answers yes to with a shrug ('told a lie', 'been late').",
    "",
    "Hard limits: nothing sexual involving minors, nothing non-consensual, no",
    "serious crime, no hard drugs, nothing graphic or anatomical.",
    "",
    "Write about your own past only. Never address the other player.",
    'Never use "you", "your", "yours", "we", "us", "our". Only "I" and "my".',
    "",
    "Output: plain ASCII, Roman script only, no emoji, no curly quotes.",
  `Exactly ${STATEMENTS_PER_BATCH} lines, each starting "Never have I ever ".`,
    "No numbering, no bullets, no preamble, no sign-off.",
  ].join("\n");

  const list = Array.isArray(interests) ? interests.filter(Boolean) : [];
  const user =
    list.length > 0
      ? `Both players are into: ${list.join(", ")}. Work some of that in naturally.`
      : "The players have no known shared interests. Write universal statements anyone can answer.";

  return { system, user };
}

// The Groq call itself. Same axios-direct-to-endpoint shape as
// moderation.js's createGroqClient, but with no retry/circuit-breaking of
// its own: on ANY failure - missing API key, network error, non-200,
// empty content, unparseable content - it logs and resolves to [], never
// throwing and never rejecting. An empty array means "the game quietly runs
// out of questions", which is the intended failure mode: a broken icebreaker
// must not be allowed to break the video call around it.
async function generateStatements(tier, interests) {
  if (!process.env.GROQ_API_KEY) {
    console.error("neverHaveIEver: GROQ_API_KEY is not set, returning no statements.");
    return [];
  }

  try {
    const { system, user } = buildPrompt(tier, interests);
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: GROQ_MODEL,
        temperature: 1.0,
        max_tokens: 1200,
        // REQUIRED. openai/gpt-oss-120b is a reasoning model - without this,
        // reasoning eats the whole token budget and `content` comes back as
        // an empty string with finish_reason "length". Silent failure if
        // this line is ever removed, hence the shouting.
        reasoning_effort: "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        timeout: 15000,
      }
    );

    const content = res.data?.choices?.[0]?.message?.content;
    const statements = parseStatements(content);

    if (statements.length === 0) {
      console.error(
        `neverHaveIEver: Groq returned no usable statements for tier "${tier}".`
      );
    }

    return statements;
  } catch (err) {
    // err is normally an axios/Error instance, but this is the last line of
    // defence for generateStatements' "never throws" contract, so read the
    // message defensively rather than trust err.message to exist.
    const message = err && err.message ? err.message : String(err);
    console.error("neverHaveIEver: Groq call failed, returning no statements:", message);
    return [];
  }
}

module.exports = {
  TIERS,
  tierForRound,
  sharedInterests,
  toAscii,
  parseStatements,
  buildPrompt,
  generateStatements,
  STATEMENTS_PER_BATCH,
};
