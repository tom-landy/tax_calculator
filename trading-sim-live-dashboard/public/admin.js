const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const adminStatus = document.getElementById('adminStatus');

const metaForm = document.getElementById('metaForm');
const titleInput = document.getElementById('titleInput');
const subtitleInput = document.getElementById('subtitleInput');
const announcementInput = document.getElementById('announcementInput');
const pausedInput = document.getElementById('pausedInput');
const roundButtons = document.getElementById('roundButtons');
const activeRoundLabel = document.getElementById('activeRoundLabel');
const prevRoundBtn = document.getElementById('prevRoundBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const roundPricesForm = document.getElementById('roundPricesForm');
const rpSquare = document.getElementById('rp_square');
const rpCircle = document.getElementById('rp_circle');
const rpEquilateral = document.getElementById('rp_equilateral_triangle');
const rpIsosceles = document.getElementById('rp_isosceles_triangle');
const rpSemiCircle = document.getElementById('rp_semi_circle');

const teamForm = document.getElementById('teamForm');
const teamNameInput = document.getElementById('teamNameInput');
const teamFlagInput = document.getElementById('teamFlagInput');
const teamImportForm = document.getElementById('teamImportForm');
const teamImportFile = document.getElementById('teamImportFile');
const teamList = document.getElementById('teamList');

const shapeForm = document.getElementById('shapeForm');
const shapeKindInput = document.getElementById('shapeKindInput');
const shapeNameInput = document.getElementById('shapeNameInput');
const shapePriceInput = document.getElementById('shapePriceInput');
const shapeColorInput = document.getElementById('shapeColorInput');
const shapeList = document.getElementById('shapeList');

const transactionForm = document.getElementById('transactionForm');
const txTeamSelect = document.getElementById('txTeamSelect');
const txShapeSelect = document.getElementById('txShapeSelect');
const txAcceptedInput = document.getElementById('txAcceptedInput');
const txRejectedInput = document.getElementById('txRejectedInput');
const txNoteInput = document.getElementById('txNoteInput');

const txList = document.getElementById('txList');
const buzzerBtn = document.getElementById('buzzerBtn');
const resumeBtn = document.getElementById('resumeBtn');
const revealWinnerBtn = document.getElementById('revealWinnerBtn');
const hideWinnerBtn = document.getElementById('hideWinnerBtn');
const resetKeepBtn = document.getElementById('resetKeepBtn');
const resetAllBtn = document.getElementById('resetAllBtn');

const SHAPE_KIND_LABELS = {
  square: 'Square',
  circle: 'Circle',
  equilateral_triangle: 'Equilateral Triangle',
  isosceles_triangle: 'Isosceles Triangle',
  semi_circle: 'Semi Circle'
};

const socket = io();
let adminKey = sessionStorage.getItem('trading-admin-key') || '';
if (!adminKey) {
  const tempKey = localStorage.getItem('trading-admin-key-temp') || '';
  if (tempKey) {
    adminKey = tempKey;
    sessionStorage.setItem('trading-admin-key', adminKey);
    localStorage.removeItem('trading-admin-key-temp');
  }
}
let latestState = null;
let selectedRound = 1;

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function setStatus(message) {
  adminStatus.textContent = message;
}

function setLoggedIn(value) {
  if (value) {
    loginPanel.classList.add('hidden');
    adminPanel.classList.remove('hidden');
  } else {
    loginPanel.classList.remove('hidden');
    adminPanel.classList.add('hidden');
  }
}

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(adminKey ? { 'x-admin-key': adminKey } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (response.status === 401) {
    adminKey = '';
    sessionStorage.removeItem('trading-admin-key');
    setLoggedIn(false);
    throw new Error('Unauthorized');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function render(state) {
  latestState = state;
  titleInput.value = state.meta.title || '';
  subtitleInput.value = state.meta.subtitle || '';
  announcementInput.value = state.meta.announcement || '';
  pausedInput.checked = Boolean(state.meta.paused);
  selectedRound = Number(state.meta.currentRound || selectedRound || 1);
  activeRoundLabel.textContent = `Round ${selectedRound}`;

  const selectedRoundData = (state.rounds || []).find((round) => round.round === selectedRound);
  if (selectedRoundData) {
    rpSquare.value = selectedRoundData.prices.square ?? 0;
    rpCircle.value = selectedRoundData.prices.circle ?? 0;
    rpEquilateral.value = selectedRoundData.prices.equilateral_triangle ?? 0;
    rpIsosceles.value = selectedRoundData.prices.isosceles_triangle ?? 0;
    rpSemiCircle.value = selectedRoundData.prices.semi_circle ?? 0;
  }

  roundButtons.innerHTML = Array.from({ length: 5 }, (_, idx) => {
    const roundNum = idx + 1;
    const activeClass = roundNum === selectedRound ? 'active' : '';
    return `<button type="button" class="round-btn ${activeClass}" data-round="${roundNum}">Round ${roundNum}</button>`;
  }).join('');

  txTeamSelect.innerHTML = state.teams.map((team) => `<option value="${team.id}">${team.name}</option>`).join('');
  txShapeSelect.innerHTML = state.shapes.map((shape) => `<option value="${shape.id}">${shape.name} (${formatMoney(shape.price)})</option>`).join('');

  teamList.innerHTML = '';
  state.teams.forEach((team) => {
    const row = document.createElement('article');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="list-head">
        <strong>${team.name}</strong>
        <span>${formatMoney(team.cash)}</span>
      </div>
      <div class="list-sub">Shapes Traded: ${team.traded || 0} | Accepted: ${team.accepted || 0} | Rejected: ${team.rejected || 0}</div>
      <div class="inline-actions wrap" style="margin-top:8px;">
        <button data-action="edit-team" data-id="${team.id}" class="ghost-button">Edit</button>
        <button data-action="plus-cash" data-id="${team.id}">+ $10</button>
        <button data-action="minus-cash" data-id="${team.id}" class="ghost-button">- $10</button>
        <button data-action="delete-team" data-id="${team.id}" class="danger">Delete</button>
      </div>
    `;
    teamList.appendChild(row);
  });

  shapeList.innerHTML = '';
  state.shapes.forEach((shape) => {
    const row = document.createElement('article');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="list-head">
        <strong>${shape.name}</strong>
        <span>${formatMoney(shape.price)}</span>
      </div>
      <div class="list-sub">Type: ${SHAPE_KIND_LABELS[shape.kind] || 'Square'} | Color: ${shape.color || '#1f6f8b'}</div>
      <div class="inline-actions" style="margin-top:8px;">
        <button data-action="edit-shape" data-id="${shape.id}" class="ghost-button">Edit</button>
        <button data-action="delete-shape" data-id="${shape.id}" class="danger">Delete</button>
      </div>
    `;
    shapeList.appendChild(row);
  });

  txList.innerHTML = '';
  state.transactions.forEach((txn) => {
    const row = document.createElement('article');
    row.className = 'list-item';

    let text = '';
    if (txn.type === 'sale') {
      text = `${txn.teamName} sold ${txn.quantityAccepted} ${txn.shapeName} (rejected ${txn.quantityRejected}) for ${formatMoney(txn.total)}`;
    } else if (txn.type === 'manual_adjustment') {
      text = `${txn.teamName} adjusted by ${formatMoney(txn.amount)} (${txn.note || 'manual'})`;
    } else {
      text = txn.note || txn.type;
    }

    row.innerHTML = `
      <div class="list-head">
        <strong>${txn.type}</strong>
        <span>${new Date(txn.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="list-sub">${text}</div>
    `;
    txList.appendChild(row);
  });
}

teamList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute('data-action');
  const id = target.getAttribute('data-id');
  if (!action || !id) return;

  try {
    if (action === 'edit-team') {
      const current = latestState.teams.find((team) => team.id === id);
      if (!current) return;
      const name = window.prompt('Team name', current.name);
      if (name === null) return;
      const flagUrl = window.prompt('Image URL (optional)', current.flagUrl || '');
      if (flagUrl === null) return;
      await api(`/api/admin/teams/${id}`, 'PUT', { name, flagUrl });
      setStatus('Team updated');
    }

    if (action === 'plus-cash') {
      await api(`/api/admin/teams/${id}/adjust-cash`, 'POST', { amount: 10, reason: 'Quick adjust +10' });
      setStatus('Cash adjusted');
    }

    if (action === 'minus-cash') {
      await api(`/api/admin/teams/${id}/adjust-cash`, 'POST', { amount: -10, reason: 'Quick adjust -10' });
      setStatus('Cash adjusted');
    }

    if (action === 'delete-team') {
      if (!window.confirm('Delete this team and all related transactions?')) return;
      await api(`/api/admin/teams/${id}`, 'DELETE');
      setStatus('Team deleted');
    }
  } catch (error) {
    setStatus(error.message);
  }
});

shapeList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute('data-action');
  const id = target.getAttribute('data-id');
  if (!action || !id) return;

  try {
    if (action === 'edit-shape') {
      const current = latestState.shapes.find((shape) => shape.id === id);
      if (!current) return;
      const name = window.prompt('Shape name', current.name);
      if (name === null) return;
      const kind = window.prompt('Type (square, circle, equilateral_triangle, isosceles_triangle, semi_circle)', current.kind || 'square');
      if (kind === null) return;
      const price = window.prompt('Price', String(current.price));
      if (price === null) return;
      const color = window.prompt('Color (hex)', current.color || '#1f6f8b');
      if (color === null) return;
      await api(`/api/admin/shapes/${id}`, 'PUT', { name, kind, price: Number(price), color });
      setStatus('Shape updated');
    }

    if (action === 'delete-shape') {
      if (!window.confirm('Delete this shape?')) return;
      await api(`/api/admin/shapes/${id}`, 'DELETE');
      setStatus('Shape deleted');
    }
  } catch (error) {
    setStatus(error.message);
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  try {
    const candidate = passwordInput.value.trim();
    await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: candidate })
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid password');
      }
    });

    adminKey = candidate;
    sessionStorage.setItem('trading-admin-key', adminKey);
    setLoggedIn(true);
    await refreshAdminState();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

