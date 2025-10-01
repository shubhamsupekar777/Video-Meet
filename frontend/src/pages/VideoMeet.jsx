import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import {
  Badge,
  IconButton,
  TextField,
  Button
} from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import server from "../environment";
import styles from "../styles/videoComponent.module.css";

const server_url = server;
let connections = {};

const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();

  const videoRef = useRef([]);
  const [videos, setVideos] = useState([]);

  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);
  const [screen, setScreen] = useState(false);
  const [screenAvailable, setScreenAvailable] = useState(false);

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [showModal, setModal] = useState(false);

  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");

  // ✅ Fullscreen
  const handleFullscreen = (videoElement) => {
    if (videoElement.requestFullscreen) videoElement.requestFullscreen();
    else if (videoElement.mozRequestFullScreen) videoElement.mozRequestFullScreen();
    else if (videoElement.webkitRequestFullscreen) videoElement.webkitRequestFullscreen();
    else if (videoElement.msRequestFullscreen) videoElement.msRequestFullscreen();
  };

  // ✅ Initial permissions
  useEffect(() => {
    if (navigator.mediaDevices.getDisplayMedia) setScreenAvailable(true);
    else setScreenAvailable(false);
  }, []);

  // ✅ Get camera + mic
  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video,
        audio
      });
      attachStream(stream);
    } catch (e) {
      console.error("getUserMedia error:", e);
    }
  };

  // ✅ Get screen
  const getDisplayMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      attachStream(stream);

      // when user stops screen share from browser popup
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          console.log("Screen share stopped");
          setScreen(false);
          getUserMedia();
        };
      }
    } catch (e) {
      console.error("getDisplayMedia error:", e);
    }
  };

  // ✅ Attach local stream
  const attachStream = (stream) => {
    // stop previous
    if (window.localStream) {
      window.localStream.getTracks().forEach((t) => t.stop());
    }
    window.localStream = stream;
    if (localVideoref.current) {
      localVideoref.current.srcObject = stream;
    }

    // update all peers
    for (let id in connections) {
      if (id === socketIdRef.current) continue;
      connections[id].addStream(stream);
      connections[id].createOffer().then((description) => {
        connections[id].setLocalDescription(description).then(() => {
          socketRef.current.emit(
            "signal",
            id,
            JSON.stringify({ sdp: connections[id].localDescription })
          );
        });
      });
    }
  };

  // ✅ socket + WebRTC setup
  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("chat-message", addMessage);

      socketRef.current.on("user-left", (id) => {
        setVideos((prev) => prev.filter((v) => v.socketId !== id));
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((socketListId) => {
          if (!connections[socketListId]) {
            connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

            connections[socketListId].onicecandidate = (event) => {
              if (event.candidate) {
                socketRef.current.emit(
                  "signal",
                  socketListId,
                  JSON.stringify({ ice: event.candidate })
                );
              }
            };

            connections[socketListId].onaddstream = (event) => {
              setVideos((prev) => {
                const exists = prev.find((v) => v.socketId === socketListId);
                if (exists) {
                  return prev.map((v) =>
                    v.socketId === socketListId ? { ...v, stream: event.stream } : v
                  );
                } else {
                  return [
                    ...prev,
                    {
                      socketId: socketListId,
                      stream: event.stream,
                      autoplay: true,
                      playsinline: true
                    }
                  ];
                }
              });
            };

            if (window.localStream) {
              connections[socketListId].addStream(window.localStream);
            }
          }
        });
      });
    });
  };

  // ✅ Handle SDP/ICE
  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);
    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId]
          .setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp.type === "offer") {
              connections[fromId]
                .createAnswer()
                .then((description) => {
                  connections[fromId].setLocalDescription(description).then(() => {
                    socketRef.current.emit(
                      "signal",
                      fromId,
                      JSON.stringify({ sdp: connections[fromId].localDescription })
                    );
                  });
                })
                .catch((e) => console.log(e));
            }
          });
      }
      if (signal.ice) {
        connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
      }
    }
  };

  // ✅ Chat
  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prev) => [...prev, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((n) => n + 1);
    }
  };

  const sendMessage = () => {
    socketRef.current.emit("chat-message", message, username);
    setMessage("");
  };

  // ✅ Toggles
  const handleVideo = () => {
    const videoTrack = window.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideo(videoTrack.enabled);
    }
  };

  const handleAudio = () => {
    const audioTrack = window.localStream?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setAudio(audioTrack.enabled);
    }
  };

  const handleScreen = () => {
    if (!screen) {
      setScreen(true);
      getDisplayMedia();
    } else {
      setScreen(false);
      getUserMedia();
    }
  };

  const handleEndCall = () => {
    try {
      localVideoref.current.srcObject.getTracks().forEach((t) => t.stop());
    } catch {}
    window.location.href = "/";
  };

  // ✅ Lobby connect
  const connect = () => {
    setAskForUsername(false);
    getUserMedia();
    connectToSocketServer();
  };

  return (
    <div>
      <img src="/VideoMeetLogo.png" alt="" className="videoMeetLogo"/>
      {askForUsername ? (
        <div>
          <h2>Enter into Lobby</h2>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
          />
          <Button variant="contained" onClick={connect}>
            Connect
          </Button>
          <div>
            <video ref={localVideoref} autoPlay muted />
          </div>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {showModal && (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chat</h1>
                <div className={styles.chattingDisplay}>
                  {messages.length > 0 ? (
                    messages.map((item, index) => (
                      <div key={index} style={{ marginBottom: "20px" }}>
                        <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                        <p>{item.data}</p>
                      </div>
                    ))
                  ) : (
                    <p>No Messages Yet</p>
                  )}
                </div>
                <div className={styles.chattingArea}>
                  <TextField
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    label="Enter Your chat"
                    variant="outlined"
                  />
                  <Button variant="contained" onClick={sendMessage}>
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {screenAvailable && (
              <IconButton onClick={handleScreen} style={{ color: "white" }}>
                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} max={999} color="secondary">
              <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          <video
            className={styles.meetUserVideo}
            ref={localVideoref}
            autoPlay
            muted
            onDoubleClick={(e) => handleFullscreen(e.target)}
          />

          <div className={styles.conferenceView}>
            {videos.map((video) => (
              <div key={video.socketId}>
                <video
                  data-socket={video.socketId}
                  ref={(ref) => {
                    if (ref && video.stream) ref.srcObject = video.stream;
                  }}
                  autoPlay
                  onDoubleClick={(e) => handleFullscreen(e.target)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



// import React, { useEffect, useRef, useState } from "react";
// import io from "socket.io-client";
// import {
//   Badge,
//   IconButton,
//   TextField,
//   Button
// } from "@mui/material";
// import VideocamIcon from "@mui/icons-material/Videocam";
// import VideocamOffIcon from "@mui/icons-material/VideocamOff";
// import CallEndIcon from "@mui/icons-material/CallEnd";
// import MicIcon from "@mui/icons-material/Mic";
// import MicOffIcon from "@mui/icons-material/MicOff";
// import ScreenShareIcon from "@mui/icons-material/ScreenShare";
// import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
// import ChatIcon from "@mui/icons-material/Chat";
// import server from "../environment";
// import styles from "../styles/videoComponent.module.css";

// const server_url = server;
// let connections = {};
// const peerConfigConnections = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// export default function VideoMeetMerged() {
//   const socketRef = useRef();
//   const socketIdRef = useRef();
//   const localVideoref = useRef();
//   const mediaRecorderRef = useRef(null);

//   const [videos, setVideos] = useState([]);
//   const [video, setVideo] = useState(true);
//   const [audio, setAudio] = useState(true);
//   const [screen, setScreen] = useState(false);
//   const [screenAvailable, setScreenAvailable] = useState(false);
//   const [messages, setMessages] = useState([]);
//   const [message, setMessage] = useState("");
//   const [newMessages, setNewMessages] = useState(0);
//   const [showModal, setModal] = useState(false);
//   const [askForUsername, setAskForUsername] = useState(true);
//   const [username, setUsername] = useState("");
//   const [captions, setCaptions] = useState("");

//   // Fullscreen
//   const handleFullscreen = (videoElement) => {
//     if (videoElement.requestFullscreen) videoElement.requestFullscreen();
//     else if (videoElement.mozRequestFullScreen) videoElement.mozRequestFullScreen();
//     else if (videoElement.webkitRequestFullscreen) videoElement.webkitRequestFullscreen();
//     else if (videoElement.msRequestFullscreen) videoElement.msRequestFullscreen();
//   };

//   // Initial permissions
//   useEffect(() => {
//     if (navigator.mediaDevices.getDisplayMedia) setScreenAvailable(true);
//     else setScreenAvailable(false);
//   }, []);

//   // Capture local audio for transcription
//   const startTranscription = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
//       mediaRecorderRef.current = mediaRecorder;

//       mediaRecorder.ondataavailable = async (event) => {
//         if (event.data.size > 0) {
//           const arrayBuffer = await event.data.arrayBuffer();
//           socketRef.current.emit("audio-chunk", arrayBuffer);
//         }
//       };

//       mediaRecorder.start(1000); // send chunks every 1 sec
//     } catch (err) {
//       console.error("Error starting transcription:", err);
//     }
//   };

//   // Capture camera + mic
//   const getUserMedia = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
//       attachStream(stream);
//     } catch (err) {
//       console.error("getUserMedia error:", err);
//     }
//   };

//   // Capture screen
//   const getDisplayMedia = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
//       attachStream(stream);
//       const track = stream.getVideoTracks()[0];
//       if (track) track.onended = () => { setScreen(false); getUserMedia(); };
//     } catch (err) {
//       console.error("getDisplayMedia error:", err);
//     }
//   };

//   // Attach local stream to video and peers
//   const attachStream = (stream) => {
//     if (window.localStream) window.localStream.getTracks().forEach(t => t.stop());
//     window.localStream = stream;
//     if (localVideoref.current) localVideoref.current.srcObject = stream;

//     for (let id in connections) {
//       if (id === socketIdRef.current) continue;
//       connections[id].addStream(stream);
//       connections[id].createOffer().then(desc => {
//         connections[id].setLocalDescription(desc).then(() => {
//           socketRef.current.emit("signal", id, JSON.stringify({ sdp: connections[id].localDescription }));
//         });
//       });
//     }
//   };

//   // Connect to socket server + WebRTC
//   const connectToSocketServer = () => {
//     socketRef.current = io.connect(server_url, { secure: false });

//     socketRef.current.on("signal", gotMessageFromServer);

//     socketRef.current.on("connect", () => {
//       socketRef.current.emit("join-call", window.location.href);
//       socketIdRef.current = socketRef.current.id;

//       socketRef.current.on("chat-message", addMessage);
//       socketRef.current.on("user-left", id => setVideos(prev => prev.filter(v => v.socketId !== id)));

//       socketRef.current.on("user-joined", (id, clients) => {
//         clients.forEach(socketListId => {
//           if (!connections[socketListId]) {
//             connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

//             connections[socketListId].onicecandidate = event => {
//               if (event.candidate) {
//                 socketRef.current.emit("signal", socketListId, JSON.stringify({ ice: event.candidate }));
//               }
//             };

//             connections[socketListId].onaddstream = event => {
//               setVideos(prev => {
//                 const exists = prev.find(v => v.socketId === socketListId);
//                 if (exists) return prev.map(v => v.socketId === socketListId ? { ...v, stream: event.stream } : v);
//                 return [...prev, { socketId: socketListId, stream: event.stream, autoplay: true, playsinline: true }];
//               });
//             };

//             if (window.localStream) connections[socketListId].addStream(window.localStream);
//           }
//         });
//       });

//       // Live transcription
//       socketRef.current.on("transcription", text => {
//         setCaptions(prev => prev + " " + text);
//       });
//     });
//   };

//   const gotMessageFromServer = (fromId, message) => {
//     const signal = JSON.parse(message);
//     if (fromId !== socketIdRef.current) {
//       if (signal.sdp) {
//         connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
//           if (signal.sdp.type === "offer") {
//             connections[fromId].createAnswer().then(description => {
//               connections[fromId].setLocalDescription(description).then(() => {
//                 socketRef.current.emit("signal", fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
//               });
//             });
//           }
//         });
//       }
//       if (signal.ice) connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
//     }
//   };

//   // Chat
//   const addMessage = (data, sender, socketIdSender) => {
//     setMessages(prev => [...prev, { sender, data }]);
//     if (socketIdSender !== socketIdRef.current) setNewMessages(n => n + 1);
//   };
//   const sendMessage = () => { socketRef.current.emit("chat-message", message, username); setMessage(""); };

//   // Toggles
//   const handleVideo = () => { const t = window.localStream?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setVideo(t.enabled); } };
//   const handleAudio = () => { const t = window.localStream?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setAudio(t.enabled); } };
//   const handleScreen = () => { if (!screen) { setScreen(true); getDisplayMedia(); } else { setScreen(false); getUserMedia(); } };
//   const handleEndCall = () => { try { localVideoref.current.srcObject.getTracks().forEach(t => t.stop()); } catch {} window.location.href = "/"; };

//   const connect = () => {
//     setAskForUsername(false);
//     getUserMedia();
//     startTranscription();
//     connectToSocketServer();
//   };

//   return (
//     <div>
//       {askForUsername ? (
//         <div>
//           <h2>Enter Lobby</h2>
//           <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)} variant="outlined" />
//           <Button variant="contained" onClick={connect}>Connect</Button>
//           <div><video ref={localVideoref} autoPlay muted /></div>
//         </div>
//       ) : (
//         <div className={styles.meetVideoContainer}>
//           {showModal && (
//             <div className={styles.chatRoom}>
//               <div className={styles.chatContainer}>
//                 <h1>Chat</h1>
//                 <div className={styles.chattingDisplay}>
//                   {messages.length ? messages.map((item, idx) => (
//                     <div key={idx} style={{ marginBottom: 20 }}>
//                       <p style={{ fontWeight: "bold" }}>{item.sender}</p>
//                       <p>{item.data}</p>
//                     </div>
//                   )) : <p>No Messages Yet</p>}
//                 </div>
//                 <div className={styles.chattingArea}>
//                   <TextField value={message} onChange={e => setMessage(e.target.value)} label="Enter Your chat" variant="outlined" />
//                   <Button variant="contained" onClick={sendMessage}>Send</Button>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Video & Buttons */}
//           <div className={styles.buttonContainers}>
//             <IconButton onClick={handleVideo} style={{ color: "white" }}>{video ? <VideocamIcon /> : <VideocamOffIcon />}</IconButton>
//             <IconButton onClick={handleEndCall} style={{ color: "red" }}><CallEndIcon /></IconButton>
//             <IconButton onClick={handleAudio} style={{ color: "white" }}>{audio ? <MicIcon /> : <MicOffIcon />}</IconButton>
//             {screenAvailable && <IconButton onClick={handleScreen} style={{ color: "white" }}>{screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}</IconButton>}
//             <Badge badgeContent={newMessages} max={999} color="secondary">
//               <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}><ChatIcon /></IconButton>
//             </Badge>
//           </div>

//           <div style={{ position: "relative" }}>
//             <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted onDoubleClick={e => handleFullscreen(e.target)} />
//             <div style={{ position: "absolute", bottom: 0, left: 0, background: "#222", color: "#fff", padding: 5 }}>
//               <strong>Live Captions:</strong> {captions}
//             </div>
//           </div>

//           <div className={styles.conferenceView}>
//             {videos.map(v => (
//               <div key={v.socketId}>
//                 <video data-socket={v.socketId} ref={ref => { if (ref && v.stream) ref.srcObject = v.stream; }} autoPlay onDoubleClick={e => handleFullscreen(e.target)} />
//               </div>
//             ))}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }








