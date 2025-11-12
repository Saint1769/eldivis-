
// client.js for Eldivis
const socket = io(location.origin, { transports: ['websocket','polling'] });

// DOM elements
const usersList = document.getElementById('usersList');
const nftList = document.getElementById('nftList');
const miniName = document.getElementById('miniName');
const miniCoins = document.getElementById('miniCoins');
const miniAvatar = document.getElementById('miniAvatar');
const searchUsers = document.getElementById('searchUsers');
const spinBtn = document.getElementById('spinBtn');
const spinResult = document.getElementById('spinResult');
const chatWindow = document.getElementById('chatWindow');
const chatHeader = document.getElementById('chatHeader');
const composer = document.getElementById('composer');
const msgText = document.getElementById('msgText');
const fileInput = document.getElementById('fileInput');
const sendBtn = document.getElementById('sendBtn');
const profileView = document.getElementById('profileView');
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profileCoins = document.getElementById('profileCoins');
const profileGifts = document.getElementById('profileGifts');
const editProfileBtn = document.getElementById('editProfileBtn');
const blockBtn = document.getElementById('blockBtn');
const deleteAccountBtn = document.getElementById('deleteAccountBtn');
const toast = document.getElementById('toast');

let token = localStorage.getItem('eldivis_token');
let me = null;
let currentPeer = null;

// helpers
function showToast(t){ toast.style.display='block'; toast.innerText = t; setTimeout(()=> toast.style.display='none',3000); }
function setMini(user){ miniName.innerText = user.username || 'Гость'; miniCoins.innerText = '💎 ' + (user.coins||0); miniAvatar.src = user.avatar || '/assets/default-avatar.png'; }

async function api(path, opts={}){
  opts.headers = opts.headers || {};
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(path, opts);
  return r.json();
}

// auth quick flow: if no token, prompt register/login
async function tryAuto(){
  if (!token) {
    // show guest UI, but require login to access features
    setMini({ username: 'Гость', coins: 0 });
    loadPublicNfts();
    loadUsers();
    return;
  }
  const payload = JSON.parse(atob(token.split('.')[1]));
  me = { userId: payload.userId, username: payload.username };
  // fetch user data (list users and nfts)
  await loadUsers();
  await loadPublicNfts();
  // fetch my profile
  const prof = await api('/api/profile/' + me.userId);
  if (prof && prof.user) setMini(prof.user);
  showToast('Привет, ' + me.username);
  socket.auth = { token }; socket.connect();
}

async function loadUsers(q=''){
  const res = await api('/api/users', { method:'GET' }).catch(()=>null);
  usersList.innerHTML = '';
  if (!res) return;
  const users = res.filter(u => !q || u.username.toLowerCase().includes(q.toLowerCase()));
  users.forEach(u => {
    const d = document.createElement('div'); d.className='userItem';
    d.innerHTML = `<img class="userAvatar" src="${u.avatar||'/assets/default-avatar.png'}"><div style="flex:1"><div style="font-weight:700">${u.username}</div><div style="font-size:12px">${u.nickname||''}</div></div><div>${u.coins||0}💎</div>`;
    d.onclick = ()=> openProfile(u.userId);
    usersList.appendChild(d);
  });
}

async function loadPublicNfts(){
  const res = await api('/api/nfts', { method:'GET' }).catch(()=>null);
  nftList.innerHTML = '';
  if (!res) return;
  res.forEach(n => {
    const el = document.createElement('div'); el.className='nftItem';
    el.innerHTML = `<img src="${n.image}" width="48" height="48"><div style="flex:1">${n.title}</div><button data-nid="${n.id}">Подарить</button>`;
    const btn = el.querySelector('button');
    btn.onclick = ()=> giftNFT(n.id);
    nftList.appendChild(el);
  });
}

searchUsers.addEventListener('input', ()=> loadUsers(searchUsers.value));

