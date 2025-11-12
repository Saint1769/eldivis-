const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS - разрешаем все подключения
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware для логирования запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Разрешаем JSON и URL-encoded данные
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Обслуживание статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Основной маршрут для проверки работы
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Chat Server - Eldivis</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            body {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }
            .container {
                max-width: 800px;
                width: 100%;
                background: white;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .status {
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
                text-align: center;
            }
            .success {
                background: #d4edda;
                color: #155724;
                border: 2px solid #c3e6cb;
            }
            .info {
                background: #d1ecf1;
                color: #0c5460;
                border: 2px solid #bee5eb;
            }
            .stats {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin: 30px 0;
            }
            .stat-card {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 10px;
                text-align: center;
                border: 1px solid #e9ecef;
            }
            .stat-number {
                font-size: 2.5rem;
                font-weight: bold;
                margin: 10px 0;
                color: #667eea;
            }
            .links {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin: 20px 0;
            }
            .link-card {
                padding: 15px;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                text-align: center;
                transition: background 0.3s;
            }
            .link-card:hover {
                background: #5a6fd8;
            }
            h1 {
                color: #2d3748;
                margin-bottom: 10px;
            }
            h2 {
                color: #4a5568;
                margin: 20px 0 10px 0;
            }
            ul {
                list-style: none;
                padding: 0;
            }
            li {
                padding: 8px 0;
                border-bottom: 1px solid #e2e8f0;
            }
            .online-users {
                max-height: 200px;
                overflow-y: auto;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚀 Чат-Сервер Eldivis</h1>
                <p>Real-time чат приложение</p>
            </div>
            
            <div class="status success">
                <strong>✅ Сервер работает корректно</strong>
                <p>Время сервера: ${new Date().toLocaleString('ru-RU')}</p>
            </div>
            
            <div class="stats">
                <div class="stat-card">
                    <h3>👥 Пользователи онлайн</h3>
                    <div class="stat-number">${users.size}</div>
                </div>
                <div class="stat-card">
                    <h3>💬 Всего сообщений</h3>
                    <div class="stat-number">${messages.length}</div>
                </div>
            </div>
            
            <div class="info">
                <h3>📋 Информация о сервере:</h3>
                <ul>
                    <li><strong>Порт:</strong> ${process.env.PORT || 3000}</li>
                    <li><strong>Node.js:</strong> ${process.version}</li>
                    <li><strong>Окружение:</strong> ${process.env.NODE_ENV || 'development'}</li>
                    <li><strong>WebSocket:</strong> ✅ Активен</li>
                    <li><strong>CORS:</strong> ✅ Разрешены все домены</li>
                    <li><strong>Время работы:</strong> ${Math.floor(process.uptime())} сек</li>
                </ul>
            </div>

            ${users.size > 0 ? `
            <div class="info">
                <h3>🟢 Сейчас онлайн:</h3>
                <div class="online-users">
                    <ul>
                        ${Array.from(users.values()).map(user => `
                            <li>${user.name} (@${user.username})</li>
                        `).join('')}
                    </ul>
                </div>
            </div>
            ` : ''}
            
            <div class="links">
                <a href="/health" class="link-card">Проверка здоровья</a>
                <a href="/debug" class="link-card">Отладочная информация</a>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Маршрут для проверки здоровья
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    server: 'Eldivis Chat Server',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    },
    chat: {
      onlineUsers: users.size,
      totalMessages: messages.length,
      activeConnections: io.engine.clientsCount
    }
  });
});

// Маршрут для отладки
app.get('/debug', (req, res) => {
  const onlineUsers = Array.from(users.values()).map(user => ({
    name: user.name,
    username: user.username,
    connected: new Date(user.connectedAt).toLocaleString('ru-RU'),
    socketId: user.id
  }));

  res.json({
    server: {
      name: 'Eldivis Chat Server',
      port: process.env.PORT || 3000,
      nodeEnv: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      launchTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
    },
    chat: {
      totalUsers: users.size,
      totalMessages: messages.length,
      activeConnections: io.engine.clientsCount,
      onlineUsers: onlineUsers,
      recentMessages: messages.slice(-5).map(msg => ({
        from: msg.name,
        text: msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : ''),
        time: msg.timestamp
      }))
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: process.memoryUsage()
    }
  });
});

// API для получения списка пользователей
app.get('/api/users', (req, res) => {
  res.json({
    success: true,
    data: Array.from(users.values()).map(user => ({
      name: user.name,
      username: user.username,
      connectedAt: user.connectedAt
    }))
  });
});

// API для получения истории сообщений
app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentMessages = messages.slice(-limit);
  
  res.json({
    success: true,
    data: recentMessages
  });
});

// Хранилище данных
const messages = [];
const users = new Map();

// Функция для очистки старых сообщений
function cleanupOldMessages() {
  if (messages.length > 1000) {
    const removed = messages.splice(0, messages.length - 500);
    console.log(`🧹 Очищено ${removed.length} старых сообщений`);
  }
}

