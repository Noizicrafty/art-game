const app = document.getElementById('app');
const channel = new BroadcastChannel('art-game');

const themes = {
  'Космос': ['Тема космос Арт1.png', 'Тема космос Арт2.png', 'Тема космос Арт3.png'],
  'Морские приключения': ['Тема морские приключения Арт1.png', 'Тема морские приключения Арт2.png', 'Тема морские приключения Арт3.png'],
  'Путешествия': ['Тема путешествия Арт1.png', 'Тема путешествия Арт2.png', 'Тема путешествия Арт3.png'],
};

let state = { role: null, roomCode: null, room: null, kid: null };
const rooms = JSON.parse(localStorage.getItem('art-rooms') || '{}');
const save = () => localStorage.setItem('art-rooms', JSON.stringify(rooms));
const code = () => Math.random().toString().slice(2, 6);

function root() {
  app.innerHTML = `
  <div class="card">
    <div class="badge">Арт игра</div>
    <div class="title">Выберите роль</div>
    <div class="row">
      <button id="adult">Взрослый</button>
      <button class="secondary" id="child">Ребенок</button>
    </div>
  </div>`;
  adult.onclick = setupAdult;
  child.onclick = setupChild;
}

function setupAdult() {
  app.innerHTML = `<div class="card"><div class="title">Настройка</div>
  <div class="row"><button id="single">Один ребенок</button><button id="multi">Несколько детей</button></div>
  <div style="margin-top:12px"><select id="theme">${Object.keys(themes).map(t=>`<option>${t}</option>`).join('')}</select></div>
  <div style="margin-top:12px"><button id="start">Далее</button></div></div>`;
  start.onclick = () => {
    const roomCode = code();
    const isMulti = multi.classList.contains('active');
    rooms[roomCode] = { theme: theme.value, isMulti, kids: [], stage: 'lobby', chosen: pick(themes[theme.value]), votes: {}, results: [] };
    save();
    state.roomCode = roomCode;
    state.role = 'adult';
    lobby();
  };
  single.onclick = () => { single.classList.add('active'); multi.classList.remove('active'); };
  multi.onclick = () => { multi.classList.add('active'); single.classList.remove('active'); };
  single.classList.add('active');
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)] }

function lobby(){
  state.room = rooms[state.roomCode];
  app.innerHTML = `<div class="grid"><div class="card"><div class="title">Лобби</div><div id="kids"></div></div>
  <div class="card right"><div class="title">Код комнаты</div><div class="badge" style="font-size:30px">${state.roomCode}</div>
  <div style="margin-top:14px"><button id="begin">Старт</button></div></div></div>`;
  renderKids();
  begin.onclick = () => startMemorize();
}
function renderKids(){
  const room = rooms[state.roomCode];
  kids.innerHTML = room.kids.map((k,i)=>`<div class="player">${k.name}<button class="secondary" data-i="${i}">✕</button></div>`).join('') || 'Пока пусто';
  kids.querySelectorAll('button').forEach(b=>b.onclick=()=>{ room.kids.splice(+b.dataset.i,1); save(); channel.postMessage({type:'sync'}); renderKids(); });
}

function setupChild(){
  app.innerHTML = `<div class="card"><div class="title">Вход</div><input id="name" placeholder="Имя Фамилия" />
  <div style="height:8px"></div><input id="room" placeholder="Код комнаты" />
  <div style="height:10px"></div><button id="join">Войти</button></div>`;
  join.onclick = () => {
    const roomCode = room.value.trim();
    const roomObj = rooms[roomCode];
    if (!roomObj || !name.value.trim()) return;
    state = { role:'child', roomCode, room: roomObj, kid: { name: name.value.trim(), art:null, upload:null } };
    roomObj.kids.push(state.kid); save(); channel.postMessage({type:'sync'});
    waitOrPlay();
  };
}

