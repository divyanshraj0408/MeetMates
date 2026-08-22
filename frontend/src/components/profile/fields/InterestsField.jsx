import { useMemo, useState } from "react";
import { MAX_INTERESTS, labelForInterest } from "../../../interests.js";
import { interestSuggest, TAG_BY_SLUG } from "./interestSuggest.js";

function InterestsField({ value = [], onChange }) {
  const [query, setQuery] = useState("");

  const { suggestions, typed, canAddTyped, full } = useMemo(
    () => interestSuggest(query, value),
    [query, value]
  );

  const add = (slug) => {
    if (full || !slug || value.includes(slug)) return;
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
            const tag = TAG_BY_SLUG[slug];
            return (
              <button
                key={slug}
                type="button"
                className={`pf-chip pf-chip-${tag?.group || "typed"} pf-chip-on`}
                onClick={() => remove(slug)}
                aria-label={`remove ${labelForInterest(slug)}`}
              >
                {labelForInterest(slug)} <span className="pf-chip-x">×</span>
              </button>
            );
          })}
        </div>
      )}

      <input
        className="pf-input"
        placeholder={full ? "that's eight, nice" : "type anything — shayari, lo-fi, chess..."}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // A suggestion wins over the raw text, so typing "cri" and hitting
            // enter gives you "cricket" rather than a tag nobody else has.
            add(suggestions[0]?.slug || typed);
          }
        }}
        disabled={full}
      />

      {!full && (suggestions.length > 0 || canAddTyped) && (
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

          {canAddTyped && (
            <button
              type="button"
              className="pf-chip pf-chip-add"
              onClick={() => add(typed)}
            >
              + {labelForInterest(typed)}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default InterestsField;
