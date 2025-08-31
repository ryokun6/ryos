import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

// Load environment variables from .local.env
import { readFileSync } from 'node:fs';
try {
  const envContent = readFileSync('.local.env', 'utf8');
  const envVars = envContent.split('\n').reduce((acc, line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      acc[key.trim()] = valueParts.join('=').trim();
    }
    return acc;
  }, {});
  Object.assign(process.env, envVars);
} catch (error) {
  console.warn('[mock api] Could not load .local.env file:', error.message);
}

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 5174;

const parseJSON = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
};

// In-memory user store for mock mode
const users = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);

    if (url.pathname === '/api/chat') {
      if (req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello! This is a mock AI response from your local server.');
        return;
      }
    }
    
    if (url.pathname !== '/api/chat-rooms') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    const action = url.searchParams.get('action');
    if (req.method === 'POST' && action === 'createUser') {
      const body = await parseJSON(req);
      const { username, password } = body;
      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username and password required' }));
        return;
      }
      const lower = username.toLowerCase();
      if (users.has(lower)) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username already taken' }));
        return;
      }
      const token = `mock_${randomUUID()}`;
      const user = { username: lower, createdAt: Date.now() };
      users.set(lower, { ...user, password, token });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, user, token }));
      return;
    }

    if (req.method === 'POST' && action === 'authenticateWithPassword') {
      const body = await parseJSON(req);
      const { username, password } = body;
      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username and password required' }));
        return;
      }
      const lower = username.toLowerCase();
      const entry = users.get(lower);
      if (!entry || entry.password !== password) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid username or password' }));
        return;
      }
      const token = `mock_${randomUUID()}`;
      entry.token = token;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, username: lower, token }));
      return;
    }

    if (req.method === 'GET' && url.searchParams.get('action') === 'verifyToken') {
      const token = req.headers['authorization'] ? String(req.headers['authorization']).replace(/^Bearer\s+/i, '') : null;
      const found = [...users.values()].find((u) => u.token === token);
      if (found) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false }));
      }
      return;
    }

    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid action' }));
  } catch (err) {
    console.error('[mock api] error', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal' }));
  }
});

server.listen(PORT, () => {
  console.log('[mock api] listening on', PORT);
});
