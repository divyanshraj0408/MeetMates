// interests.js - mirror of backend/interests.js. Kept in step by the parity
// test in backend/interests.test.js. Edit the backend copy first.
//
// Fixed rather than free text: "music", "Music" and "listening to music" are
// three strings and one interest, which makes matching guesswork and gives the
// game mushy material to generate from.
//
// Emoji are slugs on em-content.zobj.net/source/apple/419/, matching the
// pattern already used in StartingPage.jsx. One per group, not per tag —
// thirty-five emoji is noise, seven reads as structure.
export const INTEREST_GROUPS = [
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

export const INTEREST_SLUGS = INTEREST_GROUPS.flatMap((g) =>
  g.tags.map((t) => t.slug)
);
export const MAX_INTERESTS = 8;
export const EMOJI_BASE = "https://em-content.zobj.net/source/apple/419";
