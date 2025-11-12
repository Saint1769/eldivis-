
// client.js - UI logic for full messenger with auth, private chats, coins and NFTs
const socket = io(location.origin, { transports: ['websocket','polling'] });

// elements
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

let token = localStorage.getItem('cc_token');
let me = null;
let currentPeer = null;

// helpers
function showToast(t){ toast.style.display='block'; toast.innerText = t; setTimeout(()=> toast.style.display='none',3000); }
function setAuthState(logged){
  authSection.style.display = logged ? 'none' : 'block';
  walletSection.style.display = logged ? 'block' : 'none';
  usersListSection.style.display = logged ? 'block' : 'none';
  nftSection.style.display = logged ? 'block' : 'none';
  composer.style.display = logged ? 'flex' : 'none';
  if (!logged) { usersList.innerHTML=''; nftList.innerHTML=''; chatWindow.innerHTML=''; coinAmount.innerText=''; userArea.innerHTML=''; }
}

// register
btnRegister.onclick = async ()=>{
  const u = inpUser.value.trim(), p = inpPass.value;
  if (!u || !p) return showToast('Введите имя и пароль');
  try{
    const r = await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const data = await r.json();
    if (!data.ok) return showToast('Ошибка: ' + (data.error||''));
    token = data.token; localStorage.setItem('cc_token', token);
    await afterLogin();
  }catch(e){ showToast('Ошибка регистрации'); }
};

// login
btnLogin.onclick = async ()=>{
  const u = inpUser.value.trim(), p = inpPass.value;
  if (!u || !p) return showToast('Введите имя и пароль');
  try{
    const r = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const data = await r.json();
    if (!data.ok) return showToast('Ошибка: ' + (data.error||''));
    token = data.token; localStorage.setItem('cc_token', token);
    await afterLogin();
  }catch(e){ showToast('Ошибка входа'); }
};

async function afterLogin(){
  // fetch users and NFTs and wallet
  setAuthState(true);
  socket.auth = { token }; socket.connect();
  const ures = await fetch('/api/users',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  const nres = await fetch('/api/nfts',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  // update UI
  usersList.innerHTML='';
  ures.forEach(u=>{
    const div = document.createElement('div');
    div.className='userItem'; div.dataset.uid = u.userId;
    div.innerHTML = `<div class="avatar">${(u.username||'?').slice(0,2).toUpperCase()}</div><div style="font-weight:700">${u.username}</div><div style="margin-left:auto">${u.coins||0}💎</div>`;
    div.onclick = ()=> openChatWith(u.userId, u.username);
    usersList.appendChild(div);
  });
  nftList.innerHTML='';
  nres.forEach(n=>{
    const d = document.createElement('div'); d.className='nftItem';
    d.innerHTML = `<img src="${n.image}" width="48" height="48" style="border-radius:8px"/><div style="flex:1"><div style="font-weight:700">${n.title}</div></div><button data-nid="${n.id}">Подарить</button>`;
    const btn = d.querySelector('button');
    btn.onclick = ()=> giftNFTPrompt(n.id);
    nftList.appendChild(d);
  });
  // get my data from token
  const payload = JSON.parse(atob(token.split('.')[1]));
  me = { userId: payload.userId, username: payload.username };
  userArea.innerHTML = `<div style="font-weight:700">${me.username}</div><button id="btnLogout">Выйти</button>`;
  document.getElementById('btnLogout').onclick = ()=> { localStorage.removeItem('cc_token'); token=null; socket.disconnect(); setAuthState(false); };
  // coins balance
  const userObj = ures.find(x=>x.userId===me.userId);
  coinAmount.innerText = userObj ? userObj.coins||0 : '0';
  showToast('Вход выполнен');
}

// open chat
async function openChatWith(userId, username){
  currentPeer = userId;
  chatsHeader.innerText = 'Чат с ' + username;
  chatWindow.innerHTML = '';
  composer.style.display = 'flex';
  // load history
  const msgs = await fetch('/api/messages/'+userId,{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
  msgs.forEach(renderMsg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// render message
function renderMsg(m){
  const el = document.createElement('div');
  const meta = document.createElement('div'); meta.className='meta'; meta.innerText = `${m.fromUser === me.userId ? 'Вы' : m.fromUser} • ${new Date(m.time).toLocaleString()}`;
  const msg = document.createElement('div'); msg.className = 'msg ' + (m.fromUser===me.userId ? 'me' : 'other'); msg.innerText = m.text;
  const wrapper = document.createElement('div'); wrapper.appendChild(meta); wrapper.appendChild(msg);
  // add delete button for own messages
  if (m.fromUser === me.userId){
    const del = document.createElement('button'); del.innerText='Удалить'; del.style.marginLeft='8px';
    del.onclick = async ()=>{
      const r = await fetch('/api/message/'+m.id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
      const res = await r.json();
      if (res.ok) { wrapper.remove(); showToast('Сообщение удалено'); }
      else showToast('Не удалось удалить');
    };
    wrapper.appendChild(del);
  }
  chatWindow.appendChild(wrapper);
}

// send message
sendBtn.onclick = ()=>{
  const text = msgInput.value.trim();
  if (!text || !currentPeer) return;
  socket.emit('private_message', { token, toUserId: currentPeer, text }, (res)=>{
    if (!res || !res.ok) return showToast('Ошибка отправки');
    renderMsg(res.msg);
    msgInput.value='';
  });
};

// buy coins (simulated)
btnBuy.onclick = async ()=>{
  const amt = parseInt(buyAmount.value) || 0;
  if (amt <= 0) return showToast('Введите сумму');
  const r = await fetch('/api/purchase',{method:'POST',headers:{'Content-Type':'application/json', Authorization:'Bearer '+token},body:JSON.stringify({amount:amt})});
  const res = await r.json();
  if (res.ok) { coinAmount.innerText = parseInt(coinAmount.innerText || '0') + amt; showToast('Куплено ' + amt + ' монет'); }
  else showToast('Ошибка покупки');
};

// gift NFT prompt
async function giftNFTPrompt(nftId){
  if (!currentPeer) return showToast('Выберите получателя');
  const r = await fetch('/api/gift-nft',{method:'POST',headers:{'Content-Type':'application/json', Authorization:'Bearer '+token},body:JSON.stringify({toUserId: currentPeer, nftId})});
  const res = await r.json();
  if (res.ok) showToast('NFT подарен!');
  else showToast('Ошибка подарка');
}

// socket listeners
socket.on('new_message', ({msg})=>{
  if ((msg.fromUser===me.userId && msg.toUser===currentPeer) || (msg.fromUser===currentPeer && msg.toUser===me.userId)){
    renderMsg(msg);
  }
});
socket.on('message_deleted', ({id})=>{
  if (currentPeer) openChatWith(currentPeer);
});
socket.on('coins_updated', ({userId})=>{
  if (userId === me.userId) afterLogin();
});
socket.on('nft_gifted', ({id, nftId, ownerUserId, giftedBy})=>{
  if (ownerUserId === me.userId) showToast('Вам подарили NFT!');
});

// initial auto-login if token exists
if (token) afterLogin();
