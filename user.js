const SERVER_BASE = 'https://voice-stream-backend.onrender.com'; // change to your deployed server origin

const enableBtn = document.getElementById('enableBtn');
const statusSpan = document.getElementById('status');

let socket;
let pc;
let localStream;

enableBtn.onclick = async () => {
  enableBtn.disabled = true;
  try {
    // Ask for mic with a user gesture; browsers show mic indicator
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    statusSpan.textContent = 'mic ready';
    await startWebRTC();
  } catch (e) {
    statusSpan.textContent = 'mic denied';
    enableBtn.disabled = false;
  }
};

async function startWebRTC() {
  socket = io(SERVER_BASE, { transports: ['websocket'] });
  socket.on('connect', async () => {
    socket.emit('role', 'user');
    await makeOffer();
  });

  socket.on('webrtc-answer', async ({ sdp }) => {
    if (!pc) return;
    await pc.setRemoteDescription({ type: 'answer', sdp });
    statusSpan.textContent = 'connected';
  });

  socket.on('webrtc-ice', ({ candidate }) => {
    if (pc && candidate) pc.addIceCandidate(candidate).catch(()=>{});
  });

  socket.on('peer-disconnected', () => {
    statusSpan.textContent = 'admin disconnected';
  });
}

async function makeOffer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  // publish mic
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.onicecandidate = (ev) => {
    if (ev.candidate) socket.emit('webrtc-ice', { candidate: ev.candidate });
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { sdp: offer.sdp });
}
