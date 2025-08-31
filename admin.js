const SERVER_BASE = 'https://voice-stream-backend.onrender.com'; // change to your deployed server origin
const ADMIN_TOKEN = 'supersecrettoken123';   // must match server .env ADMIN_TOKEN

// Fixed credentials
const FIXED_EMAIL = 'admin@example.com';
const FIXED_PASS = 'adminpassword123';

const loginCard = document.getElementById('loginCard');
const app = document.getElementById('app');
const loginBtn = document.getElementById('loginBtn');
const loginMsg = document.getElementById('loginMsg');
const email = document.getElementById('email');
const password = document.getElementById('password');

const presence = document.getElementById('presence');
const remoteStatus = document.getElementById('remoteStatus');
const player = document.getElementById('player');

const startRec = document.getElementById('startRec');
const stopRec = document.getElementById('stopRec');
const recMsg = document.getElementById('recMsg');

const refreshList = document.getElementById('refreshList');
const listDiv = document.getElementById('list');

let socket;
let pc;
let remoteStream;
let mediaRecorder;
let recordedChunks = [];

loginBtn.onclick = () => {
  if (email.value === FIXED_EMAIL && password.value === FIXED_PASS) {
    loginCard.classList.add('hidden');
    app.classList.remove('hidden');
    init();
  } else {
    loginMsg.innerHTML = '<span class="err">Invalid credentials</span>';
  }
};

function init() {
  socket = io(SERVER_BASE, { transports: ['websocket'] });
  socket.on('connect', () => {
    socket.emit('role', 'admin');
  });
  socket.on('presence', (p) => {
    presence.textContent = p.count;
  });
  socket.on('peer-disconnected', () => {
    remoteStatus.textContent = 'not connected';
    player.srcObject = null;
  });

  // Handle offer from user
  socket.on('webrtc-offer', async ({ sdp }) => {
    ensurePeer();
    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { sdp: answer.sdp });
  });

  // ICE
  socket.on('webrtc-ice', ({ candidate }) => {
    if (pc && candidate) pc.addIceCandidate(candidate).catch(()=>{});
  });

  // buttons
  startRec.onclick = startRecording;
  stopRec.onclick = stopRecording;
  refreshList.onclick = loadList;
  loadList();
}

function ensurePeer() {
  if (pc) return;
  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  pc.ontrack = (ev) => {
    remoteStream = ev.streams[0];
    player.srcObject = remoteStream;
    remoteStatus.textContent = 'connected';
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit('webrtc-ice', { candidate: ev.candidate });
    }
  };
}

function startRecording() {
  if (!remoteStream) {
    recMsg.innerHTML = '<span class="err">No remote stream</span>';
    return;
  }
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(remoteStream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = uploadRecording;
  mediaRecorder.start(1000);
  startRec.disabled = true;
  stopRec.disabled = false;
  recMsg.innerHTML = '<span class="ok">Recording…</span>';
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  startRec.disabled = false;
  stopRec.disabled = true;
  recMsg.innerHTML = 'Stopped.';
}

async function uploadRecording() {
  const blob = new Blob(recordedChunks, { type: 'audio/webm' });
  const fd = new FormData();
  fd.append('audio', blob, 'recording.webm');
  try {
    const res = await fetch(SERVER_BASE + '/api/upload', {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_TOKEN },
      body: fd
    });
    const j = await res.json();
    if (j.ok) {
      recMsg.innerHTML = '<span class="ok">Uploaded ✔</span>';
      loadList();
    } else {
      recMsg.innerHTML = '<span class="err">Upload failed</span>';
    }
  } catch (e) {
    recMsg.innerHTML = '<span class="err">Upload error</span>';
  }
}

async function loadList() {
  listDiv.innerHTML = 'Loading…';
  try {
    const res = await fetch(SERVER_BASE + '/api/recordings', {
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });
    const items = await res.json();
    if (!Array.isArray(items)) return listDiv.innerHTML = 'No data';
    if (items.length === 0) return listDiv.innerHTML = 'No recordings yet.';

    listDiv.innerHTML = items.map(it => {
      const url = SERVER_BASE + '/recordings/' + it.filename;
      return `
        <div class="card">
          <div><b>ID:</b> ${it.id}</div>
          <div><b>Time:</b> ${new Date(it.createdAt).toLocaleString()}</div>
          <audio controls src="${url}" style="width:100%;"></audio>
          <div class="row" style="margin-top:6px;">
            <a href="${url}" download>Download</a>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    listDiv.innerHTML = '<span class="err">Error loading list</span>';
  }
}


// async function loadList() {
//   listDiv.innerHTML = 'Loading…';
//   try {
//     const res = await fetch(SERVER_BASE + '/api/recordings', {
//       headers: { 'x-admin-token': ADMIN_TOKEN }
//     });
//     const items = await res.json();
//     if (!Array.isArray(items)) return listDiv.innerHTML = 'No data';
//     if (items.length === 0) return listDiv.innerHTML = 'No recordings yet.';
//     listDiv.innerHTML = items.map(it => {
//       const url = SERVER_BASE + '/recordings/' + it.filename;
//       return `
//         <div class="card">
//           <div><b>ID:</b> \${it.id}</div>
//           <div><b>Time:</b> \${new Date(it.createdAt).toLocaleString()}</div>
//           <audio controls src="\${url}" style="width:100%;"></audio>
//           <div class="row" style="margin-top:6px;">
//             <a href="\${url}" download>Download</a>
//           </div>
//         </div>
//       `;
//     }).join('');
//   } catch (e) {
//     listDiv.innerHTML = '<span class="err">Error loading list</span>';
//   }
// }
