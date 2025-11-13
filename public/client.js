
const socket = io(location.origin, { transports: ['websocket','polling'] });
let token = localStorage.getItem('eldivis_token');
let me = null;
const headersWithAuth = ()=> ({ 'Authorization': 'Bearer ' + token });

document.getElementById('btnRegister').onclick = async ()=> {
  const u = document.getElementById('username').value, p = document.getElementById('password').value;
  if(!u||!p) return alert('enter credentials');
  const r = await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  const j = await r.json();
  if(j.ok){ token = j.token; localStorage.setItem('eldivis_token', token); await afterLogin(); } else alert(j.error||'err');
};
document.getElementById('btnLogin').onclick = async ()=> {
  const u = document.getElementById('username').value, p = document.getElementById('password').value;
  if(!u||!p) return alert('enter credentials');
  const r = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  const j = await r.json();
  if(j.ok){ token = j.token; localStorage.setItem('eldivis_token', token); await afterLogin(); } else alert(j.error||'err');
};

async function afterLogin(){
  document.getElementById('auth').style.display='none';
  document.getElementById('appUI').style.display='flex';
  socket.auth = { token }; socket.connect();
  await loadMe();
  await loadUsers();
}

async function loadMe(){
  const r = await fetch('/api/me',{headers: headersWithAuth()});
  const j = await r.json(); me = j.user;
  document.getElementById('meinfo').innerText = `You: ${me.username} • ${me.nickname || ''} • 💎 ${me.coins}`;
}

async function loadUsers(){
  const r = await fetch('/api/users',{headers: headersWithAuth()});
  const list = await r.json();
  const el = document.getElementById('users'); el.innerHTML='';
  list.forEach(u=>{
    const d = document.createElement('div'); d.style.padding='6px'; d.style.cursor='pointer';
    d.innerText = `${u.nickname || u.username} • 💎 ${u.coins}`;
    d.onclick = ()=> openChat(u.id, u.nickname||u.username);
    el.appendChild(d);
  });
}

let currentPeer = null;
async function openChat(id, name){
  currentPeer = id;
  document.getElementById('messages').innerHTML='';
  const r = await fetch('/api/messages/'+id, { headers: headersWithAuth() });
  const msgs = await r.json();
  msgs.forEach(m=> renderMsg(m));
}

function renderMsg(m){
  const wrap = document.createElement('div'); wrap.style.margin='6px';
  const who = document.createElement('div'); who.style.fontSize='12px'; who.innerText = (m.from_user===me.id?'You':m.from_user) + ' • ' + new Date(m.created_at).toLocaleString();
  const txt = document.createElement('div'); txt.innerText = m.text || '';
  wrap.appendChild(who); wrap.appendChild(txt);
  if(m.attachment){ const a = document.createElement('a'); a.href = m.attachment; a.target='_blank'; a.innerText = 'Attachment'; wrap.appendChild(a); }
  document.getElementById('messages').appendChild(wrap);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}

document.getElementById('btnSend').onclick = async ()=>{
  if(!currentPeer) return alert('Choose user');
  const text = document.getElementById('msgtext').value;
  const file = document.getElementById('file').files[0];
  const form = new FormData(); form.append('toUserId', currentPeer); form.append('text', text);
  if(file) form.append('file', file);
  const r = await fetch('/api/message', { method:'POST', headers: { 'Authorization': 'Bearer ' + token }, body: form });
  const j = await r.json();
  if(j.ok){ renderMsg(j.msg); document.getElementById('msgtext').value=''; }
};

socket.on('new_message', ({msg})=>{ if(me && (msg.from_user===me.id || msg.to_user===me.id) && currentPeer && (msg.from_user===currentPeer || msg.to_user===currentPeer)) renderMsg(msg); });
