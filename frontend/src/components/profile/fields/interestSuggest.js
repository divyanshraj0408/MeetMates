// interestSuggest.js - what the interests field should offer for a given query.
// Extracted from the component so it can be tested without a DOM: the rules
// about what appears where are small, easy to get subtly wrong, and the last
// interests bug was a chip rendering twice.
import { INTEREST_GROUPS, MAX_INTERESTS, normalizeInterest } from "../../../interests.js";

// Groups still exist in the data — they drive chip colour and the game's prompt
// generation — but they are no longer shown. Seven labelled sections was more
// classification than picking a few tags needs.
export const ALL_TAGS = INTEREST_GROUPS.flatMap((g) =>
  g.tags.map((t) => ({ ...t, group: g.key }))
);
export const TAG_BY_SLUG = Object.fromEntries(ALL_TAGS.map((t) => [t.slug, t]));

export const MAX_SUGGESTIONS = 6;

/**
 * @param {string} query   raw text in the input
 * @param {string[]} value slugs already picked
 * @returns {{suggestions: object[], typed: string, canAddTyped: boolean, full: boolean}}
 *   `typed` is what the query would be stored as, so the "+" chip can show the
 *   user the exact slug they are about to create — and it is the same slug the
 *   server computes from the same text.
 */
export function interestSuggest(query, value = []) {
  const full = value.length >= MAX_INTERESTS;
  const q = String(query || "").trim().toLowerCase();

  const suggestions = ALL_TAGS.filter(
    (t) => !value.includes(t.slug) && (!q || t.label.toLowerCase().includes(q))
  ).slice(0, MAX_SUGGESTIONS);

  const typed = normalizeInterest(query);
  const canAddTyped =
    !full &&
    typed !== "" &&
    !value.includes(typed) &&
    // A word already offered above would otherwise appear twice in one row.
    !suggestions.some((t) => t.slug === typed);

  return { suggestions, typed, canAddTyped, full };
}
