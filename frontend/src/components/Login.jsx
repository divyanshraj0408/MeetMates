import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./login.css";
import { renderGoogleButton } from "../googleAuth.js";
import Navbar from "./Navbar.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function Login({
  onStart,
  setToken = () => {},
  goBack,
  doBackDisplay,
  doLoginDisplay,
}) {
  const [withVideo, setWithVideo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Google renders its button once and keeps the callback it was given, so a
  // callback closing over `withVideo` would be frozen at its initial value.
  // The ref is read at click time instead.
  const withVideoRef = useRef(withVideo);
  useEffect(() => {
    withVideoRef.current = withVideo;
  }, [withVideo]);

  const handleGoogleResponse = async (response) => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/auth/google-login`,
        {
          credential: response.credential,
          withVideo: withVideoRef.current,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const { token, user } = res.data;
      if (!token) {
        setError("Sign-in did not complete. Try again.");
        return;
      }

      localStorage.setItem("token", token);
      setToken(token);
      onStart(user.email, withVideoRef.current);
    } catch (err) {
      console.error("Google login error:", err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Could not reach the server. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return renderGoogleButton("google-signin-btn", CLIENT_ID, handleGoogleResponse);
    // Mounted once: the container is no longer conditionally rendered, and the
    // callback reads withVideo through a ref rather than a closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Navbar
        goBack={goBack}
        doBackDisplay={doBackDisplay}
        doLoginDisplay={doLoginDisplay}
      />
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>Welcome to the party!</h1>
            <h2>Sign in to Pingo with Google</h2>
          </div>

          <div id="google-signin-btn" className="google-sdk-button" />

          {loading && <div className="loader" style={{ marginTop: "10px" }} />}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={withVideo}
              onChange={() => setWithVideo((on) => !on)}
              disabled={loading}
            />
            <span className="checkbox-text">Enable video chat</span>
          </label>
        </div>
      </div>
    </>
  );
}

export default Login;
