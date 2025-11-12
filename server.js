const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Упрощенная настройка CORS - убираем все ограничения
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Разрешаем все CORS запросы
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Разрешаем JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Обслуживание статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Простой основной маршрут
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Chat Server is Running!',
    server: 'Eldivis Chat',
    timestamp: new Date().toISOString(),
    onlineUsers: users.size,
    totalMessages: messages.length
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Хранилище данных
const messages = [];
const users = new Map();

// Обработка подключений Socket.io
io.on('connection', (socket) => {
  console.log('🔗 Новое подключение:', socket.id);
  
  // Сразу отправляем приветствие
  socket.emit('connected', { 
    message: 'Connected to Eldivis Chat Server',
    serverTime: new Date().toISOString(),
    socketId: socket.id
  });

  // Регистрация пользователя
  socket.on('register user', (userData) => {
    try {
      console.log('📝 Регистрация:', userData);
      
      if (!userData || !userData.name || !userData.username) {
        return socket.emit('registration_error', {
          message: 'Name and username are required'
        });
      }
      
      // Нормализуем username
      const username = userData.username.toLowerCase().trim();
      const name = userData.name.trim();
      
      // Проверяем уникальность
      if (users.has(username)) {
        console.log('❌ Username taken:', username);
        return socket.emit('registration_error', {
          message: 'Username already taken'
        });
      }
      
      // Создаем пользователя
      const user = {
        id: socket.id,
        name: name,
        username: username,
        connectedAt: new Date().toISOString()
      };
      
      users.set(username, user);
      socket.user = user;
      
      console.log('✅ User registered:', user.name, '(@' + user.username + ')');
      
      // Отправляем успех
      socket.emit('registration_success', {
        user: user,
        messageHistory: messages
      });
      
      // Обновляем список пользователей для всех
      io.emit('users_list', Array.from(users.values()));
      
      // Уведомляем о новом пользователе
      io.emit('user_joined', {
        user: user,
        message: `${user.name} joined the chat`
      });
      
    } catch (error) {
      console.error('💥 Registration error:', error);
      socket.emit('registration_error', {
        message: 'Server error during registration'
      });
    }
  });
  
  // Отправка сообщения
  socket.on('send_message', (data) => {
    try {
      if (!socket.user) {
        return socket.emit('message_error', {
          message: 'Not authenticated'
        });
      }
      
      const text = (data.text || '').trim();
      if (!text) {
        return socket.emit('message_error', {
          message: 'Message cannot be empty'
        });
      }
      
      console.log('💬 Message from', socket.user.name + ':', text);
      
      const message = {
        id: Date.now() + '-' + Math.random(),
        username: socket.user.username,
        name: socket.user.name,
        text: text,
        timestamp: new Date().toLocaleTimeString('ru-RU'),
        fullTimestamp: new Date().toISOString()
      };
      
      messages.push(message);
      
      // Ограничиваем историю
      if (messages.length > 200) {
        messages.shift();
      }
      
      // Отправляем всем
      io.emit('new_message', message);
      
    } catch (error) {
      console.error('💥 Message error:', error);
      socket.emit('message_error', {
        message: 'Failed to send message'
      });
    }
  });
  
  // Получение пользователей
  socket.on('get_users', () => {
    socket.emit('users_list', Array.from(users.values()));
  });
  
  // Получение истории
  socket.on('get_messages', () => {
    socket.emit('message_history', messages);
  });
  
  // Пинг
  socket.on('ping', () => {
    socket.emit('pong', {
      serverTime: new Date().toISOString(),
      usersOnline: users.size
    });
  });
  
  // Отключение
  socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected:', socket.id, 'Reason:', reason);
    
    if (socket.user) {
      const user = socket.user;
      users.delete(user.username);
      
      console.log('👋 User left:', user.name);
      
      // Обновляем список
      io.emit('users_list', Array.from(users.values()));
      
      // Уведомляем
      io.emit('user_left', {
        user: user,
        message: `${user.name} left the chat`
      });
    }
  });
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});

// Запуск на порту 10000
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 ELDIVIS CHAT SERVER STARTED!');
  console.log('='.repeat(50));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`🌐 External: https://eldivis.onrender.com`);
  console.log(`⏰ Time: ${new Date().toLocaleString('ru-RU')}`);
  console.log('='.repeat(50));
  console.log('✅ Ready for connections\n');
});