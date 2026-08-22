import { useMemo, useState } from "react";
import { INTEREST_GROUPS, MAX_INTERESTS } from "../../../interests.js";

// Flatten the vocabulary. Groups still exist in the data — they drive chip
// colour and the game's prompt generation — but they are no longer shown.
// Seven labelled sections was more classification than picking a few tags needs.
const ALL_TAGS = INTEREST_GROUPS.flatMap((g) =>
  g.tags.map((t) => ({ ...t, group: g.key }))
);
const BY_SLUG = Object.fromEntries(ALL_TAGS.map((t) => [t.slug, t]));
const MAX_SUGGESTIONS = 6;

function InterestsField({ value = [], onChange }) {
  const [query, setQuery] = useState("");
  const full = value.length >= MAX_INTERESTS;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_TAGS.filter(
      (t) => !value.includes(t.slug) && (!q || t.label.toLowerCase().includes(q))
    ).slice(0, MAX_SUGGESTIONS);
  }, [query, value]);

  const add = (slug) => {
    if (full || value.includes(slug)) return;
    onChange([...value, slug]);
    setQuery("");
  };

  const remove = (slug) => onChange(value.filter((s) => s !== slug));

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

      {value.length > 0 && (
        <div className="pf-chips pf-picked">
          {value.map((slug) => {
            const tag = BY_SLUG[slug];
            return (
              <button
                key={slug}
                type="button"
                className={`pf-chip pf-chip-${tag?.group || "other"} pf-chip-on`}
                onClick={() => remove(slug)}
                aria-label={`remove ${tag?.label || slug}`}
              >
                {tag?.label || slug} <span className="pf-chip-x">×</span>
              </button>
            );
          })}
        </div>
      )}

      <input
        className="pf-input"
        placeholder={full ? "that's eight, nice" : "start typing — music, cricket, anime..."}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (suggestions[0]) add(suggestions[0].slug);
          }
        }}
        disabled={full}
      />

      {!full && suggestions.length > 0 && (
        <div className="pf-chips pf-suggest">
          {suggestions.map((tag) => (
            <button
              key={tag.slug}
              type="button"
              className={`pf-chip pf-chip-${tag.group}`}
              onClick={() => add(tag.slug)}
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}

      {!full && query.trim() && suggestions.length === 0 && (
        <p className="pf-hint">nothing matches that one</p>
      )}
    </>
  );
}

export default InterestsField;
