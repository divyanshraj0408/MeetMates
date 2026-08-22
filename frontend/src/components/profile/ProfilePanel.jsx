import { useState } from "react";
import { INTEREST_GROUPS, EMOJI_BASE } from "../../interests.js";
import { COUNTRY_BY_CODE } from "../../countries.js";
import "./profile.css";

const LABELS = Object.fromEntries(
  INTEREST_GROUPS.flatMap((g) => g.tags.map((t) => [t.slug, t.label]))
);

/**
 * The only thing a matched partner sees. Rendered in two places: over the
 * partner's video during a call, and as the live preview on the edit screen —
 * the same component in both, so the preview cannot show something the partner
 * would not.
 */
function ProfilePanel({ profile, inCall = false }) {
  // Collapsing only earns its place over video, where the panel is covering
  // someone's face. As a preview it is the whole point of the block it sits in,
  // so it is simply always open and has no toggle to mis-fire.
  const [open, setOpen] = useState(false);
  const isOpen = inCall ? open : true;
  const p = profile || {};

  const country = COUNTRY_BY_CODE[p.countryCode] || "";
  const place = [p.city, country].filter(Boolean).join(", ");
  const tags = p.interests || [];
  const hasAnything = p.ageBand || place || p.gender || p.bio || tags.length > 0;

  // In a call an empty profile shows nothing at all. On the edit screen the
  // empty state is the point — it is what the user is being warned about.
  if (inCall && !hasAnything) return null;

  return (
    <div className={`pf-panel ${inCall ? "pf-panel-incall" : ""}`}>
      {inCall && (
        <button
          type="button"
          className="pf-panel-toggle"
          aria-label={open ? "hide their profile" : "see their profile"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <img
            className="pf-emoji"
            src={`${EMOJI_BASE}/identification-card_1faaa.png`}
            alt=""
          />
        </button>
      )}

      {isOpen && (
        <div className="pf-panel-body">
          {!hasAnything && (
            <p className="pf-panel-empty">
              nothing here yet. they'd just see a blank card.
            </p>
          )}

          {(p.ageBand || place || p.gender) && (
            <div className="pf-panel-facts">
              {p.ageBand && <span className="pf-fact">{p.ageBand}</span>}
              {place && <span className="pf-fact">{place}</span>}
              {p.gender && <span className="pf-fact">{p.gender}</span>}
            </div>
          )}

          {tags.length > 0 && (
            <div className="pf-panel-tags">
              {tags.map((slug) => (
                <span key={slug} className="pf-panel-tag">
                  {LABELS[slug] || slug}
                </span>
              ))}
            </div>
          )}

          {p.bio && <p className="pf-panel-bio">{p.bio}</p>}
        </div>
      )}
    </div>
  );
}

export default ProfilePanel;
