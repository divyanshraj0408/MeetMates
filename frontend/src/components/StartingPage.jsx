import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import ChatPanel from "./chat/ChatPanel";
import "./startpage.css";
import "./profile/profile.css";

// Kept in step with backend/matchFilters.js by hand. Three strings is below the
// bar that earned interests.js and countries.js a mirrored file plus a parity
// test; the server sanitizes anything it does not recognise anyway.
const GENDER_CYCLE = ["", "man", "woman"];
const GENDER_LABEL = { "": "Anybody", man: "Men", woman: "Women" };

function StartPage({
  onStartChat,
  onLogout,
  onlineUserCount,
  loading,
  globalMessages = [],
  myUid,
  typingNames = [],
  onSendGlobal,
  onReactGlobal,
  onTypingGlobal,
  onEditProfile,
  onWidenSearch,
  searchWidened,
}) {
  const videoRef = useRef(null);
  // Mobile only: the right box shows one pane at a time. Desktop shows both.
  const [mobileTab, setMobileTab] = useState("chat");

  // Validated on read, not just defaulted. localStorage outlives any build, so
  // a value we stopped recognising still shows up here. An unvetted one is
  // truthy enough to light the chip up as active while GENDER_LABEL has no
  // entry for it, leaving a lit chip with a blank label — the server would
  // sanitize it away, so the UI would claim a filter that is not being applied.
  const [genderFilter, setGenderFilter] = useState(() => {
    const stored = localStorage.getItem("filterGender") || "";
    return GENDER_CYCLE.includes(stored) ? stored : "";
  });
  const [locationFilter, setLocationFilter] = useState(() => {
    const stored = localStorage.getItem("filterLocation");
    return stored === "country" ? "country" : "worldwide";
  });
  // "My country" needs a country to compare against. EditProfile fetches its own
  // profile rather than App holding it, so this follows the same pattern.
  const [myCountry, setMyCountry] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    axios
      .get(`${import.meta.env.VITE_BACKEND_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setMyCountry(res.data.profile?.countryCode || ""))
      .catch(() => setMyCountry(""));
  }, []);

  const cycleGender = () => {
    const next = GENDER_CYCLE[(GENDER_CYCLE.indexOf(genderFilter) + 1) % GENDER_CYCLE.length];
    setGenderFilter(next);
    localStorage.setItem("filterGender", next);
  };

  const toggleLocation = () => {
    const next = locationFilter === "country" ? "worldwide" : "country";
    setLocationFilter(next);
    localStorage.setItem("filterLocation", next);
  };

  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false, // only video preview
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Could not access webcam:", error);
      }
    };

    getMedia();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="startpage">
      <header className="navbar">
        <p className="logo">pingo</p>
        <button className="cta-btn" onClick={onLogout}>
          Log Out
        </button>
      </header>

      <div className="content">
        {/* Left Section */}
        <div className="left-box">
          <p
            className="status"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <img
              src="https://em-content.zobj.net/source/apple/419/sneezing-face_1f927.png"
              alt="🟢"
              style={{ width: "20px", marginRight: "8px" }}
            />{" "}
            {onlineUserCount} making sure she’s ok.
          </p>

          <div className="filters">
            <button
              type="button"
              className={`filter mf-chip ${genderFilter ? "mf-chip-on" : ""}`}
              onClick={cycleGender}
              disabled={loading}
              aria-label={`match with ${GENDER_LABEL[genderFilter]}`}
            >
              <img
                src="https://em-content.zobj.net/source/apple/419/man_1f468.png"
                alt=""
                style={{ width: "20px" }}
              />
              <img
                src="https://em-content.zobj.net/source/apple/419/woman-red-hair_1f469-200d-1f9b0.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />
              {GENDER_LABEL[genderFilter]}
            </button>

            <button
              type="button"
              className={`filter mf-chip ${locationFilter === "country" ? "mf-chip-on" : ""}`}
              onClick={toggleLocation}
              disabled={loading || !myCountry}
              title={myCountry ? "" : "add your country to your profile first"}
            >
              <img
                src="https://em-content.zobj.net/source/apple/419/globe-showing-asia-australia_1f30f.png"
                alt=""
                style={{ width: "20px", marginRight: "8px" }}
              />
              {locationFilter === "country" && myCountry ? "My country" : "Worldwide"}
            </button>
          </div>

          <button
            className="vibe-btn"
            onClick={() =>
              onStartChat({
                gender: genderFilter,
                // A country filter with no country of your own does nothing,
                // so do not send one.
                location: myCountry ? locationFilter : "worldwide",
              })
            }
            disabled={loading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {loading ? (
              <div className="loader" />
            ) : (
              <>
                Lets Vibe{" "}
                <img
                  src="https://em-content.zobj.net/source/apple/419/high-voltage_26a1.png"
                  style={{ width: "20px", marginLeft: "8px" }}
                  alt="vibe"
                />
              </>
            )}
          </button>

          {loading && (
            <div className="mf-searching">
              {searchWidened?.gender ? (
                <p className="mf-searching-note">looking for anyone now.</p>
              ) : searchWidened ? (
                <p className="mf-searching-note">
                  no luck nearby — looking worldwide now.
                </p>
              ) : (
                <p className="mf-searching-note">
                  looking for{" "}
                  {genderFilter ? GENDER_LABEL[genderFilter].toLowerCase() : "anyone"}
                  {locationFilter === "country" && myCountry ? " in your country" : ""}.
                </p>
              )}

              {genderFilter && !searchWidened?.gender && (
                <button type="button" className="mf-widen" onClick={onWidenSearch}>
                  match me with anyone
                </button>
              )}
            </div>
          )}

          <button type="button" className="pf-edit-link" onClick={onEditProfile}>
            <img
              src="https://em-content.zobj.net/source/apple/419/writing-hand_270d-fe0f.png"
              alt=""
              style={{ width: "20px", marginRight: "8px" }}
            />
            your vibe
          </button>
        </div>

        <div className="right-box">
          <div className="pane-tabs">
            <button
              type="button"
              className={`pane-tab ${mobileTab === "preview" ? "pane-tab-active" : ""}`}
              onClick={() => setMobileTab("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              className={`pane-tab ${mobileTab === "chat" ? "pane-tab-active" : ""}`}
              onClick={() => setMobileTab("chat")}
            >
              Chat
            </button>
          </div>

          <div className={`pane pane-preview ${mobileTab === "preview" ? "pane-active" : ""}`}>
            <div className="video-preview">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "10px",
                }}
              />
            </div>
          </div>

          <div className={`pane pane-chat ${mobileTab === "chat" ? "pane-active" : ""}`}>
            <ChatPanel
              messages={globalMessages}
              myKey={myUid}
              keyOf={(m) => m.uid}
              showIdentity
              typingNames={typingNames}
              onSend={onSendGlobal}
              onReact={onReactGlobal}
              onTyping={onTypingGlobal}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default StartPage;
