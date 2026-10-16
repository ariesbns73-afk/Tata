const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PASS = process.env.ADMIN_PASSWORD || ''; // empty = no login
const PORT = process.env.PORT || 3000;
const BOTS = path.join(__dirname, 'bots');
fs.mkdirSync(BOTS, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const procs = {}; // name -> child process
const logs = {};  // name -> array of lines

const dir = (n) => path.join(BOTS, n);
const metaPath = (n) => path.join(dir(n), 'bot.json');
const readMeta = (n) => { try { return JSON.parse(fs.readFileSync(metaPath(n))); } catch { return { entry: null, env: {} }; } };
const writeMeta = (n, m) => fs.writeFileSync(metaPath(n), JSON.stringify(m, null, 2));
const pushLog = (n, s) => {
  logs[n] = logs[n] || [];
  s.toString().split('\n').filter(Boolean).forEach((l) => logs[n].push(l));
  if (logs[n].length > 500) logs[n] = logs[n].slice(-500);
};

// ---- auth + name validation ----
const api = express.Router();
api.use((req, res, next) => {
  if (PASS && req.headers['x-auth'] !== PASS) return res.status(401).json({ error: 'Unauthorized' });
  next();
});
api.param('name', (req, res, next, name) => {
  if (!/^[a-z0-9_-]{1,32}$/i.test(name)) return res.status(400).json({ error: 'Invalid bot name' });
  next();
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => { fs.mkdirSync(dir(req.params.name), { recursive: true }); cb(null, dir(req.params.name)); },
    filename: (req, f, cb) => cb(null, path.basename(f.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function stopBot(n) {
  const m = readMeta(n); m.desired = false;
  if (fs.existsSync(dir(n))) writeMeta(n, m);
  if (procs[n]) procs[n].kill('SIGTERM');
}

function startBot(n) {
  if (procs[n]) return 'Already running';
  const meta = readMeta(n);
  if (!meta.entry) return 'No entry file (.js or .py) uploaded';
  meta.desired = true; writeMeta(n, meta);
  const cmd = meta.entry.endsWith('.py') ? 'python3' : 'node';
  // Minimal env: bot does NOT see ADMIN_PASSWORD
  const env = { PATH: process.env.PATH, HOME: dir(n), ...meta.env };
  const p = spawn(cmd, [meta.entry], { cwd: dir(n), env });
  procs[n] = p;
  pushLog(n, `[host] started ${cmd} ${meta.entry}`);
  p.stdout.on('data', (d) => pushLog(n, d));
  p.stderr.on('data', (d) => pushLog(n, d));
  p.on('error', (e) => { pushLog(n, `[host] error: ${e.message}`); if (procs[n] === p) delete procs[n]; });
  p.on('close', (code) => {
    pushLog(n, `[host] exited (${code})`);
    if (procs[n] === p) delete procs[n];
    // auto-restart on crash unless the admin stopped it
    if (readMeta(n).desired) {
      pushLog(n, '[host] restarting in 5s...');
      setTimeout(() => { if (readMeta(n).desired && !procs[n]) startBot(n); }, 5000);
    }
  });
  return 'Started';
}

api.get('/bots', (req, res) => {
  const list = fs.readdirSync(BOTS).filter((n) => fs.existsSync(metaPath(n))).map((n) => ({
    name: n, entry: readMeta(n).entry, running: !!procs[n],
  }));
  res.json(list);
});

api.post('/bots/:name/upload', upload.array('files', 20), (req, res) => {
  const n = req.params.name;
  const meta = readMeta(n);
  const entry = (req.files || []).find((f) => /\.(js|py)$/.test(f.originalname));
  if (entry) meta.entry = entry.originalname;
  writeMeta(n, meta);
  res.json({ ok: true, entry: meta.entry });
});

api.post('/bots/:name/env', (req, res) => {
  const n = req.params.name;
  const meta = readMeta(n);
  meta.env = req.body.env || {};
  writeMeta(n, meta);
  res.json({ ok: true });
});

api.get('/bots/:name/env', (req, res) => res.json(readMeta(req.params.name).env || {}));
api.post('/bots/:name/start', (req, res) => res.json({ msg: startBot(req.params.name) }));
api.post('/bots/:name/stop', (req, res) => { stopBot(req.params.name); res.json({ msg: 'Stopping' }); });
api.post('/bots/:name/restart', (req, res) => {
  const n = req.params.name;
  stopBot(n);
  setTimeout(() => startBot(n), 1000);
  res.json({ msg: 'Restarting' });
});
api.get('/bots/:name/logs', (req, res) => res.json(logs[req.params.name] || []));
api.delete('/bots/:name', (req, res) => {
  const n = req.params.name;
  stopBot(n);
  setTimeout(() => fs.rmSync(dir(n), { recursive: true, force: true }), 500);
  delete logs[n];
  res.json({ ok: true });
});

app.use('/api', api);
app.listen(PORT, () => {
  console.log(`Bot host running on http://localhost:${PORT}`);
  if (!PASS) console.warn('WARNING: no ADMIN_PASSWORD set - anyone who can reach this site can run code on this machine.');
  // bring back bots that were running before a server restart
  fs.readdirSync(BOTS).filter((n) => fs.existsSync(metaPath(n))).forEach((n) => {
    if (readMeta(n).desired) startBot(n);
  });
});
