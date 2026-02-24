const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'classroom-admin';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    meta: {
      title: 'Global Trading Simulation',
      subtitle: 'Build shapes, trade smart, and grow your country\'s wealth.',
      roundLabel: 'Round 1',
      announcement: 'Welcome to the trading floor.',
      paused: false,
      buzzerCount: 0,
      updatedAt: nowIso()
    },
    shapes: [
      { id: makeId('shape'), name: 'Square', price: 50, color: '#0b3c5d' },
      { id: makeId('shape'), name: 'Triangle', price: 75, color: '#328cc1' },
      { id: makeId('shape'), name: 'Circle', price: 100, color: '#d9b310' }
    ],
    teams: [],
    transactions: []
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_PATH)) {
    const initial = defaultState();
    fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      ...defaultState(),
      ...parsed,
      meta: {
        ...defaultState().meta,
        ...(parsed.meta || {})
      },
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      shapes: Array.isArray(parsed.shapes) ? parsed.shapes : defaultState().shapes,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch (error) {
    console.error('Failed to read state.json, using defaults:', error.message);
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  state.meta.updatedAt = nowIso();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function rankTeams(teams) {
  return [...teams]
    .sort((a, b) => {
      if (b.cash !== a.cash) return b.cash - a.cash;
      if ((b.accepted || 0) !== (a.accepted || 0)) return (b.accepted || 0) - (a.accepted || 0);
      return a.name.localeCompare(b.name);
    })
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function publicState() {
  return {
    meta: state.meta,
    shapes: state.shapes,
    teams: rankTeams(state.teams)
  };
}

function adminState() {
  return {
    ...publicState(),
    transactions: [...state.transactions].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100)
  };
}

function broadcastState() {
  io.emit('state:update', publicState());
  io.emit('admin:update', adminState());
}

function requireAdmin(req, res, next) {
  const provided = req.header('x-admin-key');
  if (!provided || provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, updatedAt: state.meta.updatedAt });
});

app.get('/api/state', (req, res) => {
  res.json(publicState());
});

app.post('/api/admin/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ ok: true });
});

app.get('/api/admin/state', requireAdmin, (req, res) => {
  res.json(adminState());
});

app.put('/api/admin/meta', requireAdmin, (req, res) => {
  const { title, subtitle, roundLabel, announcement, paused } = req.body || {};
  state.meta = {
    ...state.meta,
    ...(typeof title === 'string' ? { title: title.trim() || state.meta.title } : {}),
    ...(typeof subtitle === 'string' ? { subtitle: subtitle.trim() } : {}),
    ...(typeof roundLabel === 'string' ? { roundLabel: roundLabel.trim() } : {}),
    ...(typeof announcement === 'string' ? { announcement: announcement.trim() } : {}),
    ...(typeof paused === 'boolean' ? { paused } : {})
  };
  saveState();
  broadcastState();
  res.json({ ok: true, meta: state.meta });
});

app.post('/api/admin/teams', requireAdmin, (req, res) => {
  const { name, flagUrl } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Team name is required' });
  }
  const team = {
    id: makeId('team'),
    name: name.trim(),
    flagUrl: typeof flagUrl === 'string' ? flagUrl.trim() : '',
    cash: 0,
    accepted: 0,
    rejected: 0
  };
  state.teams.push(team);
  saveState();
  broadcastState();
  res.status(201).json({ ok: true, team });
});

app.put('/api/admin/teams/:teamId', requireAdmin, (req, res) => {
  const team = state.teams.find((item) => item.id === req.params.teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const { name, flagUrl } = req.body || {};
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed) team.name = trimmed;
  }
  if (typeof flagUrl === 'string') {
    team.flagUrl = flagUrl.trim();
  }

  saveState();
  broadcastState();
  res.json({ ok: true, team });
});

app.post('/api/admin/teams/:teamId/adjust-cash', requireAdmin, (req, res) => {
  const team = state.teams.find((item) => item.id === req.params.teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const amount = Number(req.body && req.body.amount);
  const reason = typeof (req.body && req.body.reason) === 'string' ? req.body.reason.trim() : 'Manual adjustment';

  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero number' });
  }

  team.cash += amount;
  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'manual_adjustment',
    teamId: team.id,
    teamName: team.name,
    amount,
    note: reason
  });

  saveState();
  broadcastState();
  res.json({ ok: true, team });
});

