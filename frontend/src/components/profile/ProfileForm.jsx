import { useState } from "react";
import { INTEREST_GROUPS, MAX_INTERESTS, EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const AGE_BANDS = ["18-21", "22-25", "26-30", "31-40", "41+"];
const GENDERS = ["man", "woman", "non-binary", "prefer not to say"];
const MAX_BIO = 200;

const Emoji = ({ slug, alt }) => (
  <img className="pf-emoji" src={`${EMOJI_BASE}/${slug}.png`} alt={alt} />
);

function ProfileForm({ initial = {}, onSave, saving, error, submitLabel }) {
  const [ageBand, setAgeBand] = useState(initial.ageBand || "");
  const [country, setCountry] = useState(initial.country || "");
  const [region, setRegion] = useState(initial.region || "");
  const [gender, setGender] = useState(initial.gender || "");
  const [interests, setInterests] = useState(initial.interests || []);
  const [bio, setBio] = useState(initial.bio || "");

  const atLimit = interests.length >= MAX_INTERESTS;

  const toggleInterest = (slug) => {
    setInterests((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : current.length < MAX_INTERESTS
        ? [...current, slug]
        : current
    );
  };

  const submit = (event) => {
    event.preventDefault();
    onSave({ ageBand, country, region, gender, interests, bio });
  };

  return (
    <form className="pf-form" onSubmit={submit}>
      <fieldset className="pf-field">
        <legend>
          <Emoji slug="birthday-cake_1f382" alt="" /> Age
        </legend>
        <div className="pf-chips">
          {AGE_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              className={`pf-chip ${ageBand === band ? "pf-chip-on" : ""}`}
              onClick={() => setAgeBand(ageBand === band ? "" : band)}
            >
              {band}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="globe-showing-asia-australia_1f30f" alt="" /> Where you are
        </legend>
        <div className="pf-row">
          <input
            className="pf-input"
            placeholder="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={56}
          />
          <input
            className="pf-input"
            placeholder="State or city"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            maxLength={85}
          />
        </div>
        <p className="pf-hint">Keep it broad — a city, not your street.</p>
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="man_1f468" alt="" />
          <Emoji slug="woman-red-hair_1f469-200d-1f9b0" alt="" /> Gender
        </legend>
        <div className="pf-chips">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              className={`pf-chip ${gender === g ? "pf-chip-on" : ""}`}
              onClick={() => setGender(gender === g ? "" : g)}
            >
              {g}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="sparkles_2728" alt="" /> Interests
          <span className="pf-count">
            {interests.length}/{MAX_INTERESTS}
          </span>
        </legend>
        {INTEREST_GROUPS.map((group) => (
          <div key={group.key} className="pf-group">
            <p className="pf-group-label">
              <Emoji slug={group.emoji} alt="" /> {group.label}
            </p>
            <div className="pf-chips">
              {group.tags.map((tag) => {
                const on = interests.includes(tag.slug);
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    className={`pf-chip ${on ? "pf-chip-on" : ""}`}
                    onClick={() => toggleInterest(tag.slug)}
                    disabled={!on && atLimit}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="pf-field">
        <legend>
          <Emoji slug="writing-hand_270d-fe0f" alt="" /> About you
        </legend>
        <textarea
          className="pf-bio"
          placeholder="One or two lines. What should someone know?"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={MAX_BIO}
        />
        <p className="pf-hint">
          {MAX_BIO - bio.length} left. No handles or numbers — Pingo keeps you
          unfindable after a call.
        </p>
      </fieldset>

      {error && (
        <p className="pf-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="pf-save" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
        <Emoji slug="high-voltage_26a1" alt="" />
      </button>
    </form>
  );
}

export default ProfileForm;
