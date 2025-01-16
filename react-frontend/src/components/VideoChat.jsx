import React, { useRef, useState, useEffect } from "react";
import "./VideoChat.css";

const VideoChat = () => {
  const WS_URL = "ws://localhost:3000";
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const wsRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  const [status, setStatus] = useState("Disconnected");
  const [myUserId, setMyUserId] = useState(null);
  const [currentPartner, setCurrentPartner] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };
  const handleStartChat = async () => {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localVideoRef.current.srcObject = localStream;
      localStreamRef.current = localStream;

      connectToServer();
      setStatus("Connecting to server...");
    } catch (err) {
      console.error("Error accessing media devices:", err);
      setStatus("Error: Could not access camera/microphone");
    }
  };
  const connectToServer = () => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus("Connected to server, waiting for partner...");
    ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
    ws.onclose = () => {
      setStatus("Disconnected from server");
      cleanupConnection();
    };
    ws.onerror = (error) => setStatus("Connection error occurred");
  };
  const handleServerMessage = async (data) => {
    switch (data.type) {
      case "userId":
        setMyUserId(data.userId);
        break;
      case "matched":
        setCurrentPartner(data.partnerId);
        setIsInitiator(data.initiator);
        setStatus("Connected to partner");
        establishConnection();
        break;
      case "offer":
        await handleOffer(data.payload);
        break;
      case "answer":
        await handleAnswer(data.payload);
        break;
      case "ice-candidate":
        await handleIceCandidate(data.payload);
        break;
      case "partnerDisconnected":
        setStatus("Partner disconnected");
        cleanupConnection();
        break;
      default:
        console.log("Unhandled message:", data.type);
    }
  };
  const establishConnection = async () => {
    createPeerConnection();
    if (isInitiator) {
      try {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        sendToServer({ type: "offer", payload: offer });
      } catch (err) {
        console.error("Error creating offer:", err);
        setStatus("Error establishing connection");
      }
    }
  };

  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;

    // Debug logging for stream status
    console.log(
      "Local stream status:",
      localStreamRef.current ? "active" : "not available"
    );
    console.log(
      "Local stream tracks:",
      localStreamRef.current?.getTracks().map((t) => `${t.kind}: ${t.enabled}`)
    );

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`Adding ${track.kind} track to peer connection`);
        const sender = peerConnection.addTrack(track, localStreamRef.current);

        // Monitor track status
        sender.track.onended = () =>
          console.log(`Local ${track.kind} track ended`);
        sender.track.onmute = () =>
          console.log(`Local ${track.kind} track muted`);
        sender.track.onunmute = () =>
          console.log(`Local ${track.kind} track unmuted`);
      });
    } else {
      console.error("No local stream available when creating peer connection");
    }

    // Enhanced remote track handling
    peerConnection.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);
      console.log("Remote streams count:", event.streams.length);

      if (event.streams && event.streams[0]) {
        console.log("Setting remote stream");

        // Set the remote video source
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];

          // Force video element to update
          remoteVideoRef.current.load();

          // Attempt to play the video
          remoteVideoRef.current.play().catch((err) => {
            console.error("Error playing remote video:", err);
          });

          // Monitor remote stream status
          event.streams[0].onaddtrack = () =>
            console.log("Remote stream: track added");
          event.streams[0].onremovetrack = () =>
            console.log("Remote stream: track removed");

          // Monitor individual remote tracks
          event.streams[0].getTracks().forEach((track) => {
            console.log(
              `Remote ${track.kind} track settings:`,
              track.getSettings()
            );
            track.onended = () =>
              console.log(`Remote ${track.kind} track ended`);
            track.onmute = () =>
              console.log(`Remote ${track.kind} track muted`);
            track.onunmute = () =>
              console.log(`Remote ${track.kind} track unmuted`);
          });
        } else {
          console.error("Remote video reference not available");
        }
      } else {
        console.error("No remote streams available in track event");
      }
    };

    // Enhanced connection state monitoring
    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", peerConnection.iceConnectionState);
      console.log("Connection state:", peerConnection.connectionState);
      console.log("Signaling state:", peerConnection.signalingState);

      if (peerConnection.iceConnectionState === "connected") {
        setStatus("Connected to partner");
      } else if (peerConnection.iceConnectionState === "failed") {
        setStatus("Connection failed - please try again");
        cleanupConnection();
      }
    };

    return peerConnection;
  };
  const handleOffer = async (offer) => {
    try {
      createPeerConnection();
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      sendToServer({ type: "answer", payload: answer });
    } catch (err) {
      console.error("Error handling offer:", err);
      setStatus("Error handling connection offer");
    }
  };

  const handleAnswer = async (answer) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    } catch (err) {
      console.error("Error handling answer:", err);
      setStatus("Error handling connection answer");
    }
  };

  const handleIceCandidate = async (candidate) => {
    try {
      if (
        peerConnectionRef.current &&
        peerConnectionRef.current.remoteDescription
      ) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    } catch (err) {
      console.error("Error handling ICE candidate:", err);
    }
  };

  const findNextPerson = () => {
    cleanupConnection();
    sendToServer({ type: "next" });
    setStatus("Finding next partner...");
  };

  const cleanupConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setCurrentPartner(null);
    setIsInitiator(false);
  };

  const sendToServer = (data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  useEffect(() => {
    return () => {
      cleanupConnection();
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);
  // Update the video elements to ensure they're properly configured
  return (
    <div>
      <div className="video-container">
        <div className="video-wrapper">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", maxWidth: "400px" }}
          />
        </div>
        <div className="video-wrapper">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: "100%", maxWidth: "400px" }}
          />
        </div>
      </div>
      <div className="controls">
        <button onClick={handleStartChat}>Start</button>
        <button onClick={findNextPerson}>Next Person</button>
      </div>
      <div id="status">{status}</div>
      <div id="debug">
        {peerConnectionRef.current && (
          <div>
            <p>ICE: {peerConnectionRef.current.iceConnectionState}</p>
            <p>Connection: {peerConnectionRef.current.connectionState}</p>
            <p>Signaling: {peerConnectionRef.current.signalingState}</p>
          </div>
        )}
      </div>
    </div>
  );
};
export default VideoChat;
