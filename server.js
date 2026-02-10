const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active users
const users = {};
const rooms = {};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins with a username
  socket.on('join', (data) => {
    const { username, roomId } = data;
    users[socket.id] = { id: socket.id, username, roomId };
    
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(socket.id);
    
    socket.join(roomId);
    
    // Notify others in the room
    io.to(roomId).emit('userJoined', {
      userId: socket.id,
      username: username,
      usersInRoom: rooms[roomId].map(id => ({
        id,
        username: users[id].username
      }))
    });
    
    console.log(`${username} joined room ${roomId}`);
  });

  // Handle chat messages
  socket.on('message', (data) => {
    const user = users[socket.id];
    if (user) {
      io.to(user.roomId).emit('message', {
        userId: socket.id,
        username: user.username,
        message: data.message,
        timestamp: new Date()
      });
    }
  });

  // Handle video call initiation
  socket.on('initiateCall', (data) => {
    const { targetUserId, offer } = data;
    const caller = users[socket.id];
    
    if (users[targetUserId]) {
      io.to(targetUserId).emit('incomingCall', {
        from: socket.id,
        fromUsername: caller.username,
        offer: offer
      });
    }
  });

  // Handle call answer
  socket.on('answerCall', (data) => {
    const { targetUserId, answer } = data;
    io.to(targetUserId).emit('callAnswered', {
      from: socket.id,
      answer: answer
    });
  });

  // Handle ICE candidates
  socket.on('iceCandidate', (data) => {
    const { targetUserId, candidate } = data;
    io.to(targetUserId).emit('iceCandidate', {
      from: socket.id,
      candidate: candidate
    });
  });

  // Handle call rejection
  socket.on('rejectCall', (data) => {
    const { targetUserId } = data;
    io.to(targetUserId).emit('callRejected', {
      from: socket.id
    });
  });

  // Handle call end
  socket.on('endCall', (data) => {
    const { targetUserId } = data;
    io.to(targetUserId).emit('callEnded', {
      from: socket.id
    });
  });

  // User disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const roomId = user.roomId;
      if (rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      }
      
      io.to(roomId).emit('userLeft', {
        userId: socket.id,
        username: user.username
      });
      
      delete users[socket.id];
      console.log(`${user.username} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
