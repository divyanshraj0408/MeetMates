import { useEffect, useRef, useState } from "react";
import socket from "../Socket";
import ChatPanel from "./chat/ChatPanel";
import ProfilePanel from "./profile/ProfilePanel.jsx";
import { Video, VideoOff, Mic, MicOff, PhoneOff } from 'lucide-react';

import "./videochat.css";

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

  // Use a stable value derived from window size via CSS media query instead
  const iconSize = window.innerWidth < 600 ? 16 : 22;
 const handleEndCall = () => {
          socket.emit("leaveChat"); // tell server: I'm done, don't requeue me
          endCall();                // parent unmounts the component
        };
  return (
    <div className="video-chat-container">
      <div className="video-grid">
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
          <button
            style={{ zIndex: 1000, position: "absolute", bottom: "10px", right: "10px" }}
            className="next-button"
            onClick={onNext}
          >
            Pass {">"}
          </button>
          <ProfilePanel profile={partnerProfile} inCall />
        </div>

        <div>
          <div className="video-box local-video">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: "none" }}
            />
            <div className="video-label">You</div>
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
              <button className="control-btn hide-video-btn" onClick={endCall}>
                <PhoneOff size={iconSize} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        <div className="text-chat-section">
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
      </div>
    </div>
  );
}

export default VideoChat;