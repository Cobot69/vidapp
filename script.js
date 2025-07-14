// script.js
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
      urls: ["stun:stun.l.google.com:19302"]
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
let currentCallId = null;

let pc = null;
let localStream = null;
let remoteStream = null;

let micEnabled = true;
let camEnabled = true;

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  pc = new RTCPeerConnection(servers);

  // Add tracks to RTCPeerConnection
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // Handle remote tracks
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
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
  if (micEnabled) {
    toggleMicBtn.textContent = "Mic On";
    toggleMicBtn.classList.remove('off');
    toggleMicBtn.classList.add('on');
  } else {
    toggleMicBtn.textContent = "Mic Off";
    toggleMicBtn.classList.remove('on');
    toggleMicBtn.classList.add('off');
  }

  if (camEnabled) {
    toggleCamBtn.textContent = "Cam On";
    toggleCamBtn.classList.remove('off');
    toggleCamBtn.classList.add('on');
  } else {
    toggleCamBtn.textContent = "Cam Off";
    toggleCamBtn.classList.remove('on');
    toggleCamBtn.classList.add('off');
  }
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
  enableToggleButtons(true);

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

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };
  await setDoc(callDoc, { offer });

  callIdText.textContent = callDoc.id;
  currentCallId = callDoc.id;
  copyCallIdBtn.disabled = false;

  // Listen for remote answer
  onSnapshot(callDoc, snapshot => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Listen for remote ICE candidates
  onSnapshot(answerCandidates, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
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
  enableToggleButtons(true);

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

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };
  await updateDoc(callDoc, { answer });

  // Listen for remote ICE candidates
  onSnapshot(offerCandidates, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  callIdText.textContent = callId;
  currentCallId = callId;
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
  // Close peer connection
  if (pc) {
    pc.close();
    pc = null;
  }

  // Stop all local media tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Clear video elements
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Reset call ID display and variable
  currentCallId = null;
  callIdText.textContent = '';

  // Reset mic and cam buttons
  micEnabled = true;
  camEnabled = true;
  updateToggleButtons();

  // Enable start/join, disable end call and toggles
  startCallBtn.disabled = false;
  joinCallBtn.disabled = false;
  endCallBtn.disabled = true;
  enableToggleButtons(false);

  copyCallIdBtn.disabled = true;
  copyCallIdBtn.textContent = 'Copy';
}

endCallBtn.onclick = endCall;
