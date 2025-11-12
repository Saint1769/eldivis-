
// client.js - frontend logic for CoolChat
const SERVER = location.origin;
const socket = io(SERVER, { transports: ['websocket', 'polling'] });

const usernameEl = document.getElementById('username');
const nicknameEl = document.getElementById('nickname');
const btnRegister = document.getElementById('btnRegister');
const statusEl = document.getElementById('status');
const usersListEl = document.getElementById('usersList');
const chatEl = document.getElementById('chat');
const messageEl = document.getElementById('message');
const sendBtn = document.getElementById('send');
const typingEl = document.getElementById('typing');
const toggleThemeBtn = document.getElementById('toggleTheme');
const app = document.getElementById('app');

let userId = localStorage.getItem('cool_userId');
let currentUser = null;
let typingTimer = null;

function genId(){ return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9); }
function avatarText(name){ return (name||'U').slice(0,2).toUpperCase(); }
function colorFrom(name){
  let h=0; for(let i=0;i<name.length;i++) h=name.charCodeAt(i)+(h<<5)-h;
  const c = (h & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0,6-c.length) + c;
}

toggleThemeBtn.onclick = () => {
  app.classList.toggle('light');
  localStorage.setItem('cool_theme', app.classList.contains('light') ? 'light' : 'dark');
};
if(localStorage.getItem('cool_theme') === 'light') app.classList.add('light');

btnRegister.onclick = async () => {
  if (!userId) userId = genId();
  const username = usernameEl.value.trim();
  const nickname = nicknameEl.value.trim() || username;
  if (!username) return alert('Введите имя!');
  socket.emit('register', { userId, username, nickname }, (res) => {
    if (!res || !res.ok) return alert(res && res.error ? res.error : 'Ошибка регистрации');
    localStorage.setItem('cool_userId', userId);
    currentUser = { userId, username, nickname };
    usernameEl.value = ''; nicknameEl.value = '';
    statusEl.innerText = 'Вы: ' + username;
    loadMessages();
  });
};

async function loadMessages(){
  try {
    const r = await fetch('/api/messages');
    const arr = await r.json();
    chatEl.innerHTML = '';
    arr.forEach(addMessageToUI);
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (err) { console.error(err); }
}

function addMessageToUI(m){
  const el = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerText = `${m.nickname || m.username} • ${new Date(m.time).toLocaleString()}`;
  const msg = document.createElement('div');
  msg.className = 'msg ' + (currentUser && currentUser.userId === m.userId ? 'me' : 'other');
  msg.innerText = m.text;
  el.appendChild(meta);
  el.appendChild(msg);
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (m.text.includes(':party:')) doConfetti();
}

function doConfetti(){
  for(let i=0;i<20;i++){
    const d = document.createElement('div');
    d.style.position = 'fixed';
    d.style.left = (20 + Math.random()*60) + '%';
    d.style.top = (-10 + Math.random()*20) + '%';
    d.style.width = '10px'; d.style.height = '10px';
    d.style.background = ['#f43f5e','#fb923c','#facc15','#34d399','#60a5fa'][Math.floor(Math.random()*5)];
    d.style.borderRadius = '2px';
    d.style.opacity = '0.95';
    d.style.zIndex = 9999;
    document.body.appendChild(d);
    const endY = window.innerHeight * (0.6 + Math.random()*0.4);
    d.animate([ { transform: `translateY(0) rotate(0deg)`, opacity:1 }, { transform: `translateY(${endY}px) rotate(${Math.random()*720}deg)`, opacity:0.6 }], { duration: 1200 + Math.random()*1000, easing: 'cubic-bezier(.2,.9,.2,1)' });
    setTimeout(()=>d.remove(), 2000);
  }
}

sendBtn.onclick = () => {
  const text = messageEl.value.trim();
  if (!text) return;
  if (!userId) {
    userId = genId();
    localStorage.setItem('cool_userId', userId);
    alert('Сначала введите имя и нажмите Войти. UserId создан автоматически.');
    return;
  }
  socket.emit('send_message', { userId, text }, (res) => {
    if (!res || !res.ok) return alert(res && res.error ? res.error : 'Ошибка отправки');
    messageEl.value = '';
  });
};

messageEl.addEventListener('input', () => {
  socket.emit('typing', { userId, typing: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(()=> socket.emit('typing', { userId, typing: false }), 1200);
});

socket.on('connect', () => {
  statusEl.innerText = 'Подключено';
  const storedUserId = localStorage.getItem('cool_userId');
  if (storedUserId) {
    userId = storedUserId;
    fetch('/api/users').then(r=>r.json()).then(list=>{
      const u = list.find(x=>x.userId===userId);
      if (u) {
        currentUser = { userId: u.userId, username: u.username, nickname: u.nickname };
        statusEl.innerText = 'Вы: ' + u.username;
        socket.emit('register', { userId: u.userId, username: u.username, nickname: u.nickname }, ()=>{});
      }
    }).catch(()=>{});
  }
});

socket.on('disconnect', () => statusEl.innerText = 'Отключено');

socket.on('users', (users) => {
  usersListEl.innerHTML = '';
  users.forEach(u=>{
    const it = document.createElement('div');
    it.className = 'user-item';
    const av = document.createElement('div');
    av.className = 'avatar';
    av.style.background = colorFrom(u.username || u.userId || '');
    av.innerText = avatarText(u.username || u.userId);
    const nm = document.createElement('div');
    nm.innerHTML = `<div style="font-weight:600">${u.username}</div><div style="font-size:12px">${u.nickname||''}</div>`;
    it.appendChild(av); it.appendChild(nm);
    usersListEl.appendChild(it);
  });
});

socket.on('new_message', ({msg, meta}) => {
  addMessageToUI(msg);
  if (meta && meta.confetti) doConfetti();
});

socket.on('typing', ({userId: uid, typing}) => {
  if (!typing) { typingEl.innerText = ''; return; }
  fetch('/api/users').then(r=>r.json()).then(list=>{
    const u = list.find(x=>x.userId===uid);
    typingEl.innerText = u ? `${u.username} печатает...` : 'Кто-то печатает...';
  });
});

// initial load
loadMessages();