async function openProfile(userId){
  // show profile in right column
  const res = await api('/api/profile/' + userId).catch(()=>null);
  if (!res || !res.user) return;
  profileView.style.display = 'block';
  profileAvatar.src = res.user.avatar || '/assets/default-avatar.png';
  profileName.innerText = res.user.username;
  profileCoins.innerText = '💎 ' + (res.user.coins||0);
  profileGifts.innerHTML = '';
  res.gifts.forEach(g => {
    const it = document.createElement('div');
    it.innerHTML = `<img src="${g.image}" width="48" style="vertical-align:middle"><span style="margin-left:8px">${g.title} (от ${g.giftedBy})</span>`;
    profileGifts.appendChild(it);
  });
  // show delete button only for own profile
  if (token){
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.userId === userId) deleteAccountBtn.style.display = 'inline-block'; else deleteAccountBtn.style.display = 'none';
  } else deleteAccountBtn.style.display = 'none';
  // open private chat option
  chatHeader.innerText = 'Чат с ' + res.user.username;
  currentPeer = userId;
  composer.style.display = token ? 'flex' : 'none';
  // load messages
  if (token) {
    const msgs = await api('/api/messages/' + userId, { method:'GET' });
    chatWindow.innerHTML = '';
    msgs.forEach(renderMsg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

function renderMsg(m){
  const wrapper = document.createElement('div');
  const meta = document.createElement('div'); meta.className='meta'; meta.innerText = `${m.fromUser === me.userId ? 'Вы' : m.fromUser} • ${new Date(m.time).toLocaleString()}`;
  const msg = document.createElement('div'); msg.className = 'msg ' + (m.fromUser === me.userId ? 'me' : 'other'); msg.innerText = m.text || '';
  wrapper.appendChild(meta); wrapper.appendChild(msg);
  if (m.attachment){
    const a = document.createElement('div');
    if (m.type === 'image') a.innerHTML = `<img src="${m.attachment}" style="max-width:240px;border-radius:8px">`;
    else a.innerHTML = `<a href="${m.attachment}" target="_blank">Скачать файл</a>`;
    wrapper.appendChild(a);
  }
  // delete button for own messages
  if (m.fromUser === me.userId){
    const del = document.createElement('button'); del.innerText = 'Удалить'; del.style.marginLeft='8px';
    del.onclick = async ()=>{ const r = await api('/api/message/' + m.id, { method:'DELETE' }); if (r && r.ok) { wrapper.remove(); showToast('Удалено'); } };
    wrapper.appendChild(del);
  }
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// send message with file
sendBtn.onclick = async ()=>{
  if (!token) return showToast('Войдите чтобы писать');
  if (!currentPeer) return showToast('Выберите пользователя');
  const form = new FormData();
  form.append('toUserId', currentPeer);
  form.append('text', msgText.value || '');
  if (fileInput.files[0]) form.append('file', fileInput.files[0]);
  const r = await fetch('/api/message', { method:'POST', headers: { 'Authorization': 'Bearer ' + token }, body: form });
  const res = await r.json();
  if (res && res.ok) { renderMsg(res.msg); msgText.value=''; fileInput.value=''; }
  else showToast('Ошибка отправки');
};

// spin wheel
spinBtn.onclick = async ()=>{
  if (!token) return showToast('Войдите чтобы крутить');
  const r = await api('/api/spin', { method:'POST' });
  if (r && r.ok) { spinResult.innerHTML = '<div class="spinAnim">Вы выиграли ' + r.won + ' 💎</div>'; showToast('Поздравляем!'); setTimeout(()=> spinResult.innerHTML='',3000); loadUsers(); }
  else if (r && r.error === 'already_spun') showToast('Вы уже крутили сегодня'); else showToast('Ошибка');
};

// gift NFT
async function giftNFT(nftId){
  if (!token) return showToast('Войдите');
  if (!currentPeer) return showToast('Выберите получателя');
  const r = await api('/api/gift-nft', { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ toUserId: currentPeer, nftId }) });
  if (r && r.ok) showToast('NFT подарен'); else showToast('Ошибка подарка');
}

// block user
blockBtn.onclick = async ()=>{
  if (!token || !currentPeer) return showToast('Ошибка');
  const r = await api('/api/block', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ target: currentPeer }) });
  const res = await r.json();
  if (res && res.ok) showToast('Пользователь заблокирован');
};

// delete account
deleteAccountBtn.onclick = async ()=>{
  if (!token) return;
  if (!confirm('Удалить аккаунт?')) return;
  const r = await api('/api/account', { method:'DELETE' });
  const res = await r.json();
  if (res && res.ok) { localStorage.removeItem('eldivis_token'); token=null; me=null; showToast('Аккаунт удалён'); tryAuto(); }
};

// socket realtime reactions
socket.on('new_message', ({msg})=>{
  if ((me && (msg.fromUser === me.userId || msg.toUser === me.userId)) && currentPeer && (msg.fromUser === currentPeer || msg.toUser === currentPeer)) {
    renderMsg(msg);
  }
});
socket.on('coins_updated', ({userId})=>{ if (me && userId === me.userId) { /* refresh */ tryAuto(); } });
socket.on('nft_gifted', ({ownerUserId})=>{ if (me && ownerUserId === me.userId) showToast('Вам подарили NFT!'); });

// auto start
tryAuto();
