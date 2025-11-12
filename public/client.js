
// client.js - Extended UI logic with all new features
const socket = io(location.origin, { transports: ['websocket','polling'] });

// Extended elements
const inpUser = document.getElementById('inpUser');
const inpPass = document.getElementById('inpPass');
const btnRegister = document.getElementById('btnRegister');
const btnLogin = document.getElementById('btnLogin');
const authSection = document.getElementById('authSection');
const walletSection = document.getElementById('walletSection');
const usersListSection = document.getElementById('usersListSection');
const nftSection = document.getElementById('nftSection');
const usersList = document.getElementById('usersList');
const nftList = document.getElementById('nftList');
const coinAmount = document.getElementById('coinAmount');
const buyAmount = document.getElementById('buyAmount');
const btnBuy = document.getElementById('btnBuy');
const chatWindow = document.getElementById('chatWindow');
const composer = document.getElementById('composer');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const chatsHeader = document.getElementById('chatsHeader');
const deleteAccountBtn = document.getElementById('deleteAccount');
const userArea = document.getElementById('userArea');
const toast = document.getElementById('toast');

// New UI elements
const groupsList = document.getElementById('groupsList');
const friendsList = document.getElementById('friendsList');
const profileSection = document.getElementById('profileSection');
const voiceCallBtn = document.getElementById('voiceCallBtn');
const videoCallBtn = document.getElementById('videoCallBtn');
const stickerPicker = document.getElementById('stickerPicker');
const themeSelector = document.getElementById('themeSelector');
const dailyBonusBtn = document.getElementById('dailyBonusBtn');
const achievementsBtn = document.getElementById('achievementsBtn');
const marketplaceBtn = document.getElementById('marketplaceBtn');

let token = localStorage.getItem('cc_token');
let me = null;
let currentPeer = null;
let currentGroup = null;
let currentChatType = 'private'; // 'private' or 'group'
let localStream = null;
let peerConnection = null;

// WebRTC configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

// Helpers
function showToast(t) { 
  toast.style.display='block'; 
  toast.innerText = t; 
  setTimeout(()=> toast.style.display='none', 3000); 
}

function setAuthState(logged) {
  authSection.style.display = logged ? 'none' : 'block';
  walletSection.style.display = logged ? 'block' : 'none';
  usersListSection.style.display = logged ? 'block' : 'none';
  nftSection.style.display = logged ? 'block' : 'none';
  composer.style.display = logged ? 'flex' : 'none';
  if (!logged) { 
    usersList.innerHTML=''; 
    nftList.innerHTML=''; 
    chatWindow.innerHTML=''; 
    coinAmount.innerText=''; 
    userArea.innerHTML=''; 
  }
}

// Format time
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Register
btnRegister.onclick = async () => {
  const u = inpUser.value.trim(), p = inpPass.value;
  if (!u || !p) return showToast('Введите имя и пароль');
  try {
    const r = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: u, password: p})
    });
    const data = await r.json();
    if (!data.ok) return showToast('Ошибка: ' + (data.error||''));
    token = data.token; 
    localStorage.setItem('cc_token', token);
    await afterLogin();
  } catch(e) { 
    showToast('Ошибка регистрации'); 
    console.error(e);
  }
};

// Login
btnLogin.onclick = async () => {
  const u = inpUser.value.trim(), p = inpPass.value;
  if (!u || !p) return showToast('Введите имя и пароль');
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: u, password: p})
    });
    const data = await r.json();
    if (!data.ok) return showToast('Ошибка: ' + (data.error||''));
    token = data.token; 
    localStorage.setItem('cc_token', token);
    await afterLogin();
  } catch(e) { 
    showToast('Ошибка входа'); 
    console.error(e);
  }
};

