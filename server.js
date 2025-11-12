const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Получаем API ключ из переменной окружения
const VALID_API_KEY = process.env.Lunacy || 'b0d4b686aadc6e3a1fa19f45fbaf259a';

// Middleware для проверки API ключа
const authenticate = (socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey === VALID_API_KEY) {
    next();
  } else {
    console.log('Неверный API ключ:', apiKey);
    next(new Error('Invalid API key'));
  }
};

// Применяем аутентификацию
io.use(authenticate);

// Обслуживание статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Основной маршрут для проверки работы
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Chat Server</title></head>
      <body>
        <h1>Chat Server is Running! ✅</h1>
        <p>Server time: ${new Date().toLocaleString()}</p>
        <p>Connected users: ${users.size}</p>
        <p>Total messages: ${messages.length}</p>
        <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
      </body>
    </html>
  `);
});

// Маршрут для проверки здоровья
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: users.size,
    messages: messages.length,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Маршрут для проверки API ключа (только для отладки)
app.get('/debug', (req, res) => {
  res.json({
    apiKeyConfigured: !!process.env.Lunacy,
    apiKeyLength: process.env.Lunacy ? process.env.Lunacy.length : 0,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT
  });
});

// Хранилище данных
const messages = [];
const users = new Map(); // username -> {id, name, username}

// Обработка подключений Socket.io
io.on('connection', (socket) => {
  console.log('Новый пользователь подключился:', socket.id);
  
  // Регистрация пользователя
  socket.on('register user', (userData) => {
    try {
      // Проверяем валидность данных
      if (!userData || !userData.name || !userData.username) {
        socket.emit('registration error', {
          message: 'Неверные данные пользователя'
        });
        return;
      }
      
      // Приводим username к нижнему регистру
      userData.username = userData.username.toLowerCase();
      
      // Проверяем, занят ли юзернейм
      if (users.has(userData.username)) {
        socket.emit('registration error', {
          message: 'Этот юзернейм уже занят. Выберите другой.'
        });
        return;
      }
      
      // Регистрируем пользователя
      users.set(userData.username, {
        id: socket.id,
        name: userData.name,
        username: userData.username,
        joinedAt: new Date().toISOString()
      });
      
      // Отправляем подтверждение
      socket.emit('registration success');
      
      // Отправляем историю сообщений
      socket.emit('message history', messages);
      
      // Отправляем обновленный список пользователей всем
      io.emit('users list', Array.from(users.values()));
      
      console.log(`Пользователь ${userData.name} (@${userData.username}) зарегистрирован`);
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      socket.emit('registration error', {
        message: 'Ошибка сервера при регистрации'
      });
    }
  });
  
  // Обработка нового сообщения
  socket.on('send message', (data) => {
    try {
      const user = users.get(data.username);
      if (!user) {
        console.log('Пользователь не найден:', data.username);
        return;
      }
      
      const message = {
        id: Date.now(),
        username: data.username,
        name: data.name,
        text: data.text,
        timestamp: new Date().toLocaleTimeString(),
        fullTimestamp: new Date().toISOString()
      };
      
      messages.push(message);
      
      // Ограничиваем историю сообщений (последние 100)
      if (messages.length > 100) {
        messages.shift();
      }
      
      // Отправляем сообщение всем подключенным клиентам
      io.emit('new message', message);
      console.log(`Новое сообщение от ${data.name} (@${data.username}): ${data.text}`);
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
    }
  });
  
  // Пинг-понг для проверки соединения
  socket.on('ping', (data) => {
    socket.emit('pong', {
      serverTime: new Date().toISOString(),
      usersOnline: users.size
    });
  });
  
  // Обработка отключения пользователя
  socket.on('disconnect', (reason) => {
    console.log(`Пользователь ${socket.id} отключился:`, reason);
    
    // Удаляем пользователя из списка
    let disconnectedUser = null;
    for (let [username, user] of users.entries()) {
      if (user.id === socket.id) {
        disconnectedUser = user;
        users.delete(username);
        break;
      }
    }
    
    if (disconnectedUser) {
      console.log(`Пользователь ${disconnectedUser.name} (@${disconnectedUser.username}) отключился`);
      
      // Отправляем обновленный список пользователей
      io.emit('users list', Array.from(users.values()));
    }
  });
});

// Универсальная настройка порта
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('=== Chat Server Started ===');
  console.log(`Port: ${PORT}`);
  console.log(`API Key: ${VALID_API_KEY}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Lunacy env variable: ${process.env.Lunacy ? 'SET' : 'NOT SET'}`);
  console.log(`Server URL: http://0.0.0.0:${PORT}`);
  console.log('==========================');
});