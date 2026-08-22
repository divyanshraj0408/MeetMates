import { useEffect, useState } from "react";
import axios from "axios";
import ProfileForm from "./ProfileForm.jsx";
import "./profile.css";

function EditProfile({ onDone, onBack }) {
  const [initial, setInitial] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const auth = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, auth)
      .then((res) => setInitial(res.data.profile || {}))
      .catch(() => setInitial({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (fields) => {
    setError("");
    setSaving(true);
    try {
      await axios.put(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, fields, auth);
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!initial) return <div className="pf-page"><div className="loader" /></div>;

  return (
    <div className="pf-page">
      <div className="pf-card">
        <h1 className="pf-title">Your profile</h1>
        <ProfileForm
          initial={initial}
          onSave={save}
          saving={saving}
          error={error}
          submitLabel="Save"
        />
        <button type="button" className="pf-skip" onClick={onBack} disabled={saving}>
          Back
        </button>
      </div>
    </div>
  );
}

export default EditProfile;
