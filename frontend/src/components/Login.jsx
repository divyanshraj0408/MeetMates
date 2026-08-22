import { useState, useEffect } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pingo is a video-chat app; every session starts with video on. The old
  // opt-out checkbox is gone, so there is nothing left to read at click time.
  const WITH_VIDEO = true;

  const handleGoogleResponse = async (response) => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/auth/google-login`,
        {
          credential: response.credential,
          withVideo: WITH_VIDEO,
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
      if (!user.isAdultConfirmed) {
        localStorage.setItem("needsOnboarding", "true");
      }
      onStart(user.email, WITH_VIDEO);
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
    // callback closes over nothing that changes.
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

        </div>
      </div>
    </>
  );
}

export default Login;
