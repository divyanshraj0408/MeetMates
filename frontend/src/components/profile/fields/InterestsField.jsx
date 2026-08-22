import { INTEREST_GROUPS, MAX_INTERESTS, EMOJI_BASE } from "../../../interests.js";

function InterestsField({ value = [], onChange }) {
  const full = value.length >= MAX_INTERESTS;

  const toggle = (slug) => {
    if (value.includes(slug)) {
      onChange(value.filter((s) => s !== slug));
    } else if (!full) {
      onChange([...value, slug]);
    }
  };

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

      {INTEREST_GROUPS.map((group) => (
        <div key={group.key} className="pf-group">
          <p className="pf-group-label">
            <img className="pf-emoji" src={`${EMOJI_BASE}/${group.emoji}.png`} alt="" />
            {group.label}
          </p>
          <div className="pf-chips">
            {group.tags.map((tag) => {
              const on = value.includes(tag.slug);
              return (
                <button
                  key={tag.slug}
                  type="button"
                  className={`pf-chip pf-chip-${group.key} ${on ? "pf-chip-on" : ""}`}
                  onClick={() => toggle(tag.slug)}
                  disabled={!on && full}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export default InterestsField;
