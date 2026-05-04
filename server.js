const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 1919;
const rooms = new Map();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}
function code() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function roomResponse(room) {
  return {
    code: room.code,
    mode: room.mode,
    theme: room.theme,
    chosen: room.chosen,
    stage: room.stage,
    stageStartedAt: room.stageStartedAt,
    kids: room.kids.map((k) => ({ name: k.name, art: k.art || null, upload: k.upload || null })),
    votes: room.votes,
    results: room.results,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    const { mode, theme, chosen } = await body(req);
    const roomCode = code();
    const room = { code: roomCode, mode, theme, chosen, stage: 'lobby', stageStartedAt: Date.now(), kids: [], votes: {}, results: [] };
    rooms.set(roomCode, room);
    return send(res, 200, { ok: true, room: roomResponse(room) });
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'rooms' && parts[2]) {
    const room = rooms.get(parts[2]);
    if (!room) return send(res, 404, { ok: false });

    if (parts.length === 3 && req.method === 'GET') return send(res, 200, { ok: true, room: roomResponse(room) });

    if (parts[3] === 'join' && req.method === 'POST') {
      const { name } = await body(req);
      if (!name) return send(res, 400, { ok: false });
      if (!room.kids.find((k) => k.name === name)) room.kids.push({ name, art: null, upload: null });
      return send(res, 200, { ok: true, room: roomResponse(room) });
    }
    if (parts[3] === 'kid' && parts[4] && req.method === 'DELETE') {
      room.kids = room.kids.filter((k) => k.name !== decodeURIComponent(parts[4]));
      return send(res, 200, { ok: true, room: roomResponse(room) });
    }
    if (parts[3] === 'stage' && req.method === 'POST') {
      const { stage } = await body(req);
      room.stage = stage;
      room.stageStartedAt = Date.now();
      return send(res, 200, { ok: true, room: roomResponse(room) });
    }
    if (parts[3] === 'art' && req.method === 'POST') {
      const { name, art, upload } = await body(req);
      const kid = room.kids.find((k) => k.name === name);
      if (kid) {
        kid.art = art || kid.art;
        kid.upload = upload || kid.upload;
      }
      return send(res, 200, { ok: true });
    }
    if (parts[3] === 'vote' && req.method === 'POST') {
      const { voter, target } = await body(req);
      room.votes[voter] = target;
      return send(res, 200, { ok: true });
    }
    if (parts[3] === 'results' && req.method === 'POST') {
      const scores = {};
      room.kids.forEach((k) => (scores[k.name] = 0));
      Object.values(room.votes).forEach((name) => { if (scores[name] !== undefined) scores[name] += 1; });
      room.results = room.kids.map((k) => ({ name: k.name, score: scores[k.name], art: k.art || k.upload || room.chosen })).sort((a,b)=>b.score-a.score);
      room.stage = 'result';
      room.stageStartedAt = Date.now();
      return send(res, 200, { ok: true, room: roomResponse(room) });
    }
  }

  const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const fp = path.join(process.cwd(), file);
  if (!fp.startsWith(process.cwd())) return send(res, 403, { ok: false });
  fs.readFile(fp, (err, data) => {
    if (err) return send(res, 404, { ok: false });
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`http://0.0.0.0:${PORT}`));
