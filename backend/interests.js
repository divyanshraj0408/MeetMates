// interests.js - the suggested interest vocabulary. Source of truth; mirrored
// in frontend/src/interests.js, with a parity test in interests.test.js.
//
// Suggestions, not a whitelist: anyone can type their own interest. The reason
// the list was closed before was that "music", "Music" and "listening to music"
// are three strings and one interest, which makes matching guesswork. That is
// now normalizeInterest's job instead — free text in, one canonical slug out,
// and typing a word already in this list lands on that word's slug.
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
const LABEL_BY_SLUG = Object.fromEntries(
  INTEREST_GROUPS.flatMap((g) => g.tags.map((t) => [t.slug, t.label]))
);

// Still used, but no longer to accept or reject. It marks which tags came from
// the list above and are therefore already known-good, so only the rest have to
// be moderated.
function isKnownInterest(slug) {
  return typeof slug === "string" && INTEREST_SET.has(slug);
}

const MAX_INTERESTS = 8;
const MAX_INTEREST_LENGTH = 24;

// Free text in, one canonical slug out. "Lo-fi Beats", "lo fi beats" and
// "  LO-FI  BEATS " all become "lo-fi-beats", so one interest typed three ways
// is still one interest. Anything that is not a letter or a digit becomes the
// separator, which means punctuation cannot be used to smuggle two tags into
// one, and a stray emoji cannot become a tag on its own. \p{M} is in the keep
// set because Devanagari matras are combining marks, not letters: without it
// "शायरी" came out as "श-यर".
function normalizeInterest(input) {
  return String(input || "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_INTEREST_LENGTH)
    .replace(/-+$/, "");
}

// Slugs are what gets stored and matched on; this is what a human reads. A
// custom slug has no stored label, so its hyphens go back to spaces — which
// means "lo-fi-beats" displays as "lo fi beats". Storing the typed text
// alongside the slug would keep the hyphen, at the cost of turning a string
// array into an object array everywhere it travels. Not worth it for a dash.
function labelForInterest(slug) {
  return LABEL_BY_SLUG[slug] || String(slug || "").replace(/-/g, " ");
}

module.exports = {
  INTEREST_GROUPS,
  INTEREST_SLUGS,
  isKnownInterest,
  labelForInterest,
  normalizeInterest,
  MAX_INTERESTS,
  MAX_INTEREST_LENGTH,
};
