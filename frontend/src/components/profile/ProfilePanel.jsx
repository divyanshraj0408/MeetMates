import { useState } from "react";
import { INTEREST_GROUPS, EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const LABELS = Object.fromEntries(
  INTEREST_GROUPS.flatMap((g) => g.tags.map((t) => [t.slug, t.label]))
);

function ProfilePanel({ profile }) {
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  const place = [profile.region, profile.country].filter(Boolean).join(", ");
  const hasAnything =
    profile.ageBand || place || profile.gender || profile.bio ||
    (profile.interests && profile.interests.length > 0);
  if (!hasAnything) return null;

  return (
    <div className={`pf-panel ${open ? "pf-panel-open" : ""}`}>
      <button
        type="button"
        className="pf-panel-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <img
          className="pf-emoji"
          src={`${EMOJI_BASE}/identification-card_1faaa.png`}
          alt=""
        />
        {open ? "Hide" : "Who's this?"}
      </button>

      {open && (
        <div className="pf-panel-body">
          <div className="pf-panel-facts">
            {profile.ageBand && <span className="pf-fact">{profile.ageBand}</span>}
            {place && <span className="pf-fact">{place}</span>}
            {profile.gender && <span className="pf-fact">{profile.gender}</span>}
          </div>

          {profile.interests?.length > 0 && (
            <div className="pf-chips">
              {profile.interests.map((slug) => (
                <span key={slug} className="pf-chip pf-chip-static">
                  {LABELS[slug] || slug}
                </span>
              ))}
            </div>
          )}

          {profile.bio && <p className="pf-panel-bio">{profile.bio}</p>}
        </div>
      )}
    </div>
  );
}

export default ProfilePanel;
