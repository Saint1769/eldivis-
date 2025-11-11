const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Храним пользователей
const users = new Map();
const usernameIndex = new Map();

io.on('connection', (socket) => {
  console.log('✅ Новый пользователь подключился:', socket.id);

  // Регистрация пользователя
  socket.on('register_user', (userData) => {
    const { username, nickname } = userData;
    
    // Проверка уникальности username
    if (usernameIndex.has(username)) {
      socket.emit('registration_error', 'Этот юзернейм уже занят');
      return;
    }

    const userInfo = {
      username,
      nickname,
      socketId: socket.id,
      status: 'online',
      lastSeen: new Date()
    };

    users.set(socket.id, userInfo);
    usernameIndex.set(username, socket.id);

    socket.emit('registration_success', userInfo);
    socket.broadcast.emit('user_online', userInfo);
    updateOnlineUsers();
    
    console.log(`✅ Зарегистрирован: ${nickname} (@${username})`);
  });

  // Поиск пользователя по username
  socket.on('search_user', (searchUsername, callback) => {
    const targetSocketId = usernameIndex.get(searchUsername);
    
    if (targetSocketId && users.has(targetSocketId)) {
      const user = users.get(targetSocketId);
      callback({
        username: user.username,
        nickname: user.nickname,
        status: user.status,
        lastSeen: user.lastSeen
      });
    } else {
      callback(null);
    }
  });

  // Отправка приватного сообщения
  socket.on('send_private_message', (data) => {
    const { toUsername, message } = data;
    const fromUser = users.get(socket.id);
    const toSocketId = usernameIndex.get(toUsername);

    if (toSocketId && users.has(toSocketId)) {
      const messageData = {
        from: fromUser.username,
        fromNickname: fromUser.nickname,
        to: toUsername,
        message: message,
        timestamp: new Date().toLocaleTimeString(),
        type: 'private'
      };

      io.to(toSocketId).emit('receive_private_message', messageData);
      socket.emit('receive_private_message', messageData);
      
      console.log(`💬 Приватное сообщение от ${fromUser.username} к ${toUsername}`);
    } else {
      socket.emit('message_error', 'Пользователь не найден или оффлайн');
    }
  });

  // Общие сообщения
  socket.on('send_message', (data) => {
    const fromUser = users.get(socket.id);
    if (!fromUser) return;

    const messageData = {
      username: fromUser.nickname,
      message: data.message,
      timestamp: new Date().toLocaleTimeString(),
      type: 'global'
    };

    io.emit('receive_message', messageData);
    console.log(`🌐 Общее сообщение от ${fromUser.username}: ${data.message}`);
  });

  // Обновление статуса
  socket.on('update_status', (status) => {
    if (users.has(socket.id)) {
      const user = users.get(socket.id);
      user.status = status;
      user.lastSeen = new Date();
      
      socket.broadcast.emit('user_status_changed', {
        username: user.username,
        nickname: user.nickname,
        status: status
      });
      updateOnlineUsers();
    }
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    console.log('❌ Отключение:', socket.id);
    if (users.has(socket.id)) {
      const user = users.get(socket.id);
      user.status = 'offline';
      user.lastSeen = new Date();
      
      socket.broadcast.emit('user_offline', {
        username: user.username,
        nickname: user.nickname
      });
      
      setTimeout(() => {
        if (users.get(socket.id)?.status === 'offline') {
          users.delete(socket.id);
          usernameIndex.delete(user.username);
          console.log(`🗑️ Удален пользователь: ${user.nickname} (@${user.username})`);
        }
      }, 60000);
      
      updateOnlineUsers();
    }
  });

  function updateOnlineUsers() {
    const onlineUsers = Array.from(users.values())
      .filter(user => user.status === 'online')
      .map(user => ({
        username: user.username,
        nickname: user.nickname,
        status: user.status
      }));
    
    io.emit('online_users_update', onlineUsers);
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Socket.IO Chat Server is running',
    users: users.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    users: users.size,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 Socket.IO готов к подключениям`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 URL: https://api.render.com/deploy/srv-d49pump5pdvs73dptd7g?key=FyBHJegihqI`);
});