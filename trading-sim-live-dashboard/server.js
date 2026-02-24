const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Alpha1234*';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

const ALLOWED_SHAPE_KINDS = new Set([
  'square',
  'circle',
  'equilateral_triangle',
  'isosceles_triangle',
  'semi_circle'
]);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function inferShapeKind(name = '') {
  const normalized = String(name).toLowerCase().replace(/\s+/g, '_');
  if (normalized.includes('square')) return 'square';
  if (normalized.includes('semi') && normalized.includes('circle')) return 'semi_circle';
  if (normalized.includes('equilateral')) return 'equilateral_triangle';
  if (normalized.includes('isosceles')) return 'isosceles_triangle';
  if (normalized.includes('circle')) return 'circle';
  if (normalized.includes('triangle')) return 'equilateral_triangle';
  return 'square';
}

function defaultShapes() {
  return [
    { id: makeId('shape'), name: 'Square', kind: 'square', price: 50, color: '#0b3c5d' },
    { id: makeId('shape'), name: 'Circle', kind: 'circle', price: 70, color: '#328cc1' },
    { id: makeId('shape'), name: 'Equilateral Triangle', kind: 'equilateral_triangle', price: 90, color: '#0f766e' },
    { id: makeId('shape'), name: 'Isosceles Triangle', kind: 'isosceles_triangle', price: 85, color: '#b45309' },
    { id: makeId('shape'), name: 'Semi Circle', kind: 'semi_circle', price: 65, color: '#7c3aed' }
  ];
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
      revealWinner: false,
      winnerTeamId: '',
      winnerName: '',
      updatedAt: nowIso()
    },
    shapes: defaultShapes(),
    teams: [],
    transactions: []
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeTeam(team = {}) {
  return {
    id: team.id || makeId('team'),
    name: typeof team.name === 'string' ? team.name : 'Team',
    flagUrl: typeof team.flagUrl === 'string' ? team.flagUrl : '',
    cash: Number.isFinite(Number(team.cash)) ? Number(team.cash) : 0,
    accepted: Number.isFinite(Number(team.accepted)) ? Number(team.accepted) : 0,
    rejected: Number.isFinite(Number(team.rejected)) ? Number(team.rejected) : 0,
    traded: Number.isFinite(Number(team.traded)) ? Number(team.traded) : 0
  };
}

function normalizeShape(shape = {}) {
  const kind = typeof shape.kind === 'string' && ALLOWED_SHAPE_KINDS.has(shape.kind)
    ? shape.kind
    : inferShapeKind(shape.name);

  return {
    id: shape.id || makeId('shape'),
    name: typeof shape.name === 'string' ? shape.name : 'Shape',
    kind,
    price: Number.isFinite(Number(shape.price)) ? Number(shape.price) : 0,
    color: typeof shape.color === 'string' && shape.color.trim() ? shape.color : '#1f6f8b'
  };
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
    const defaults = defaultState();
    return {
      ...defaults,
      ...parsed,
      meta: {
        ...defaults.meta,
        ...(parsed.meta || {})
      },
      teams: Array.isArray(parsed.teams) ? parsed.teams.map(normalizeTeam) : [],
      shapes: Array.isArray(parsed.shapes) ? parsed.shapes.map(normalizeShape) : defaults.shapes,
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
      if ((b.traded || 0) !== (a.traded || 0)) return (b.traded || 0) - (a.traded || 0);
      return a.name.localeCompare(b.name);
    })
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function publicState() {
  const rankedTeams = rankTeams(state.teams);
  const winner = state.meta.revealWinner && rankedTeams.length
    ? {
        id: rankedTeams[0].id,
        name: rankedTeams[0].name,
        cash: rankedTeams[0].cash,
        traded: rankedTeams[0].traded || 0
      }
    : null;

  return {
    meta: state.meta,
    shapes: state.shapes,
    teams: rankedTeams,
    winner
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
    rejected: 0,
    traded: 0
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
  const { name, price, color, kind } = req.body || {};
  const numericPrice = Number(price);
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Shape name is required' });
  }
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return res.status(400).json({ error: 'Shape price must be 0 or higher' });
  }

  const normalizedKind = typeof kind === 'string' && ALLOWED_SHAPE_KINDS.has(kind)
    ? kind
    : inferShapeKind(name);

  const shape = {
    id: makeId('shape'),
    name: name.trim(),
    kind: normalizedKind,
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

  const { name, price, color, kind } = req.body || {};
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
  if (typeof kind === 'string' && ALLOWED_SHAPE_KINDS.has(kind)) {
    shape.kind = kind;
  }
  if (!shape.kind) {
    shape.kind = inferShapeKind(shape.name);
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

  const traded = accepted + rejected;
  const total = accepted * shape.price;
  team.cash += total;
  team.accepted += accepted;
  team.rejected += rejected;
  team.traded = (team.traded || 0) + traded;

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
    quantityTraded: traded,
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

app.post('/api/admin/reveal-winner', requireAdmin, (req, res) => {
  const ranked = rankTeams(state.teams);
  if (!ranked.length) {
    return res.status(400).json({ error: 'No teams available to reveal a winner' });
  }

  const winner = ranked[0];
  state.meta.revealWinner = true;
  state.meta.winnerTeamId = winner.id;
  state.meta.winnerName = winner.name;
  state.meta.announcement = `Winner reveal: ${winner.name} with $${winner.cash.toLocaleString()}!`;

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'winner_reveal',
    teamId: winner.id,
    teamName: winner.name,
    note: state.meta.announcement
  });

  saveState();
  broadcastState();
  res.json({ ok: true, winner });
});

app.post('/api/admin/hide-winner', requireAdmin, (req, res) => {
  state.meta.revealWinner = false;
  state.meta.winnerTeamId = '';
  state.meta.winnerName = '';

  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const keepTeams = Boolean(req.body && req.body.keepTeams);
  const keepShapes = Boolean(req.body && req.body.keepShapes);

  const preservedTeams = keepTeams
    ? state.teams.map((team) => ({ ...team, cash: 0, accepted: 0, rejected: 0, traded: 0 }))
    : [];

  const preservedShapes = keepShapes ? [...state.shapes] : defaultShapes();

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
