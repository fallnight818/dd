// Socket.io connection
const socket = io();

// State management
let currentUserId = null;
let currentUsername = null;
let currentRoomId = null;
let localStream = null;
let peer = null;
let peerConnection = null;
let dataChannel = null;
let usersInRoom = [];
let currentCallTarget = null;
let isMicEnabled = true;
let isCameraEnabled = true;

// DOM Elements
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const joinSection = document.getElementById('join-section');
const chatSection = document.getElementById('chat-section');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const usersContainer = document.getElementById('users-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const videoContainer = document.getElementById('video-container');
const noCallMessage = document.getElementById('no-call-message');
const videoControls = document.getElementById('video-controls');
const micBtn = document.getElementById('mic-btn');
const cameraBtn = document.getElementById('camera-btn');
const hangUpBtn = document.getElementById('hang-up-btn');

// Initialize
window.addEventListener('load', () => {
    joinSection.classList.remove('hidden');
    chatSection.classList.add('hidden');
});

// Generate random room ID
function generateRoomId() {
    const roomId = 'room-' + Math.random().toString(36).substr(2, 9);
    roomIdInput.value = roomId;
}

// Join room
function joinRoom() {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim() || 'general';

    if (!username) {
        alert('Please enter your name');
        return;
    }

    currentUsername = username;
    currentRoomId = roomId;

    socket.emit('join', { username, roomId });
    
    joinSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    messageInput.focus();

    // Initialize PeerJS
    initializePeerJS();
}

// Initialize PeerJS
function initializePeerJS() {
    peer = new Peer({
        host: 'localhost',
        port: 3001,
        path: '/peerjs',
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        currentUserId = id;
        console.log('PeerJS ID:', id);
    });

    peer.on('call', (call) => {
        handleIncomingCall(call);
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        // Fallback: Use WebRTC directly if PeerJS server is not available
        initializeWebRTC();
    });
}

// Initialize WebRTC directly (fallback)
function initializeWebRTC() {
    currentUserId = socket.id;
    console.log('Using WebRTC directly, Socket ID:', currentUserId);
}

// Get local media stream
async function getLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });
        localVideo.srcObject = localStream;
        return localStream;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Please allow access to camera and microphone');
        return null;
    }
}

// Send chat message
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    socket.emit('message', { message });
    messageInput.value = '';
    messageInput.focus();
}

// Handle incoming chat message
function displayMessage(data, isSent = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = isSent ? 'message sent' : 'message received';

    const time = new Date(data.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        <div class="message-sender">${data.username}</div>
        <div>${data.message}</div>
        <div class="message-time">${time}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Display system message
function displaySystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update users list
function updateUsersList() {
    usersContainer.innerHTML = '';
    usersInRoom.forEach(user => {
        if (user.id !== currentUserId) {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-item';
            userDiv.innerHTML = `
                <span>${user.username}</span>
                <button class="btn btn-success" style="padding: 5px 10px; font-size: 12px;" onclick="startVideoCall('${user.id}', '${user.username}')">Call</button>
            `;
            usersContainer.appendChild(userDiv);
        }
    });
}

// Start video call
async function startVideoCall(targetUserId, targetUsername) {
    console.log('Starting video call with:', targetUsername);
    
    currentCallTarget = targetUserId;
    await getLocalStream();
    
    // Hide "no call" message and show video controls
    noCallMessage.classList.add('hidden');
    videoControls.classList.remove('hidden');

    if (peer.open) {
        // Use PeerJS
        const call = peer.call(targetUserId, localStream);
        call.on('stream', (stream) => {
            remoteVideo.srcObject = stream;
        });
        call.on('close', endCall);
    } else {
        // Use WebRTC with Socket.io signaling
        initiateWebRTCCall(targetUserId);
    }

    displaySystemMessage(`📞 Calling ${targetUsername}...`);
}

// Handle incoming call
function handleIncomingCall(call) {
    const targetIndex = usersInRoom.findIndex(u => u.id === call.peer);
    const caller = targetIndex !== -1 ? usersInRoom[targetIndex].username : 'Unknown User';

    const accept = confirm(`${caller} is calling you. Accept?`);
    
    if (accept) {
        getLocalStream().then(() => {
            call.answer(localStream);
            currentCallTarget = call.peer;
            
            call.on('stream', (stream) => {
                remoteVideo.srcObject = stream;
            });
            
            noCallMessage.classList.add('hidden');
            videoControls.classList.remove('hidden');
            displaySystemMessage(`📞 Call accepted with ${caller}`);
        });
    } else {
        call.close();
    }
}

// Initiate WebRTC call (direct)
async function initiateWebRTCCall(targetUserId) {
    try {
        socket.emit('initiateCall', { targetUserId, offer: null });
    } catch (error) {
        console.error('Error initiating call:', error);
    }
}

// End call
function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }

    currentCallTarget = null;
    noCallMessage.classList.remove('hidden');
    videoControls.classList.add('hidden');
    
    if (currentCallTarget) {
        socket.emit('endCall', { targetUserId: currentCallTarget });
    }

    displaySystemMessage('📞 Call ended');
}

// Toggle microphone
function toggleMic() {
    if (localStream) {
        isMicEnabled = !isMicEnabled;
        localStream.getAudioTracks().forEach(track => {
            track.enabled = isMicEnabled;
        });
        micBtn.style.opacity = isMicEnabled ? '1' : '0.5';
    }
}

// Toggle camera
function toggleCamera() {
    if (localStream) {
        isCameraEnabled = !isCameraEnabled;
        localStream.getVideoTracks().forEach(track => {
            track.enabled = isCameraEnabled;
        });
        cameraBtn.style.opacity = isCameraEnabled ? '1' : '0.5';
    }
}

// Socket.io event listeners
socket.on('userJoined', (data) => {
    currentUserId = socket.id;
    usersInRoom = data.usersInRoom;
    updateUsersList();
    displaySystemMessage(`✅ ${data.username} joined the room`);
});

socket.on('userLeft', (data) => {
    usersInRoom = usersInRoom.filter(u => u.id !== data.userId);
    updateUsersList();
    displaySystemMessage(`❌ ${data.username} left the room`);
    
    if (currentCallTarget === data.userId) {
        endCall();
    }
});

socket.on('message', (data) => {
    const isSent = data.userId === socket.id;
    displayMessage(data, isSent);
});

socket.on('incomingCall', (data) => {
    const caller = usersInRoom.find(u => u.id === data.from);
    const callerName = caller ? caller.username : 'Unknown User';
    
    const accept = confirm(`${callerName} is calling you. Accept?`);
    if (accept) {
        currentCallTarget = data.from;
        getLocalStream().then(() => {
            socket.emit('answerCall', { targetUserId: data.from, answer: null });
            noCallMessage.classList.add('hidden');
            videoControls.classList.remove('hidden');
            displaySystemMessage(`📞 Call accepted with ${callerName}`);
        });
    } else {
        socket.emit('rejectCall', { targetUserId: data.from });
    }
});

socket.on('callAnswered', (data) => {
    console.log('Call answered by:', data.from);
    displaySystemMessage('📞 Call answered');
});

socket.on('callRejected', (data) => {
    displaySystemMessage('❌ Call rejected');
    endCall();
});

socket.on('callEnded', (data) => {
    displaySystemMessage('📞 Call ended');
    endCall();
});

// Event listeners for UI
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

micBtn.addEventListener('click', toggleMic);
cameraBtn.addEventListener('click', toggleCamera);
hangUpBtn.addEventListener('click', endCall);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peer) {
        peer.destroy();
    }
});