logoutBtn.addEventListener('click', () => {
  adminKey = '';
  sessionStorage.removeItem('trading-admin-key');
  setLoggedIn(false);
});

metaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/meta', 'PUT', {
      title: titleInput.value,
      subtitle: subtitleInput.value,
      announcement: announcementInput.value,
      paused: pausedInput.checked
    });
    setStatus('Settings saved');
  } catch (error) {
    setStatus(error.message);
  }
});

roundButtons.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const roundAttr = target.getAttribute('data-round');
  if (!roundAttr) return;
  const roundNumber = Number(roundAttr);
  if (!Number.isFinite(roundNumber)) return;

  try {
    await api(`/api/admin/rounds/${roundNumber}/activate`, 'POST');
    selectedRound = roundNumber;
    setStatus(`Switched to Round ${roundNumber}`);
  } catch (error) {
    setStatus(error.message);
  }
});

prevRoundBtn.addEventListener('click', async () => {
  const nextRound = Math.max(1, selectedRound - 1);
  if (nextRound === selectedRound) return;
  try {
    await api(`/api/admin/rounds/${nextRound}/activate`, 'POST');
    selectedRound = nextRound;
    setStatus(`Switched to Round ${nextRound}`);
  } catch (error) {
    setStatus(error.message);
  }
});

