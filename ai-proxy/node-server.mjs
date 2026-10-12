// Node entry point (Node 20 or newer; tried only on Node 22). It speaks plain HTTP, so run it only behind something
// that provides HTTPS (your host's proxy, Caddy, nginx …); the website refuses a proxy
// address that is not https.
//
//   AI_API_KEY=... ALLOWED_ORIGINS=https://you.github.io node ai-proxy/node-server.mjs
//
// Optional: PORT (default 8787), AI_PROVIDER, AI_MODEL, AI_BASE_URL, and CLIENT_IP_HEADER.
// CLIENT_IP_HEADER names the header in which YOUR reverse proxy writes the visitor's address
// (for example "x-forwarded-for" or "x-real-ip"). Set it only when every request really comes
// through that proxy; otherwise anyone can fake the header. Without it the address of the
// direct connection is used, which behind a reverse proxy is the same for every visitor.
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHandler } from './handler.mjs';

const MAX_UPLOAD = 16 * 1024;   // bytes read from one request before it is cut off

export function loadPersonas() {
  return JSON.parse(fs.readFileSync(fileURLToPath(new URL('./personas.json', import.meta.url)), 'utf8')).personas;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (+(req.headers['content-length'] || 0) > MAX_UPLOAD) { reject(Object.assign(new Error('too large'), { status: 413 })); return; }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD) reject(Object.assign(new Error('too large'), { status: 413 })); else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    // an upload that is cut off must end this one request, not the whole process
    req.on('close', () => { if (!req.complete) reject(Object.assign(new Error('aborted'), { status: 400 })); });
    req.on('error', (e) => reject(Object.assign(e, { status: 400 })));
  });
}

export function createServer(env = process.env, deps = {}) {
  const handle = createHandler(env, { personas: loadPersonas(), ...deps });
  const ipHeader = String(env.CLIENT_IP_HEADER || '').trim().toLowerCase();
  const callerIp = (req) => {
    // the right-most value is the one written by the nearest proxy, i.e. yours
    const fromHeader = ipHeader ? String(req.headers[ipHeader] || '').split(',').pop().trim() : '';
    return fromHeader || req.socket.remoteAddress || 'unknown';
  };
  const server = http.createServer(async (req, res) => {
    const fail = (status) => {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', connection: 'close' });
      res.end(JSON.stringify({ error: status === 413 ? 'too-large' : status === 400 ? 'bad-request' : 'server' }));
    };
    try {
      const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const body = hasBody ? await readBody(req) : undefined;
      const headers = new Headers();   // only what the handler reads
      for (const k of ['origin', 'content-type', 'content-length']) if (typeof req.headers[k] === 'string') headers.set(k, req.headers[k]);
      const request = new Request('http://localhost/', { method: req.method, headers, body });
      const out = await handle(request, { ip: callerIp(req) });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(await out.text());
    } catch (err) {
      fail(err && (err.status === 413 || err.status === 400) ? err.status : 500);
    }
  });
  server.requestTimeout = 15000;    // a request that dribbles in is dropped
  server.headersTimeout = 10000;
  server.on('clientError', (err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nconnection: close\r\n\r\n'); else socket.destroy(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = +(process.env.PORT || 8787);
  if (!process.env.AI_API_KEY) console.warn('AI_API_KEY is not set: every request will be answered with 503.');
  if (!process.env.ALLOWED_ORIGINS) console.warn('ALLOWED_ORIGINS is not set: every request will be answered with 403.');
  createServer().listen(port, () => console.log(`AI proxy listening on :${port} (plain HTTP — put HTTPS in front of it)`));
}
