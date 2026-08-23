import { useEffect, useRef, useState } from "react";
import socket from "../Socket";
import ChatPanel from "./chat/ChatPanel";
import ProfilePanel from "./profile/ProfilePanel.jsx";
import NeverHaveIEver from "./game/NeverHaveIEver.jsx";
import { EMOJI_BASE } from "../interests.js";
import { Video, VideoOff, Mic, MicOff, PhoneOff } from 'lucide-react';

import "./videochat.css";
import "./game/nhie.css";

function VideoChat({ socketId, toggleVideo, messages, onSendMessage, endCall, onNext, partnerTyping, onReactPair, onTypingPair, partnerProfile }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  const processedSignalsRef = useRef(new Set());

  const [connectionState, setConnectionState] = useState("new");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  // Only tracks whether THIS user pressed start, so their own card can show a
  // spinner while the first batch generates. It does not gate mounting: the
  // card is always mounted so it is always listening, otherwise the partner
  // never registers a gameStatement handler and the round shows on one screen.
  const [gameStarting, setGameStarting] = useState(false);
  // True from the first gameStatement until gameOver. Combined with
  // gameStarting (below) this decides whether the Game tab exists at all —
  // the tab bar is only rendered while a round is actually live.
  const [gameLive, setGameLive] = useState(false);
  // Which pane the bottom region shows: "chat" or "game". Defaults to chat so
  // the bottom region is indistinguishable from today's chat-only layout
  // until a game actually starts.
  const [callTab, setCallTab] = useState("chat");
  const showGameTab = gameStarting || gameLive;

  // The bottom region is a collapsible sheet on mobile (always full-height on
  // desktop — see videochat.css). Starts collapsed so the video gets the
  // screen by default; the tab bar is the handle that opens it.
  const [sheetOpen, setSheetOpen] = useState(false);
  // Dot on the Chat tab when a partner message arrives while the chat pane
  // isn't the visible one (sheet collapsed, or the Game pane is showing).
  const [chatHasUnseen, setChatHasUnseen] = useState(false);
  const isChatPaneVisible = sheetOpen && callTab === "chat";

  // Auto-switch to the Game tab the moment a round arrives. This is required
  // for the partner: they never pressed start, so gameStarting is false on
  // their screen — without this effect they'd have no reason to notice a
  // round began, since the tab bar would appear but stay parked on Chat.
  // Also force the sheet open: a round arriving while it's collapsed must
  // still be seen, unlike a plain chat message (which only gets a dot).
  useEffect(() => {
    const handleGameStatement = () => {
      setGameLive(true);
      setCallTab("game");
      setSheetOpen(true);
    };
    const handleGameOver = () => {
      setGameLive(false);
      setCallTab("chat");
    };

    socket.on("gameStatement", handleGameStatement);
    socket.on("gameOver", handleGameOver);

    return () => {
      socket.off("gameStatement", handleGameStatement);
      socket.off("gameOver", handleGameOver);
    };
  }, []);

  // Mark the Chat tab whenever a partner message lands while chat isn't the
  // visible pane. Own messages (sender === socket.id) and the system's
  // "connected" line don't count — only something the user hasn't seen yet.
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (messages.length <= prevCount) return;

    const arrivedFromPartner = messages
      .slice(prevCount)
      .some((m) => m.sender !== socket.id && m.sender !== "__system__");

    if (arrivedFromPartner && !isChatPaneVisible) {
      setChatHasUnseen(true);
    }
  }, [messages, isChatPaneVisible]);

  // Clear the dot the moment the chat pane actually becomes the visible one.
  useEffect(() => {
    if (isChatPaneVisible) setChatHasUnseen(false);
  }, [isChatPaneVisible]);

  // Tap-driven sheet control (no drag gesture, per design): tapping the
  // inactive tab switches to it and opens the sheet; tapping the tab that's
  // already active toggles the sheet shut/open again.
  const handleTabClick = (tab) => {
    if (tab === callTab) {
      setSheetOpen((open) => !open);
    } else {
      setCallTab(tab);
      setSheetOpen(true);
    }
  };

  // FIX 1: Track attempts with a ref instead of state — state changes trigger
  // the useEffect dependency, which was causing the ghost reconnect loop.
  const connectionAttemptsRef = useRef(0);
  // Keep a separate state only for the "show Reconnect button" UI.
  const [showReconnectBtn, setShowReconnectBtn] = useState(false);

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  // createPeerConnection no longer emits ready-to-connect or touches state that
  // would re-trigger the media setup effect.
  const createPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = pc;
    processedSignalsRef.current = new Set();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setIsConnected(true);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("Connection state:", state);
      setConnectionState(state);

      if (state === "connected") {
        setIsConnected(true);
        setShowReconnectBtn(false);
      } else if (state === "failed" || state === "disconnected" || state === "closed") {
        setIsConnected(false);

        // FIX 1 (cont): Use ref for attempt count — does NOT retrigger the effect.
        if (state === "failed" && connectionAttemptsRef.current < 3) {
          connectionAttemptsRef.current += 1;
          console.log(`Connection failed. Retrying... (Attempt ${connectionAttemptsRef.current})`);
          setTimeout(() => {
            createPeerConnection();
            socket.emit("ready-to-connect");
          }, 1000);
        } else if (state === "failed") {
          setShowReconnectBtn(true);
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { candidate: event.candidate });
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("ICE gathering state:", pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log("Signaling state:", pc.signalingState);
    };

    return pc;
  };

  // FIX 2: Media setup runs exactly ONCE on mount (empty dep array).
  // Socket listeners are registered here once and cleaned up on unmount.
  // Previously the effect re-ran on every connectionAttempts state change,
  // re-registering listeners and re-emitting ready-to-connect each time.
  useEffect(() => {
    let isComponentMounted = true;

    const setupMediaDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (!isComponentMounted) return;

        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        createPeerConnection();

        // --- Socket handlers defined once, cleaned up on unmount ---

        const handleOffer = async (data) => {
          try {
            const pc = peerConnectionRef.current;
            if (!pc) return;

            const offerId = JSON.stringify(data.offer);
            if (processedSignalsRef.current.has(offerId)) return;
            processedSignalsRef.current.add(offerId);

            if (pc.signalingState !== "stable") {
              if (pc.signalingState === "have-local-offer") {
                await pc.setLocalDescription({ type: "rollback" });
              } else {
                console.log("Cannot handle offer in state:", pc.signalingState);
                return;
              }
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("webrtc-answer", { answer });
          } catch (error) {
            console.error("Error handling offer:", error);
          }
        };

        const handleAnswer = async (data) => {
          try {
            const pc = peerConnectionRef.current;
            if (!pc) return;

            const answerId = JSON.stringify(data.answer);
            if (processedSignalsRef.current.has(answerId)) return;
            processedSignalsRef.current.add(answerId);

            if (pc.signalingState !== "have-local-offer") {
              console.log("Cannot set remote answer in state:", pc.signalingState);
              return;
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          } catch (error) {
            console.error("Error setting remote description:", error);
          }
        };

        const handleIceCandidate = async (data) => {
          if (data.candidate && peerConnectionRef.current) {
            try {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(data.candidate)
              );
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          }
        };

        const createOfferFn = async () => {
          const pc = peerConnectionRef.current;
          if (!pc) return;
          try {
            if (pc.signalingState !== "stable") {
              console.log("Cannot create offer in state:", pc.signalingState);
              return;
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("webrtc-offer", { offer });
          } catch (error) {
            console.error("Error creating offer:", error);
          }
        };

        const handlePartnerLeft = () => {
          console.log("Partner left");
          setIsConnected(false);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
          }
          // Reset attempt counter but do NOT emit ready-to-connect here —
          // the parent component will re-mount VideoChat when a new partner is matched.
          connectionAttemptsRef.current = 0;
          setShowReconnectBtn(false);
          createPeerConnection();
        };
       
        socket.on("webrtc-offer", handleOffer);
        socket.on("webrtc-answer", handleAnswer);
        socket.on("ice-candidate", handleIceCandidate);
        socket.on("create-offer", createOfferFn);
        socket.on("partnerLeft", handlePartnerLeft);

        setTimeout(() => {
          if (isComponentMounted) {
            socket.emit("ready-to-connect");
          }
        }, 500);

        // Return the cleanup so the effect's return below can call it synchronously.
        return () => {
          socket.off("webrtc-offer", handleOffer);
          socket.off("webrtc-answer", handleAnswer);
          socket.off("ice-candidate", handleIceCandidate);
          socket.off("create-offer", createOfferFn);
          socket.off("partnerLeft", handlePartnerLeft);
        };
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    // FIX 2 (cont): Store the Promise so we can resolve the inner cleanup fn.
    let innerCleanup = null;
    const setupPromise = setupMediaDevices().then((cleanup) => {
      innerCleanup = cleanup;
    });


    return () => {
      isComponentMounted = false;

      // Wait for setup to finish then run cleanup, or run immediately if done.
      if (innerCleanup) {
        innerCleanup();
      } else {
        // Setup still in progress — run cleanup once it resolves.
        setupPromise.then(() => {
          if (innerCleanup) innerCleanup();
        });
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, []); // ← empty: runs once on mount, cleans up on unmount

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => { track.enabled = !track.enabled; });
      setIsMuted((prev) => !prev);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => { track.enabled = !track.enabled; });
      setIsCameraOff((prev) => !prev);
    }
  };

  const reconnect = () => {
    connectionAttemptsRef.current = 0;
    setShowReconnectBtn(false);
    createPeerConnection();
    socket.emit("ready-to-connect");
  };

  const startGame = () => {
    setGameStarting(true);
    // Jump the presser to the Game tab right away rather than waiting for
    // gameStatement — they asked for the round, they should land on it
    // immediately and see the loading state instead of the chat tab.
    setCallTab("game");
    setSheetOpen(true);
    socket.emit("gameStart");
  };

  // Use a stable value derived from window size via CSS media query instead
  const iconSize = window.innerWidth < 600 ? 16 : 22;
 const handleEndCall = () => {
          socket.emit("leaveChat"); // tell server: I'm done, don't requeue me
          endCall();                // parent unmounts the component
        };
  return (
    <div className="video-chat-container">
      {/* vc-sheet-open lives on the grid itself (not just the sheet) because
          the PiP thumbnail also needs to read --vc-sheet-h to anchor itself —
          the variable has to cascade to all three mobile pieces. */}
      <div className={`video-grid ${sheetOpen ? "vc-sheet-open" : ""}`}>
        <div className="video-box remote-video">
          <video ref={remoteVideoRef} autoPlay playsInline />
          <div className="video-label">
            Partner {isConnected ? "" : "(Connecting...)"}
          </div>
          {showReconnectBtn && (
            <button
              onClick={reconnect}
              className="reconnect-btn"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                padding: "8px 16px",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Reconnect
            </button>
          )}
          <ProfilePanel profile={partnerProfile} inCall />
        </div>

        {/* Real thumbnail now — no controls inside it, so it stays small
            enough on mobile to actually show the user their own framing. */}
        <div className="video-box local-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ transform: "none" }}
          />
          <div className="video-label">You</div>
        </div>

        {/* Controls row: a direct grid/flex child of .video-grid now, not a
            child of the local PiP. Mobile: a static row between the video
            and the sheet. Desktop: absolutely positioned over the remote
            video's bottom-centre (see videochat.css). */}
        <div className="video-controls">
          <button
            className={`control-btn ${isMuted ? "control-off" : ""}`}
            onClick={toggleMute}
            style={{ padding: 0, width: "36px", height: "36px" }}
          >
            {isMuted
              ? <MicOff size={iconSize} strokeWidth={1.2} />
              : <Mic size={iconSize} strokeWidth={1.5} />}
          </button>
          <button
            className={`control-btn ${isCameraOff ? "control-off" : ""}`}
            onClick={toggleCamera}
            style={{ padding: 0, width: "36px", height: "36px" }}
          >
            {isCameraOff
              ? <VideoOff size={iconSize} strokeWidth={1.2} />
              : <Video size={iconSize} strokeWidth={1.5} />}
          </button>
          <button
            className="control-btn"
            onClick={startGame}
            style={{ padding: 0, width: "36px", height: "36px" }}
            aria-label="never have i ever"
          >
            <img
              src={`${EMOJI_BASE}/sparkles_2728.png`}
              alt=""
              style={{ width: 20, height: 20 }}
            />
          </button>
          <button className="control-btn hide-video-btn" onClick={endCall}>
            <PhoneOff size={iconSize} strokeWidth={1.5} />
          </button>
          <button className="next-button" onClick={onNext}>
            Pass {">"}
          </button>
        </div>

        <div className="text-chat-section">
          {/* The tab bar is always visible and doubles as the sheet's
              handle: tapping the inactive tab switches to it and expands,
              tapping the active tab collapses. Tap-driven only — no drag. */}
          <div className="vc-tabs">
            <button
              type="button"
              className={`vc-tab ${callTab === "chat" ? "vc-tab-active" : ""}`}
              onClick={() => handleTabClick("chat")}
            >
              Chat
              {chatHasUnseen && <span className="vc-tab-dot" aria-hidden="true" />}
            </button>
            {showGameTab && (
              <button
                type="button"
                className={`vc-tab ${callTab === "game" ? "vc-tab-active" : ""}`}
                onClick={() => handleTabClick("game")}
              >
                Game
              </button>
            )}
          </div>

          {/* Both panes stay mounted always; only visibility (CSS) toggles.
              Unmounting the chat would drop its scroll position, and
              unmounting the game would unregister its socket listeners —
              the exact bug that made the round appear on one screen only. */}
          <div className={`vc-pane ${callTab === "chat" ? "vc-pane-active" : ""}`}>
            <ChatPanel
              messages={messages}
              myKey={socket.id}
              keyOf={(m) => m.sender}
              showIdentity={false}
              emptyText="Say something 👋"
              typingLabel={partnerTyping ? "typing…" : null}
              onSend={onSendMessage}
              onReact={onReactPair}
              onTyping={onTypingPair}
            />
          </div>
          <div className={`vc-pane ${callTab === "game" ? "vc-pane-active" : ""}`}>
            <NeverHaveIEver
              socket={socket}
              starting={gameStarting}
              onClose={() => setGameStarting(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoChat;