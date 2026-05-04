const app = document.getElementById('app');

const themes = {
  'Космос': ['Тема космос Арт1.png', 'Тема космос Арт2.png', 'Тема космос Арт3.png'],
  'Морские приключения': ['Тема морские приключения Арт1.png', 'Тема морские приключения Арт2.png', 'Тема морские приключения Арт3.png'],
  'Путешествия': ['Тема путешествия Арт1.png', 'Тема путешествия Арт2.png', 'Тема путешествия Арт3.png'],
};

let state = { role: null, roomCode: null, room: null, kidName: null, timer: null, poller: null, currentUpload: null };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function api(path, method = 'GET', data) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  return res.json();
}

function startPolling() {
  stopPolling();
  state.poller = setInterval(syncRoom, 1500);
}
function stopPolling() {
  if (state.poller) clearInterval(state.poller);
}

async function syncRoom() {
  if (!state.roomCode) return;
  const resp = await api(`/rooms/${state.roomCode}`);
  if (!resp.ok) return;
  const prevStage = state.room?.stage;
  state.room = resp.room;
  if (state.role === 'adult') {
    if (state.room.stage === 'lobby') lobby();
    if (state.room.stage === 'vote') adultVoteView();
    if (state.room.stage === 'result') state.room.mode === 'single' ? adultSingleResult() : adultResult();
  } else if (state.role === 'child' && prevStage !== state.room.stage) {
    waitOrPlay();
  }
}

function root() {
  app.innerHTML = `<div class="card"><div class="badge">Арт игра</div><div class="title">Выберите роль</div><div class="row">
      <button id="adult">Учитель</button><button class="secondary" id="child">Ребенок</button>
    </div></div>`;
  adult.onclick = setupAdult;
  child.onclick = setupChild;
}

function setupAdult() {
  app.innerHTML = `<div class="card"><div class="title">Создание комнаты</div>
  <div class="row"><button id="single">Один ребенок</button><button id="multi">Несколько детей</button></div>
  <div style="margin-top:12px"><select id="theme">${Object.keys(themes).map((t) => `<option>${t}</option>`).join('')}</select></div>
  <div style="margin-top:12px"><button id="start">Создать комнату</button></div></div>`;

  single.onclick = () => { single.classList.add('active'); multi.classList.remove('active'); };
  multi.onclick = () => { multi.classList.add('active'); single.classList.remove('active'); };
  single.classList.add('active');

  start.onclick = async () => {
    const mode = multi.classList.contains('active') ? 'multi' : 'single';
    const chosen = pick(themes[theme.value]);
    const resp = await api('/rooms', 'POST', { mode, theme: theme.value, chosen });
    if (!resp.ok) return;
    state.role = 'adult';
    state.roomCode = resp.room.code;
    state.room = resp.room;
    startPolling();
    lobby();
  };
}

function lobby() {
  if (state.room?.stage !== 'lobby') return;
  app.innerHTML = `<div class="grid"><div class="card"><div class="title">Лобби</div><div id="kids"></div></div>
  <div class="card right"><div class="title">Код комнаты</div><div class="badge" style="font-size:30px">${state.roomCode}</div>
  <div style="margin-top:14px"><button id="begin">Старт</button></div></div></div>`;
  kids.innerHTML = state.room.kids.map((k) => `<div class="player">${k.name}<button class="secondary" data-name="${encodeURIComponent(k.name)}">✕</button></div>`).join('') || 'Пока пусто';
  kids.querySelectorAll('button').forEach((b) => (b.onclick = async () => {
    await api(`/rooms/${state.roomCode}/kid/${b.dataset.name}`, 'DELETE');
    syncRoom();
  }));
  begin.onclick = startMemorize;
}

function setupChild() {
  app.innerHTML = `<div class="card"><div class="title">Вход</div><input id="name" placeholder="Имя Фамилия" />
  <div style="height:8px"></div><input id="room" placeholder="Код комнаты" />
  <div style="height:10px"></div><button id="join">Войти</button></div>`;
  join.onclick = async () => {
    const roomCode = room.value.trim();
    const kidName = name.value.trim();
    if (!roomCode || !kidName) return;
    const resp = await api(`/rooms/${roomCode}/join`, 'POST', { name: kidName });
    if (!resp.ok) return;
    state = { ...state, role: 'child', roomCode, kidName, room: resp.room };
    startPolling();
    waitOrPlay();
  };
}

async function startMemorize() {
  await api(`/rooms/${state.roomCode}/stage`, 'POST', { stage: 'memorize' });
  await syncRoom();
  showMemorizeScreen(() => state.role === 'adult' ? startDraw() : waitOrPlay());
}

function showMemorizeScreen(onDone) {
  const r = state.room;
  const end = Date.now() + 120000;
  app.innerHTML = `<div class="card"><div class="title">Запомни</div><div id="timer" class="badge"></div><div class="imgbox"><img src="${r.chosen}"></div></div>`;
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    timer.textContent = `${s} сек`;
    if (!s) { clearInterval(state.timer); onDone(); }
  }, 300);
}

async function startDraw() {
  if (state.role === 'adult') {
    await api(`/rooms/${state.roomCode}/stage`, 'POST', { stage: 'draw' });
    await syncRoom();
  }
  const end = Date.now() + 300000;
  app.innerHTML = `<div class="card"><div class="title">Рисование</div><div id="timer" class="badge"></div>
  <div class="toolbar"><input id="size" type="range" min="2" max="24" value="5" style="width:120px"> <button class="secondary" id="clear">Очистить</button>
  <label class="secondary" style="display:inline-block;padding:12px 14px;cursor:pointer">Загрузить<input id="upload" type="file" accept="image/*" class="hidden"></label></div>
  <canvas id="canvas" width="900" height="470"></canvas><div><button id="finish">Готово</button></div></div>`;
  paintInit();
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    timer.textContent = `${s} сек`;
    if (!s) { clearInterval(state.timer); finishRound(); }
  }, 300);
  finish.onclick = () => { clearInterval(state.timer); finishRound(); };
}

function waitOrPlay() {
  const room = state.room;
  if (!room) return;
  if (room.stage === 'lobby') { app.innerHTML = `<div class="card"><div class="title">Ждем старт</div><div class="badge">Комната ${state.roomCode}</div></div>`; return; }
  if (room.stage === 'memorize') return showMemorizeScreen(waitOrPlay);
  if (room.stage === 'draw') return startDraw();
  if (room.stage === 'vote') return childVote();
  if (room.stage === 'result') return childResult();
}

function paintInit() {
  const canvas = document.getElementById('canvas'); const ctx = canvas.getContext('2d'); ctx.lineCap = 'round';
  let d = false; let p = '#1a2440'; state.currentUpload = null;
  const colors = ['#1a2440', '#ff5f5f', '#ffc93d', '#4cc9f0', '#2ec27e', '#8e69ff'];
  const bar = document.createElement('div'); bar.className = 'toolbar';
  bar.innerHTML = colors.map((c, i) => `<div class='swatch ${i === 0 ? 'active' : ''}' data-c='${c}' style='background:${c}'></div>`).join('');
  canvas.parentElement.insertBefore(bar, canvas);
  bar.querySelectorAll('.swatch').forEach((s) => s.onclick = () => { bar.querySelectorAll('.swatch').forEach((x) => x.classList.remove('active')); s.classList.add('active'); p = s.dataset.c; });
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) }; };
  const down = (e) => { d = true; const q = pos(e); ctx.beginPath(); ctx.moveTo(q.x, q.y); };
  const move = (e) => { if (!d) return; const q = pos(e); ctx.strokeStyle = p; ctx.lineWidth = size.value; ctx.lineTo(q.x, q.y); ctx.stroke(); };
  canvas.onmousedown = down; canvas.onmousemove = move; window.onmouseup = () => { d = false; };
  canvas.ontouchstart = down; canvas.ontouchmove = (e) => { e.preventDefault(); move(e); }; canvas.ontouchend = () => { d = false; };
  clear.onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
  upload.onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { state.currentUpload = rd.result; }; rd.readAsDataURL(f); };
}

async function finishRound() {
  const canvas = document.getElementById('canvas');
  const art = canvas ? canvas.toDataURL('image/png') : null;
  const upload = state.currentUpload;
  if (state.role === 'child') await api(`/rooms/${state.roomCode}/art`, 'POST', { name: state.kidName, art, upload });
  if (state.role === 'adult') {
    if (state.room.mode === 'multi') {
      await api(`/rooms/${state.roomCode}/stage`, 'POST', { stage: 'vote' });
      adultVoteView();
    } else {
      await api(`/rooms/${state.roomCode}/results`, 'POST', {});
      await syncRoom();
      adultSingleResult();
    }
  } else {
    app.innerHTML = `<div class='card'><div class='title'>Работа отправлена</div><div class='badge'>Ждем остальных</div></div>`;
  }
}

function adultVoteView() { app.innerHTML = `<div class='card'><div class='title'>Голосование детей</div><div class='badge'>Ожидаем</div><button id='show'>Показать итог</button></div>`; show.onclick = finalizeVotes; }

function childVote() {
  const r = state.room;
  app.innerHTML = `<div class='card'><div class='title'>Выбери лучший рисунок</div><div class='gallery'>${r.kids.map((k) => `<div class='vote-card'><img src='${k.art || k.upload || r.chosen}'><button data-name='${k.name}'>Голос</button></div>`).join('')}</div></div>`;
  app.querySelectorAll('button').forEach((b) => b.onclick = async () => {
    await api(`/rooms/${state.roomCode}/vote`, 'POST', { voter: state.kidName, target: b.dataset.name });
    app.innerHTML = `<div class='card'><div class='title'>Голос принят</div></div>`;
  });
}

async function finalizeVotes() { await api(`/rooms/${state.roomCode}/results`, 'POST', {}); await syncRoom(); adultResult(); }
function adultResult() { const r = state.room; app.innerHTML = `<div class='card'><div class='title'>Победители</div><img src='Экран победителей.png' style='width:100%;max-height:300px;object-fit:contain'><div class='player'>1 место <b>${r.results[0]?.name || '-'}</b></div><div class='player'>2 место <b>${r.results[1]?.name || '-'}</b></div><div class='player'>3 место <b>${r.results[2]?.name || '-'}</b></div></div>`; }
function adultSingleResult() { const r = state.room; const k = r.kids[0] || { name: 'Ребенок' }; app.innerHTML = `<div class='card'><div class='title'>Отлично, ${k.name}!</div><div class='grid'><div><img src='${r.chosen}' style='width:100%'></div><div><img src='${k.art || k.upload || r.chosen}' style='width:100%'></div></div></div>`; }
function childResult() { const r = state.room; if (r.mode === 'multi') app.innerHTML = `<div class='card'><div class='title'>Итоги</div><div class='player'>1 место <b>${r.results[0]?.name || '-'}</b></div></div>`; else adultSingleResult(); }

root();
