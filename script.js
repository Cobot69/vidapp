import { app, db } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const servers = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "turn:relay.metered.ca:80",
      username: "openai",
      credential: "openai123"
    },
    {
      urls: "turn:relay.metered.ca:443",
      username: "openai",
      credential: "openai123"
    },
    {
      urls: "turn:relay.metered.ca:443?transport=tcp",
      username: "openai",
      credential: "openai123"
    }
  ],
  iceCandidatePoolSize: 10,
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallBtn = document.getElementById('startCall');
const joinCallBtn = document.getElementById('joinCall');
const toggleMicBtn = document.getElementById('toggleMic');
const toggleCamBtn = document.getElementById('toggleCam');
const endCallBtn = document.getElementById('endCall');
const callIdText = document.getElementById('callIdText');
const copyCallIdBtn = document.getElementById('copyCallIdBtn');

let pc = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;
let micEnabled = true;
let camEnabled = true;

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  pc = new RTCPeerConnection(servers);

  // Debugging ICE state
  pc.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", pc.iceConnectionState);
  };
  pc.onicecandidateerror = e => {
    console.error("ICE candidate error:", e);
  };

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  localVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  updateToggleButtons();
  enableToggleButtons(true);
}

function enableToggleButtons(enable) {
  toggleMicBtn.disabled = !enable;
  toggleCamBtn.disabled = !enable;
}

function updateToggleButtons() {
  toggleMicBtn.textContent = micEnabled ? "Mic On" : "Mic Off";
  toggleMicBtn.className = micEnabled ? "toggle-btn toggle-mic on" : "toggle-btn toggle-mic off";

  toggleCamBtn.textContent = camEnabled ? "Cam On" : "Cam Off";
  toggleCamBtn.className = camEnabled ? "toggle-btn toggle-cam on" : "toggle-btn toggle-cam off";
}

toggleMicBtn.onclick = () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
  updateToggleButtons();
};

toggleCamBtn.onclick = () => {
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(track => track.enabled = camEnabled);
  updateToggleButtons();
};

startCallBtn.onclick = async () => {
  startCallBtn.disabled = true;
  joinCallBtn.disabled = true;
  endCallBtn.disabled = false;

  await init();

  const callDoc = doc(collection(db, "calls"));
  const offerCandidates = collection(callDoc, "offerCandidates");
  const answerCandidates = collection(callDoc, "answerCandidates");

  pc.onicecandidate = event => {
    if (event.candidate) {
      setDoc(doc(offerCandidates), event.candidate.toJSON());
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  await setDoc(callDoc, { offer: { type: offerDescription.type, sdp: offerDescription.sdp } });

  currentCallId = callDoc.id;
  callIdText.textContent = currentCallId;
  copyCallIdBtn.disabled = false;

  onSnapshot(callDoc, snapshot => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  onSnapshot(answerCandidates, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
};

joinCallBtn.onclick = async () => {
  const callId = prompt("Enter Call ID to join:");
  if (!callId) return;

  startCallBtn.disabled = true;
  joinCallBtn.disabled = true;
  endCallBtn.disabled = false;

  await init();

  const callDoc = doc(db, "calls", callId);
  const offerCandidates = collection(callDoc, "offerCandidates");
  const answerCandidates = collection(callDoc, "answerCandidates");

  pc.onicecandidate = event => {
    if (event.candidate) {
      setDoc(doc(answerCandidates), event.candidate.toJSON());
    }
  };

  const callData = (await getDoc(callDoc)).data();
  if (!callData) {
    alert("Call ID not found!");
    endCall();
    return;
  }

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  await updateDoc(callDoc, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } });

  onSnapshot(offerCandidates, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  currentCallId = callId;
  callIdText.textContent = callId;
  copyCallIdBtn.disabled = false;
};

copyCallIdBtn.onclick = async () => {
  if (currentCallId) {
    try {
      await navigator.clipboard.writeText(currentCallId);
      copyCallIdBtn.textContent = 'Copied!';
      setTimeout(() => (copyCallIdBtn.textContent = 'Copy'), 2000);
    } catch (err) {
      alert('Failed to copy: ' + err);
    }
  }
};

function endCall() {
  if (pc) {
    pc.close();
    pc = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  callIdText.textContent = '';
  currentCallId = null;

  micEnabled = true;
  camEnabled = true;
  updateToggleButtons();

  startCallBtn.disabled = false;
  joinCallBtn.disabled = false;
  endCallBtn.disabled = true;
  enableToggleButtons(false);

  copyCallIdBtn.disabled = true;
  copyCallIdBtn.textContent = 'Copy';
}

endCallBtn.onclick = endCall;
