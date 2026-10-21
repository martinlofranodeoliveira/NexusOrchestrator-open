'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Server } = require('socket.io');
const { createExternalFleet } = require('./services/externalFleet');

function createFleetServer({ snapshotPath = process.env.NEXUS_FLEET_SNAPSHOT, clock = Date.now,
  port = 4000, distDir = path.resolve(__dirname, '../dist/webview') } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid loopback port');
  const fleet = createExternalFleet({ snapshotPath, clock });
  let boundPort = port, timer, closing, listening = false;
  const seen = new Set();
  const allowed = request => {
    const hosts = [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];
    if (!hosts.includes(request.headers.host)) return false;
    return !request.headers.origin || hosts.map(host => `http://${host}`).includes(request.headers.origin);
  };
  const json = (response, code, value) => {
    response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(value));
  };
  const server = http.createServer((request, response) => {
    if (!allowed(request)) return json(response, 403, { error: 'Loopback origin required' });
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return json(response, 405, { error: 'Read-only fleet' }); }
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { return json(response, 400, { error: 'Invalid request target' }); }
    const state = fleet.getState();
    if (pathname === '/health') return json(response, 200, { ok: true, timestamp: new Date(clock()).toISOString(), readOnly: true, status: state.operations });
    if (['/api/status', '/api/operations'].includes(pathname)) return json(response, 200, state.operations);
    if (pathname === '/api/agents') return json(response, 200, state.agents);
    if (pathname === '/api/tasks') return json(response, 200, state.tasks);
    if (pathname.startsWith('/api/') || pathname.split('/').some(part => part.startsWith('.'))) return json(response, 404, { error: 'Not found' });
    let descriptors = [];
    try {
      const decoded = decodeURIComponent(pathname);
      const parts = decoded === '/' ? ['index.html'] : decoded.slice(1).split('/');
      if (parts.some(part => !part || part.startsWith('.') || part.includes('\\') || part.includes('\0'))) throw new Error('Invalid asset');
      let fd = fs.openSync(distDir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW); descriptors.push(fd);
      for (let i = 0; i < parts.length; i++) {
        fd = fs.openSync(`/proc/self/fd/${fd}/${parts[i]}`, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK | (i < parts.length - 1 ? fs.constants.O_DIRECTORY : 0)); descriptors.push(fd);
      }
      const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('Invalid asset');
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
      response.writeHead(200, { 'Content-Type': types[path.extname(parts.at(-1))] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'no-referrer' });
      response.end(fs.readFileSync(fd));
    } catch { json(response, 404, { error: 'Not found' }); }
    finally { for (const descriptor of descriptors.reverse()) fs.closeSync(descriptor); }
  });
  const io = new Server(server, { serveClient: false, maxHttpBufferSize: 4096,
    allowRequest: (request, callback) => callback(null, allowed(request)),
    cors: { origin: (origin, callback) => callback(null, !origin || [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`].includes(origin)), methods: ['GET', 'POST'] } });
  // Engine.IO owns its polling POSTs. Every transport request, including upgrades,
  // is checked here; there are no application mutation event handlers.
  io.engine.use((request, response, next) => {
    if (!allowed(request)) { response.writeHead(403); response.end(); return; }
    next();
  });
  const emitState = socket => {
    const state = fleet.getState();
    socket.emit('agents_update', state.agents); socket.emit('tasks_update', state.tasks); socket.emit('operations_update', state.operations);
  };
  const refresh = () => {
    const state = fleet.refresh(); emitState(io);
    for (const event of state.events) {
      if (!seen.has(event.id)) { seen.add(event.id); io.emit('agent_log', { id: event.agentId, log: event.message }); }
    }
    // Event IDs are only retained while the bounded snapshot still contains them.
    const present = new Set(state.events.map(event => event.id));
    for (const id of seen) if (!present.has(id)) seen.delete(id);
    return state;
  };
  io.on('connection', socket => { emitState(socket); socket.on('request_initial_state', () => emitState(socket)); });
  return { server, io, refresh,
    async listen() {
      if (closing) throw new Error('Fleet server closed');
      if (listening) return;
      fleet.refresh(); for (const event of fleet.getState().events) seen.add(event.id);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); boundPort = server.address().port; listening = true; resolve(); }); });
      timer = setInterval(refresh, 2000); timer.unref();
    },
    close() {
      if (!closing) closing = new Promise(resolve => { clearInterval(timer); io.close(() => { listening = false; resolve(); }); });
      return closing;
    },
  };
}

if (require.main === module) {
  const fleet = createFleetServer();
  fleet.listen().then(() => { console.log('Nexus external fleet: http://127.0.0.1:4000 (read only)'); }).catch(() => { console.error('Nexus external fleet could not start'); process.exitCode = 1; });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void fleet.close(); });
}

module.exports = { createFleetServer };
