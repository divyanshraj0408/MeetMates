import { useEffect, useState } from "react";
import axios from "axios";
import ProfilePanel from "./ProfilePanel.jsx";
import AgeField from "./fields/AgeField.jsx";
import PlaceField from "./fields/PlaceField.jsx";
import GenderField from "./fields/GenderField.jsx";
import InterestsField from "./fields/InterestsField.jsx";
import BioField from "./fields/BioField.jsx";
import { EMOJI_BASE } from "../../interests.js";
import "./profile.css";

const Emoji = ({ slug }) => (
  <img className="pf-emoji" src={`${EMOJI_BASE}/${slug}.png`} alt="" />
);

const EMPTY = {
  ageBand: "",
  countryCode: "",
  city: "",
  gender: "",
  interests: [],
  bio: "",
};

function EditProfile({ onDone, onBack }) {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(false);

  const auth = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, auth)
      .then((res) => setProfile({ ...EMPTY, ...(res.data.profile || {}) }))
      .catch(() => setProfile(EMPTY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await axios.put(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, profile, auth);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "that didn't save. try again");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="pf-page">
        <div className="loader" style={{ margin: "auto" }} />
      </div>
    );
  }

  return (
    <div className="pf-page">
      <div className="pf-edit">
        <div className="pf-edit-scroll">
          <h1 className="pf-edit-title">your vibe</h1>
          <p className="pf-edit-sub">this is all anyone sees. nothing else.</p>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="birthday-cake_1f382" /> how old are you
            </p>
            <AgeField value={profile.ageBand} onChange={(ageBand) => set({ ageBand })} />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="globe-showing-asia-australia_1f30f" /> where you at
            </p>
            <PlaceField
              countryCode={profile.countryCode}
              city={profile.city}
              onChange={set}
            />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="man_1f468" /> how do you show up
            </p>
            <GenderField value={profile.gender} onChange={(gender) => set({ gender })} />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="sparkles_2728" /> what are you into
            </p>
            <InterestsField
              value={profile.interests}
              onChange={(interests) => set({ interests })}
            />
          </div>

          <div className="pf-field">
            <p className="pf-field-label">
              <Emoji slug="writing-hand_270d-fe0f" /> say something
            </p>
            <BioField value={profile.bio} onChange={(bio) => set({ bio })} />
          </div>

          {error && <p className="pf-error">{error}</p>}

          <button type="button" className="pf-back" onClick={onBack} disabled={saving}>
            back to the lobby
          </button>
        </div>

        {/* The real panel, in the collapsed state a partner first meets. */}
        <div className="pf-bar">
          <div className="pf-bar-preview">
            {/* onToggle hands the open state to this page, so the panel's own
                button opens the sheet instead of expanding in place. */}
            <ProfilePanel profile={profile} onToggle={() => setSheet(true)} />
          </div>
          <button type="button" className="pf-save" onClick={save} disabled={saving}>
            {saving ? "locking in..." : "lock it in"}
          </button>
        </div>
      </div>

      {sheet && (
        <div className="pf-sheet" onClick={() => setSheet(false)}>
          <div className="pf-sheet-inner" onClick={(e) => e.stopPropagation()}>
            <ProfilePanel profile={profile} startOpen />
          </div>
        </div>
      )}
    </div>
  );
}

export default EditProfile;