// Обработка подключений Socket.io
io.on('connection', (socket) => {
  console.log('🔗 Новое подключение:', socket.id);
  
  // Отправляем приветственное сообщение
  socket.emit('welcome', { 
    message: 'Добро пожаловать в чат Eldivis!',
    serverTime: new Date().toISOString(),
    totalUsers: users.size,
    totalMessages: messages.length
  });

  // Регистрация пользователя
  socket.on('register user', (userData) => {
    try {
      console.log('📝 Попытка регистрации:', userData);
      
      // Проверяем валидность данных
      if (!userData || !userData.name || !userData.username) {
        socket.emit('registration error', {
          message: 'Неверные данные пользователя. Заполните все поля.'
        });
        return;
      }
      
      // Очищаем и нормализуем данные
      userData.username = userData.username.toLowerCase().trim();
      userData.name = userData.name.trim();
      
      if (userData.username.length < 3) {
        socket.emit('registration error', {
          message: 'Юзернейм должен содержать минимум 3 символа'
        });
        return;
      }
      
      if (userData.name.length < 2) {
        socket.emit('registration error', {
          message: 'Имя должно содержать минимум 2 символа'
        });
        return;
      }
      
      // Проверяем, занят ли юзернейм
      if (users.has(userData.username)) {
        console.log('❌ Юзернейм занят:', userData.username);
        socket.emit('registration error', {
          message: 'Этот юзернейм уже занят. Выберите другой.'
        });
        return;
      }
      
      // Регистрируем пользователя
      const user = {
        id: socket.id,
        name: userData.name,
        username: userData.username,
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      users.set(userData.username, user);
      
      console.log('✅ Успешная регистрация:', user.name, '(@' + user.username + ')');
      
      // Сохраняем пользователя в socket для быстрого доступа
      socket.user = user;
      
      // Отправляем подтверждение
      socket.emit('registration success', {
        user: user,
        totalUsers: users.size,
        messageHistory: messages
      });
      
      // Отправляем обновленный список пользователей всем
      io.emit('users list', Array.from(users.values()));
      
      // Уведомляем всех о новом пользователе
      io.emit('user joined', {
        user: user,
        totalUsers: users.size,
        message: `${user.name} (@${user.username}) присоединился к чату`
      });
      
    } catch (error) {
      console.error('💥 Ошибка регистрации:', error);
      socket.emit('registration error', {
        message: 'Ошибка сервера при регистрации'
      });
    }
  });
  
  // Обработка нового сообщения
  socket.on('send message', (data) => {
    try {
      // Проверяем авторизацию
      if (!socket.user) {
        socket.emit('message error', {
          message: 'Вы не авторизованы'
        });
        return;
      }
      
      const text = (data.text || '').trim();
      
      if (!text) {
        socket.emit('message error', {
          message: 'Сообщение не может быть пустым'
        });
        return;
      }
      
      if (text.length > 1000) {
        socket.emit('message error', {
          message: 'Сообщение слишком длинное (максимум 1000 символов)'
        });
        return;
      }
      
      console.log('💬 Новое сообщение от', socket.user.name + ':', text);
      
      const message = {
        id: Date.now() + Math.random(),
        username: socket.user.username,
        name: socket.user.name,
        text: text,
        timestamp: new Date().toLocaleTimeString('ru-RU'),
        fullTimestamp: new Date().toISOString()
      };
      
      messages.push(message);
      
      // Обновляем время последней активности
      socket.user.lastActivity = new Date().toISOString();
      
      // Ограничиваем историю сообщений
      if (messages.length > 500) {
        messages.shift();
      }
      
      // Отправляем сообщение всем подключенным клиентам
      io.emit('new message', message);
      console.log('📤 Сообщение отправлено всем пользователям');
      
    } catch (error) {
      console.error('💥 Ошибка отправки сообщения:', error);
      socket.emit('message error', {
        message: 'Ошибка отправки сообщения'
      });
    }
  });
  
  // Пинг-понг для проверки соединения
  socket.on('ping', (data) => {
    socket.emit('pong', {
      serverTime: new Date().toISOString(),
      usersOnline: users.size,
      message: 'Сервер работает'
    });
  });
  
  // Получение списка пользователей
  socket.on('get users', () => {
    socket.emit('users list', Array.from(users.values()));
  });
  
  // Получение истории сообщений
  socket.on('get messages', () => {
    socket.emit('message history', messages);
  });
  
  // Пользователь печатает
  socket.on('typing start', () => {
    if (socket.user) {
      socket.broadcast.emit('user typing', {
        username: socket.user.username,
        name: socket.user.name
      });
    }
  });
  
  socket.on('typing stop', () => {
    if (socket.user) {
      socket.broadcast.emit('user stop typing', {
        username: socket.user.username
      });
    }
  });
  
  // Обработка отключения пользователя
  socket.on('disconnect', (reason) => {
    console.log('🔌 Отключение:', socket.id, 'Причина:', reason);
    
    if (socket.user) {
      const disconnectedUser = socket.user;
      users.delete(disconnectedUser.username);
      
      console.log('👋 Пользователь вышел:', disconnectedUser.name);
      
      // Отправляем обновленный список пользователей
      io.emit('users list', Array.from(users.values()));
      
      // Уведомляем о выходе пользователя
      io.emit('user left', {
        user: disconnectedUser,
        totalUsers: users.size,
        message: `${disconnectedUser.name} (@${disconnectedUser.username}) покинул чат`
      });
    }
  });
});

// Периодическая очистка старых сообщений
setInterval(cleanupOldMessages, 60000); // Каждую минуту

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('💥 Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Необработанный промис:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM, завершаем работу...');
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 ЧАТ-СЕРВЕР ELDIVIS ЗАПУЩЕН!');
  console.log('='.repeat(60));
  console.log(`📍 Порт: ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`🌐 Внешний URL: https://eldivis.onrender.com`);
  console.log(`⏰ Время запуска: ${new Date().toLocaleString('ru-RU')}`);
  console.log(`🔧 Окружение: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  console.log('='.repeat(60));
  console.log('✅ Сервер готов принимать подключения\n');
});