nextRoundBtn.addEventListener('click', async () => {
  const nextRound = Math.min(5, selectedRound + 1);
  if (nextRound === selectedRound) return;
  try {
    await api(`/api/admin/rounds/${nextRound}/activate`, 'POST');
    selectedRound = nextRound;
    setStatus(`Switched to Round ${nextRound}`);
  } catch (error) {
    setStatus(error.message);
  }
});

roundPricesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api(`/api/admin/rounds/${selectedRound}/prices`, 'PUT', {
      prices: {
        square: Number(rpSquare.value),
        circle: Number(rpCircle.value),
        equilateral_triangle: Number(rpEquilateral.value),
        isosceles_triangle: Number(rpIsosceles.value),
        semi_circle: Number(rpSemiCircle.value)
      }
    });
    setStatus(`Saved prices for Round ${selectedRound}`);
  } catch (error) {
    setStatus(error.message);
  }
});

teamForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/teams', 'POST', {
      name: teamNameInput.value,
      flagUrl: teamFlagInput.value
    });
    teamNameInput.value = '';
    teamFlagInput.value = '';
    setStatus('Team added');
  } catch (error) {
    setStatus(error.message);
  }
});

teamImportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const file = teamImportFile.files && teamImportFile.files[0];
    if (!file) {
      setStatus('Select a CSV or spreadsheet file first');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/admin/teams/import', {
      method: 'POST',
      headers: { ...(adminKey ? { 'x-admin-key': adminKey } : {}) },
      body: formData
    });

    if (response.status === 401) {
      adminKey = '';
      sessionStorage.removeItem('trading-admin-key');
      setLoggedIn(false);
      throw new Error('Unauthorized');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Import failed');

    teamImportForm.reset();
    setStatus(`Imported ${data.imported} teams${data.skipped ? ` (${data.skipped} skipped)` : ''}`);
  } catch (error) {
    setStatus(error.message);
  }
});

shapeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/shapes', 'POST', {
      kind: shapeKindInput.value,
      name: shapeNameInput.value,
      price: Number(shapePriceInput.value),
      color: shapeColorInput.value
    });
    shapeNameInput.value = '';
    shapePriceInput.value = '';
    shapeKindInput.value = 'square';
    setStatus('Shape added');
  } catch (error) {
    setStatus(error.message);
  }
});

transactionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/transactions', 'POST', {
      teamId: txTeamSelect.value,
      shapeId: txShapeSelect.value,
      quantityAccepted: Number(txAcceptedInput.value),
      quantityRejected: Number(txRejectedInput.value),
      note: txNoteInput.value
    });
    txAcceptedInput.value = '1';
    txRejectedInput.value = '0';
    txNoteInput.value = '';
    setStatus('Sale recorded');
  } catch (error) {
    setStatus(error.message);
  }
});

buzzerBtn.addEventListener('click', async () => {
  try {
    const message = window.prompt('Optional buzzer message', 'Buzzer: stop immediately and listen for instructions.');
    if (message === null) return;
    await api('/api/admin/buzzer', 'POST', { message });
    setStatus('Buzzer activated');
  } catch (error) {
    setStatus(error.message);
  }
});

resumeBtn.addEventListener('click', async () => {
  try {
    const message = window.prompt('Resume message', 'Trading resumed. Continue working.');
    if (message === null) return;
    await api('/api/admin/resume', 'POST', { message });
    setStatus('Trading resumed');
  } catch (error) {
    setStatus(error.message);
  }
});

revealWinnerBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/reveal-winner', 'POST');
    setStatus('Winner reveal is now live');
  } catch (error) {
    setStatus(error.message);
  }
});

hideWinnerBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/hide-winner', 'POST');
    setStatus('Winner reveal hidden');
  } catch (error) {
    setStatus(error.message);
  }
});

resetKeepBtn.addEventListener('click', async () => {
  if (!window.confirm('Reset all scores and history but keep teams and shapes?')) return;
  try {
    await api('/api/admin/reset', 'POST', { keepTeams: true, keepShapes: true });
    setStatus('Scores reset');
  } catch (error) {
    setStatus(error.message);
  }
});

resetAllBtn.addEventListener('click', async () => {
  if (!window.confirm('Reset EVERYTHING? This clears teams, scores, and history.')) return;
  try {
    await api('/api/admin/reset', 'POST', { keepTeams: false, keepShapes: false });
    setStatus('Everything reset');
  } catch (error) {
    setStatus(error.message);
  }
});

async function refreshAdminState() {
  const data = await api('/api/admin/state');
  render(data);
}

socket.on('admin:update', (state) => {
  if (adminKey) render(state);
});

if (adminKey) {
  setLoggedIn(true);
  refreshAdminState().catch(() => setLoggedIn(false));
} else {
  setLoggedIn(false);
}