function startMemorize(){
  const room = rooms[state.roomCode];
  room.stage='memorize'; save(); channel.postMessage({type:'sync'});
  const end = Date.now()+120000;
  app.innerHTML = `<div class="card"><div class="title">Запомни</div><div id="timer" class="badge"></div><div class="imgbox"><img src="${room.chosen}"></div></div>`;
  const t=setInterval(()=>{ const s=Math.max(0,Math.ceil((end-Date.now())/1000)); timer.textContent=`${s} сек`; if(!s){clearInterval(t); startDraw();}},300);
}
function startDraw(){
  const room = rooms[state.roomCode];
  room.stage='draw'; save(); channel.postMessage({type:'sync'});
  app.innerHTML = `<div class="card"><div class="title">Рисование</div><div id="timer" class="badge"></div>
  <div class="toolbar"><input id="size" type="range" min="2" max="24" value="5" style="width:120px"> <button class="secondary" id="clear">Очистить</button>
  <label class="secondary" style="display:inline-block;padding:12px 14px;cursor:pointer">Загрузить<input id="upload" type="file" accept="image/*" class="hidden"></label></div>
  <canvas id="canvas" width="900" height="470"></canvas><div><button id="finish">Готово</button></div></div>`;
  paintInit();
  const end = Date.now()+300000;
  const t=setInterval(()=>{ const s=Math.max(0,Math.ceil((end-Date.now())/1000)); timer.textContent=`${s} сек`; if(!s){clearInterval(t); finishRound();}},300);
  finish.onclick = ()=>{clearInterval(t); finishRound();};
}
function waitOrPlay(){
  const room = rooms[state.roomCode];
  if(room.stage==='lobby') { app.innerHTML = `<div class="card"><div class="title">Ждем старт</div><div class="badge">Комната ${state.roomCode}</div></div>`; return; }
  if(room.stage==='memorize') childMemorize();
  if(room.stage==='draw') childDraw();
  if(room.stage==='vote') childVote();
  if(room.stage==='result') childResult();
}
function childMemorize(){ const r=rooms[state.roomCode]; app.innerHTML=`<div class='card'><div class='title'>Запомни</div><img src='${r.chosen}' style='width:100%;max-height:70vh;object-fit:contain'></div>`; }
function childDraw(){ startDraw(); }
function paintInit(){
  const canvas=document.getElementById('canvas'); const ctx=canvas.getContext('2d'); ctx.lineCap='round';
  let d=false,p='#1a2440';
  const colors=['#1a2440','#ff5f5f','#ffc93d','#4cc9f0','#2ec27e','#8e69ff'];
  const bar=document.createElement('div'); bar.className='toolbar'; bar.innerHTML=colors.map((c,i)=>`<div class='swatch ${i===0?'active':''}' data-c='${c}' style='background:${c}'></div>`).join(''); canvas.parentElement.insertBefore(bar,canvas);
  bar.querySelectorAll('.swatch').forEach(s=>s.onclick=()=>{bar.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active')); s.classList.add('active'); p=s.dataset.c;});
  const pos=e=>{const r=canvas.getBoundingClientRect(); const t=e.touches?e.touches[0]:e; return {x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)};};
  const down=e=>{d=true;const q=pos(e);ctx.beginPath();ctx.moveTo(q.x,q.y)}; const move=e=>{if(!d)return;const q=pos(e);ctx.strokeStyle=p;ctx.lineWidth=size.value;ctx.lineTo(q.x,q.y);ctx.stroke()}; const up=()=>d=false;
  canvas.onmousedown=down;canvas.onmousemove=move;window.onmouseup=up;canvas.ontouchstart=down;canvas.ontouchmove=e=>{e.preventDefault();move(e)};canvas.ontouchend=up;
  clear.onclick=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
  upload.onchange=(e)=>{const f=e.target.files[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{state.kid.upload=rd.result}; rd.readAsDataURL(f);};
}
function finishRound(){
  const room=rooms[state.roomCode];
  const canvas=document.getElementById('canvas'); if(canvas) state.kid.art=canvas.toDataURL('image/png');
  const kid = room.kids.find(k=>k.name===state.kid?.name); if(kid){ kid.art=state.kid.art; kid.upload=state.kid.upload; save(); channel.postMessage({type:'sync'}); }
  if(state.role==='adult'){
    if(room.isMulti){ room.stage='vote'; save(); channel.postMessage({type:'sync'}); adultVoteView(); }
    else { room.stage='result'; room.results=[...room.kids]; save(); channel.postMessage({type:'sync'}); adultSingleResult(); }
  } else waitOrPlay();
}
function adultVoteView(){ app.innerHTML=`<div class='card'><div class='title'>Голосование детей</div><div class='badge'>Ожидаем</div><button id='show'>Показать итог</button></div>`; show.onclick=finalizeVotes; }
function childVote(){ const r=rooms[state.roomCode]; app.innerHTML=`<div class='card'><div class='title'>Выбери лучший рисунок</div><div class='gallery'>${r.kids.map((k,i)=>`<div class='vote-card'><img src='${k.art||k.upload||r.chosen}'><button data-i='${i}'>Голос</button></div>`).join('')}</div></div>`; app.querySelectorAll('button').forEach(b=>b.onclick=()=>{r.votes[state.kid.name]=+b.dataset.i; save(); channel.postMessage({type:'sync'}); app.innerHTML=`<div class='card'><div class='title'>Голос принят</div></div>`;}); }
function finalizeVotes(){ const r=rooms[state.roomCode]; const cnt=r.kids.map(_=>0); Object.values(r.votes).forEach(i=>cnt[i]++); r.results=r.kids.map((k,i)=>({name:k.name,score:cnt[i],art:k.art||k.upload||r.chosen})).sort((a,b)=>b.score-a.score); r.stage='result'; save(); channel.postMessage({type:'sync'}); adultResult(); }
function adultResult(){ const r=rooms[state.roomCode]; app.innerHTML=`<div class='card'><div class='title'>Победители</div><img src='Экран победителей.png' style='width:100%;max-height:300px;object-fit:contain'>
  <div class='player'>1 место <b>${r.results[0]?.name||'-'}</b></div><div class='player'>2 место <b>${r.results[1]?.name||'-'}</b></div><div class='player'>3 место <b>${r.results[2]?.name||'-'}</b></div></div>`; }
function adultSingleResult(){ const r=rooms[state.roomCode]; const k=r.kids[0]||{name:'Ребенок'}; app.innerHTML=`<div class='card'><div class='title'>Отлично, ${k.name}!</div><div class='grid'><div><img src='${r.chosen}' style='width:100%'></div><div><img src='${k.art||k.upload||r.chosen}' style='width:100%'></div></div></div>`; }
function childResult(){ const r=rooms[state.roomCode]; if(r.isMulti) app.innerHTML=`<div class='card'><div class='title'>Итоги</div><div class='player'>1 место <b>${r.results[0]?.name||'-'}</b></div></div>`; else adultSingleResult(); }
channel.onmessage=()=>{Object.assign(rooms, JSON.parse(localStorage.getItem('art-rooms')||'{}')); if(state.role==='adult'&&state.roomCode&&rooms[state.roomCode]?.stage==='lobby') renderKids(); if(state.role==='child'&&state.roomCode) waitOrPlay();};
root();
