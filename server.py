import json
import mimetypes
import os
import random
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

PORT = int(os.environ.get('PORT', '1919'))
HOST = os.environ.get('HOST', '0.0.0.0')
ROOT = os.path.abspath(os.getcwd())

rooms = {}


def room_response(room):
    return {
        'code': room['code'],
        'mode': room['mode'],
        'theme': room['theme'],
        'chosen': room['chosen'],
        'stage': room['stage'],
        'stageStartedAt': room['stageStartedAt'],
        'kids': [{'name': k['name'], 'art': k.get('art'), 'upload': k.get('upload')} for k in room['kids']],
        'votes': room['votes'],
        'results': room['results'],
    }


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get('Content-Length', '0') or '0')
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode('utf-8')
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        parts = [p for p in path.split('/') if p]

        if len(parts) == 3 and parts[0] == 'api' and parts[1] == 'rooms':
            room = rooms.get(parts[2])
            if not room:
                return self._send_json(404, {'ok': False})
            return self._send_json(200, {'ok': True, 'room': room_response(room)})

        file_path = 'index.html' if path == '/' else unquote(path[1:])
        abs_path = os.path.abspath(os.path.join(ROOT, file_path))
        if not abs_path.startswith(ROOT):
            return self._send_json(403, {'ok': False})
        if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
            return self._send_json(404, {'ok': False})

        with open(abs_path, 'rb') as f:
            data = f.read()
        mime, _ = mimetypes.guess_type(abs_path)
        self.send_response(200)
        self.send_header('Content-Type', f"{mime or 'application/octet-stream'}")
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split('/') if p]
        payload = self._read_body()

        if len(parts) == 2 and parts[0] == 'api' and parts[1] == 'rooms':
            room_code = str(random.randint(1000, 9999))
            while room_code in rooms:
                room_code = str(random.randint(1000, 9999))
            room = {
                'code': room_code,
                'mode': payload.get('mode', 'single'),
                'theme': payload.get('theme'),
                'chosen': payload.get('chosen'),
                'stage': 'lobby',
                'stageStartedAt': int(time.time() * 1000),
                'kids': [],
                'votes': {},
                'results': [],
            }
            rooms[room_code] = room
            return self._send_json(200, {'ok': True, 'room': room_response(room)})

        if len(parts) >= 3 and parts[0] == 'api' and parts[1] == 'rooms':
            room = rooms.get(parts[2])
            if not room:
                return self._send_json(404, {'ok': False})

            if len(parts) == 4 and parts[3] == 'join':
                name = payload.get('name', '').strip()
                if not name:
                    return self._send_json(400, {'ok': False})
                if not any(k['name'] == name for k in room['kids']):
                    room['kids'].append({'name': name, 'art': None, 'upload': None})
                return self._send_json(200, {'ok': True, 'room': room_response(room)})

            if len(parts) == 4 and parts[3] == 'stage':
                room['stage'] = payload.get('stage', room['stage'])
                room['stageStartedAt'] = int(time.time() * 1000)
                return self._send_json(200, {'ok': True, 'room': room_response(room)})

            if len(parts) == 4 and parts[3] == 'art':
                name = payload.get('name')
                for kid in room['kids']:
                    if kid['name'] == name:
                        if payload.get('art'):
                            kid['art'] = payload.get('art')
                        if payload.get('upload'):
                            kid['upload'] = payload.get('upload')
                        break
                return self._send_json(200, {'ok': True})

            if len(parts) == 4 and parts[3] == 'vote':
                voter = payload.get('voter')
                target = payload.get('target')
                if voter and target:
                    room['votes'][voter] = target
                return self._send_json(200, {'ok': True})

            if len(parts) == 4 and parts[3] == 'results':
                scores = {k['name']: 0 for k in room['kids']}
                for target in room['votes'].values():
                    if target in scores:
                        scores[target] += 1
                room['results'] = sorted([
                    {'name': k['name'], 'score': scores.get(k['name'], 0), 'art': k.get('art') or k.get('upload') or room['chosen']}
                    for k in room['kids']
                ], key=lambda x: x['score'], reverse=True)
                room['stage'] = 'result'
                room['stageStartedAt'] = int(time.time() * 1000)
                return self._send_json(200, {'ok': True, 'room': room_response(room)})

        return self._send_json(404, {'ok': False})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split('/') if p]

        if len(parts) == 5 and parts[0] == 'api' and parts[1] == 'rooms' and parts[3] == 'kid':
            room = rooms.get(parts[2])
            if not room:
                return self._send_json(404, {'ok': False})
            name = unquote(parts[4])
            room['kids'] = [k for k in room['kids'] if k['name'] != name]
            return self._send_json(200, {'ok': True, 'room': room_response(room)})

        return self._send_json(404, {'ok': False})


if __name__ == '__main__':
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'http://{HOST}:{PORT}')
    server.serve_forever()