app.delete('/api/admin/teams/:teamId', requireAdmin, (req, res) => {
  const index = state.teams.findIndex((item) => item.id === req.params.teamId);
  if (index === -1) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const [removed] = state.teams.splice(index, 1);
  state.transactions = state.transactions.filter((txn) => txn.teamId !== removed.id);

  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/admin/shapes', requireAdmin, (req, res) => {
  const { name, price, color } = req.body || {};
  const numericPrice = Number(price);
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Shape name is required' });
  }
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return res.status(400).json({ error: 'Shape price must be 0 or higher' });
  }

  const shape = {
    id: makeId('shape'),
    name: name.trim(),
    price: numericPrice,
    color: typeof color === 'string' && color.trim() ? color.trim() : '#1f6f8b'
  };

  state.shapes.push(shape);
  saveState();
  broadcastState();
  res.status(201).json({ ok: true, shape });
});

app.put('/api/admin/shapes/:shapeId', requireAdmin, (req, res) => {
  const shape = state.shapes.find((item) => item.id === req.params.shapeId);
  if (!shape) {
    return res.status(404).json({ error: 'Shape not found' });
  }

  const { name, price, color } = req.body || {};
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed) shape.name = trimmed;
  }
  if (price !== undefined) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'Shape price must be 0 or higher' });
    }
    shape.price = numericPrice;
  }
  if (typeof color === 'string' && color.trim()) {
    shape.color = color.trim();
  }

  saveState();
  broadcastState();
  res.json({ ok: true, shape });
});

app.delete('/api/admin/shapes/:shapeId', requireAdmin, (req, res) => {
  const index = state.shapes.findIndex((item) => item.id === req.params.shapeId);
  if (index === -1) {
    return res.status(404).json({ error: 'Shape not found' });
  }

  state.shapes.splice(index, 1);
  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/admin/transactions', requireAdmin, (req, res) => {
  const { teamId, shapeId, quantityAccepted, quantityRejected, note } = req.body || {};
  const accepted = Number(quantityAccepted || 0);
  const rejected = Number(quantityRejected || 0);

  const team = state.teams.find((item) => item.id === teamId);
  if (!team) {
    return res.status(400).json({ error: 'Valid teamId is required' });
  }

  const shape = state.shapes.find((item) => item.id === shapeId);
  if (!shape) {
    return res.status(400).json({ error: 'Valid shapeId is required' });
  }

  if (!Number.isFinite(accepted) || !Number.isFinite(rejected) || accepted < 0 || rejected < 0) {
    return res.status(400).json({ error: 'Quantities must be 0 or higher' });
  }

  if (accepted === 0 && rejected === 0) {
    return res.status(400).json({ error: 'At least one quantity must be greater than 0' });
  }

  const total = accepted * shape.price;
  team.cash += total;
  team.accepted += accepted;
  team.rejected += rejected;

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'sale',
    teamId: team.id,
    teamName: team.name,
    shapeId: shape.id,
    shapeName: shape.name,
    unitPrice: shape.price,
    quantityAccepted: accepted,
    quantityRejected: rejected,
    total,
    note: typeof note === 'string' ? note.trim() : ''
  });

  saveState();
  broadcastState();
  res.status(201).json({ ok: true, total, team });
});

app.post('/api/admin/buzzer', requireAdmin, (req, res) => {
  const message = typeof (req.body && req.body.message) === 'string' ? req.body.message.trim() : '';
  state.meta.paused = true;
  state.meta.buzzerCount += 1;
  state.meta.announcement = message || `Buzzer #${state.meta.buzzerCount}: Stop and listen for instructions.`;

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'buzzer',
    note: state.meta.announcement
  });

  saveState();
  broadcastState();
  res.json({ ok: true, meta: state.meta });
});

app.post('/api/admin/resume', requireAdmin, (req, res) => {
  state.meta.paused = false;
  state.meta.announcement = typeof (req.body && req.body.message) === 'string' ? req.body.message.trim() : 'Trading resumed. Continue building and selling.';

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'resume',
    note: state.meta.announcement
  });

  saveState();
  broadcastState();
  res.json({ ok: true, meta: state.meta });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const keepTeams = Boolean(req.body && req.body.keepTeams);
  const keepShapes = Boolean(req.body && req.body.keepShapes);

  const preservedTeams = keepTeams
    ? state.teams.map((team) => ({ ...team, cash: 0, accepted: 0, rejected: 0 }))
    : [];

  const preservedShapes = keepShapes ? [...state.shapes] : defaultState().shapes;

  state = {
    ...defaultState(),
    teams: preservedTeams,
    shapes: preservedShapes,
    transactions: []
  };

  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

io.on('connection', (socket) => {
  socket.emit('state:update', publicState());
  socket.emit('admin:update', adminState());
});

server.listen(PORT, () => {
  console.log(`Trading sim dashboard listening on port ${PORT}`);
});