// After login setup
async function afterLogin() {
  setAuthState(true);
  socket.auth = { token }; 
  socket.connect();
  
  // Load all initial data
  await loadUserData();
  await loadUsersList();
  await loadNFTs();
  await loadGroups();
  await loadFriends();
  await loadStickers();
  await loadThemes();
  
  // Setup user area
  const payload = JSON.parse(atob(token.split('.')[1]));
  me = { userId: payload.userId, username: payload.username };
  
  userArea.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <div>
        <div style="font-weight:700">${me.username}</div>
        <div style="font-size:12px; color:#aab6cf;">Level: <span id="userLevel">1</span></div>
      </div>
      <button id="btnProfile" style="padding:5px 10px; font-size:12px;">Профиль</button>
      <button id="btnLogout" style="padding:5px 10px; font-size:12px;">Выйти</button>
    </div>
  `;
  
  document.getElementById('btnLogout').onclick = () => { 
    localStorage.removeItem('cc_token'); 
    token = null; 
    socket.disconnect(); 
    setAuthState(false); 
  };
  
  document.getElementById('btnProfile').onclick = showProfileModal;
  
  showToast('Вход выполнен');
}

// Load user data
async function loadUserData() {
  try {
    const [userRes, achievementsRes] = await Promise.all([
      fetch('/api/profile/' + me.userId, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()),
      fetch('/api/achievements', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json())
    ]);
    
    coinAmount.innerText = userRes.coins || 0;
    if (document.getElementById('userLevel')) {
      document.getElementById('userLevel').textContent = userRes.level || 1;
    }
  } catch(e) {
    console.error('Error loading user data:', e);
  }
}

// Load users list
async function loadUsersList() {
  try {
    const ures = await fetch('/api/users', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    usersList.innerHTML = '';
    
    ures.forEach(u => {
      if (u.userId === me.userId) return;
      
      const div = document.createElement('div');
      div.className = 'userItem';
      div.dataset.uid = u.userId;
      
      const statusColor = u.status === 'online' ? '#10b981' : u.status === 'away' ? '#f59e0b' : '#6b7280';
      
      div.innerHTML = `
        <div class="avatar" style="background:linear-gradient(90deg,var(--accent),var(--accent2));">
          ${(u.username || '?').slice(0,2).toUpperCase()}
        </div>
        <div style="flex:1">
          <div style="font-weight:700">${u.username}</div>
          <div style="font-size:12px; color:#aab6cf;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${statusColor}; margin-right:5px;"></span>
            ${u.customStatus || u.status || 'offline'}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700">${u.coins || 0}💎</div>
          <div style="font-size:12px;">Level ${u.level || 1}</div>
        </div>
        <button class="friend-btn" data-uid="${u.userId}" style="margin-left:8px; padding:4px 8px; font-size:12px;">+</button>
      `;
      
      div.onclick = () => openChatWith(u.userId, u.username);
      div.querySelector('.friend-btn').onclick = (e) => {
        e.stopPropagation();
        sendFriendRequest(u.userId);
      };
      
      usersList.appendChild(div);
    });
  } catch(e) {
    console.error('Error loading users:', e);
  }
}

// Load groups
async function loadGroups() {
  try {
    const groups = await fetch('/api/groups', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    
    if (groupsList) {
      groupsList.innerHTML = '';
      groups.forEach(group => {
        const div = document.createElement('div');
        div.className = 'groupItem';
        div.innerHTML = `
          <div style="font-weight:700">${group.name}</div>
          <div style="font-size:12px; color:#aab6cf;">${group.description}</div>
        `;
        div.onclick = () => openGroupChat(group.id, group.name);
        groupsList.appendChild(div);
      });
    }
  } catch(e) {
    console.error('Error loading groups:', e);
  }
}

// Load friends
async function loadFriends() {
  try {
    const friends = await fetch('/api/friends', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    
    if (friendsList) {
      friendsList.innerHTML = '';
      friends.forEach(friend => {
        const div = document.createElement('div');
        div.className = 'friendItem';
        div.innerHTML = `
          <div class="avatar">${friend.username.slice(0,2).toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:700">${friend.username}</div>
            <div style="font-size:12px; color:#aab6cf;">${friend.status}</div>
          </div>
        `;
        div.onclick = () => openChatWith(friend.friendId, friend.username);
        friendsList.appendChild(div);
      });
    }
  } catch(e) {
    console.error('Error loading friends:', e);
  }
}

// Load stickers
async function loadStickers() {
  try {
    const data = await fetch('/api/stickers', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    // Sticker picker implementation would go here
  } catch(e) {
    console.error('Error loading stickers:', e);
  }
}

// Load themes
async function loadThemes() {
  try {
    // Theme loading implementation
  } catch(e) {
    console.error('Error loading themes:', e);
  }
}

// Open private chat
async function openChatWith(userId, username) {
  currentPeer = userId;
  currentGroup = null;
  currentChatType = 'private';
  chatsHeader.innerText = `Чат с ${username}`;
  chatWindow.innerHTML = '';
  composer.style.display = 'flex';
  
  // Load message history
  try {
    const msgs = await fetch('/api/messages/' + userId, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    msgs.forEach(renderMsg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch(e) {
    console.error('Error loading messages:', e);
    showToast('Ошибка загрузки сообщений');
  }
}

// Open group chat
async function openGroupChat(groupId, groupName) {
  currentPeer = null;
  currentGroup = groupId;
  currentChatType = 'group';
  chatsHeader.innerText = `Группа: ${groupName}`;
  chatWindow.innerHTML = '';
  composer.style.display = 'flex';
  
  // Join group room
  socket.emit('join_group', groupId);
  
  // Load group messages
  try {
    const msgs = await fetch('/api/groups/' + groupId + '/messages', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
    msgs.forEach(renderGroupMsg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } catch(e) {
    console.error('Error loading group messages:', e);
    showToast('Ошибка загрузки сообщений группы');
  }
}

// Render private message
function renderMsg(m) {
  const el = document.createElement('div');
  el.className = 'message-wrapper';
  
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerText = `${m.fromUser === me.userId ? 'Вы' : m.fromUser} • ${formatTime(m.time)}`;
  
  const msg = document.createElement('div');
  msg.className = 'msg ' + (m.fromUser === me.userId ? 'me' : 'other');
  msg.innerText = m.text;
  
  const wrapper = document.createElement('div');
  wrapper.appendChild(meta);
  wrapper.appendChild(msg);
  
  // Add reaction button
  const reactBtn = document.createElement('button');
  reactBtn.innerText = ❤️';
  reactBtn.style.marginLeft = '8px';
  reactBtn.style.padding = '2px 6px';
  reactBtn.onclick = () => addReaction(m.id, '❤️');
  wrapper.appendChild(reactBtn);
  
  // Add delete button for own messages
  if (m.fromUser === me.userId) {
    const del = document.createElement('button');
    del.innerText = 'Удалить';
    del.style.marginLeft = '8px';
    del.style.padding = '2px 6px';
    del.onclick = async () => {
      const r = await fetch('/api/message/' + m.id, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      });
      const res = await r.json();
      if (res.ok) {
        wrapper.remove();
        showToast('Сообщение удалено');
      } else {
        showToast('Не удалось удалить');
      }
    };
    wrapper.appendChild(del);
  }
  
  chatWindow.appendChild(wrapper);
}

// Render group message
function renderGroupMsg(m) {
  const el = document.createElement('div');
  el.className = 'message-wrapper';
  
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerText = `${m.username} • ${formatTime(m.time)}`;
  
  const msg = document.createElement('div');
  msg.className = 'msg ' + (m.fromUser === me.userId ? 'me' : 'other');
  msg.innerText = m.text;
  
  const wrapper = document.createElement('div');
  wrapper.appendChild(meta);
  wrapper.appendChild(msg);
  
  chatWindow.appendChild(wrapper);
}

// Send message
sendBtn.onclick = () => {
  const text = msgInput.value.trim();
  if (!text) return;
  
  if (currentChatType === 'private' && currentPeer) {
    socket.emit('private_message', { token, toUserId: currentPeer, text }, (res) => {
      if (!res || !res.ok) return showToast('Ошибка отправки');
      renderMsg(res.msg);
      msgInput.value = '';
      chatWindow.scrollTop = chatWindow.scrollHeight;
    });
  } else if (currentChatType === 'group' && currentGroup) {
    socket.emit('group_message', { groupId: currentGroup, text }, (res) => {
      if (!res || !res.ok) return showToast('Ошибка отправки');
      renderGroupMsg(res.msg);
      msgInput.value = '';
      chatWindow.scrollTop = chatWindow.scrollHeight;
    });
  }
};

// Send friend request
async function sendFriendRequest(friendId) {
  try {
    const r = await fetch('/api/friends/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ friendId })
    });
    const res = await r.json();
    if (res.ok) {
      showToast('Запрос дружбы отправлен');
    } else {
      showToast('Ошибка: ' + res.error);
    }
  } catch(e) {
    showToast('Ошибка отправки запроса');
    console.error(e);
  }
}

// Add reaction to message
async function addReaction(messageId, emoji) {
  try {
    const r = await fetch('/api/messages/' + messageId + '/react', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ emoji })
    });
    const res = await r.json();
    if (!res.ok) showToast('Ошибка реакции');
  } catch(e) {
    console.error('Error adding reaction:', e);
  }
}

// Buy coins
btnBuy.onclick = async () => {
  const amt = parseInt(buyAmount.value) || 0;
  if (amt <= 0) return showToast('Введите сумму');
  try {
    const r = await fetch('/api/purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ amount: amt })
    });
    const res = await r.json();
    if (res.ok) {
      coinAmount.innerText = parseInt(coinAmount.innerText || '0') + amt;
      showToast('Куплено ' + amt + ' монет');
    } else {
      showToast('Ошибка покупки');
    }
  } catch(e) {
    showToast('Ошибка покупки');
    console.error(e);
  }
};

// Gift NFT
async function giftNFTPrompt(nftId) {
  if (!currentPeer) return showToast('Выберите получателя');
  try {
    const r = await fetch('/api/gift-nft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ toUserId: currentPeer, nftId })
    });
    const res = await r.json();
    if (res.ok) showToast('NFT подарен!');
    else showToast('Ошибка подарка');
  } catch(e) {
    showToast('Ошибка подарка');
    console.error(e);
  }
}

// Claim daily bonus
async function claimDailyBonus() {
  try {
    const r = await fetch('/api/daily-bonus', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const res = await r.json();
    if (res.ok) {
      showToast(`Ежедневный бонус: +${res.bonusAmount} монет!`);
      coinAmount.innerText = parseInt(coinAmount.innerText || '0') + res.bonusAmount;
    } else {
      showToast('Бонус уже получен сегодня');
    }
  } catch(e) {
    showToast('Ошибка получения бонуса');
    console.error(e);
  }
}

// Show profile modal
function showProfileModal() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8); display: flex; align-items: center;
    justify-content: center; z-index: 1000;
  `;
  
  modal.innerHTML = `
    <div style="background: var(--panel); padding: 20px; border-radius: 12px; width: 400px;">
      <h3>Профиль ${me.username}</h3>
      <div style="margin: 15px 0;">
        <input type="file" id="avatarUpload" accept="image/*" style="margin-bottom: 10px;">
        <textarea id="profileBio" placeholder="О себе" style="width: 100%; height: 80px; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: white; padding: 8px; border-radius: 6px;"></textarea>
      </div>
      <div style="display: flex; gap: 10px;">
        <button onclick="updateProfile()" style="flex:1; padding: 10px; background: var(--accent); border: none; border-radius: 6px; color: white;">Сохранить</button>
        <button onclick="this.closest('div').parentElement.remove()" style="flex:1; padding: 10px; background: #6b7280; border: none; border-radius: 6px; color: white;">Отмена</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// Update profile
async function updateProfile() {
  const bio = document.getElementById('profileBio').value;
  const avatarFile = document.getElementById('avatarUpload').files[0];
  
  try {
    if (avatarFile) {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      const r = await fetch('/api/upload-avatar', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData
      });
      await r.json();
    }
    
    if (bio) {
      const r = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ bio })
      });
      await r.json();
    }
    
    showToast('Профиль обновлен');
    document.querySelector('div[style*="position: fixed"]').remove();
  } catch(e) {
    showToast('Ошибка обновления профиля');
    console.error(e);
  }
}

// Socket listeners
socket.on('new_message', ({ msg }) => {
  if ((msg.fromUser === me.userId && msg.toUser === currentPeer) || 
      (msg.fromUser === currentPeer && msg.toUser === me.userId)) {
    renderMsg(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
});

socket.on('new_group_message', ({ msg }) => {
  if (msg.groupId === currentGroup) {
    renderGroupMsg(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
});

socket.on('message_deleted', ({ id }) => {
  document.querySelector(`[data-message-id="${id}"]`)?.remove();
});

socket.on('coins_updated', ({ userId }) => {
  if (userId === me.userId) loadUserData();
});

socket.on('nft_gifted', ({ id, nftId, ownerUserId, giftedBy }) => {
  if (ownerUserId === me.userId) showToast('Вам подарили NFT!');
});

socket.on('user_status_changed', ({ userId, status, customStatus }) => {
  const userItem = document.querySelector(`.userItem[data-uid="${userId}"]`);
  if (userItem) {
    const statusEl = userItem.querySelector('.status-indicator');
    if (statusEl) {
      const color = status === 'online' ? '#10b981' : status === 'away' ? '#f59e0b' : '#6b7280';
      statusEl.style.background = color;
    }
  }
});

socket.on('friend_request', ({ fromUserId, fromUsername }) => {
  if (confirm(`${fromUsername} хочет добавить вас в друзья. Принять?`)) {
    fetch('/api/friends/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ requestId: fromUserId })
    });
  }
});

socket.on('level_up', ({ userId, newLevel }) => {
  if (userId === me.userId) {
    showToast(`🎉 Поздравляем! Вы достигли ${newLevel} уровня!`);
    document.getElementById('userLevel').textContent = newLevel;
  }
});

// Voice call handlers
socket.on('voice_call_offer', async (data) => {
  if (confirm(`${data.fromUsername} звонит вам. Принять звонок?`)) {
    await initVoiceCall(true, data.fromUserId, data.offer);
  }
});

socket.on('voice_call_answer', (data) => {
  if (peerConnection) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
});

socket.on('voice_call_ice_candidate', (data) => {
  if (peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// Initial auto-login if token exists
if (token) {
  afterLogin();
}

// Export functions for global access
window.claimDailyBonus = claimDailyBonus;
window.updateProfile = updateProfile;