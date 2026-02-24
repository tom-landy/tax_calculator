const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const roundLabelEl = document.getElementById('roundLabel');
const announcementEl = document.getElementById('announcement');
const shapesGridEl = document.getElementById('shapesGrid');
const leaderboardBodyEl = document.getElementById('leaderboardBody');
const teamCardsEl = document.getElementById('teamCards');
const updatedAtEl = document.getElementById('updatedAt');
const pausedOverlayEl = document.getElementById('pausedOverlay');
const openAdminBtn = document.getElementById('openAdminBtn');

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

function render(state) {
  const { meta, shapes, teams } = state;

  titleEl.textContent = meta.title || 'Trading Simulation';
  subtitleEl.textContent = meta.subtitle || '';
  roundLabelEl.textContent = meta.roundLabel || '';
  announcementEl.textContent = meta.announcement || '';
  updatedAtEl.textContent = meta.updatedAt ? `Updated ${new Date(meta.updatedAt).toLocaleTimeString()}` : '';
  pausedOverlayEl.classList.toggle('hidden', !meta.paused);

  shapesGridEl.innerHTML = '';
  shapes.forEach((shape) => {
    const card = document.createElement('article');
    card.className = 'shape-card';
    card.style.background = shape.color || '#1f6f8b';
    card.innerHTML = `
      <h3>${shape.name}</h3>
      <div class="price">${formatMoney(shape.price)}</div>
    `;
    shapesGridEl.appendChild(card);
  });

  leaderboardBodyEl.innerHTML = '';
  teams.forEach((team) => {
    const row = document.createElement('tr');
    if (team.rank === 1) row.classList.add('top-rank');
    row.innerHTML = `
      <td>#${team.rank}</td>
      <td>${team.name}</td>
      <td>${formatMoney(team.cash)}</td>
      <td>${team.accepted || 0}</td>
      <td>${team.rejected || 0}</td>
    `;
    leaderboardBodyEl.appendChild(row);
  });

  teamCardsEl.innerHTML = '';
  teams.forEach((team) => {
    const card = document.createElement('article');
    card.className = 'team-card';

    const imageSection = team.flagUrl
      ? `<img class="team-image" src="${team.flagUrl}" alt="${team.name}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');" /><div class="team-fallback hidden">${initials(team.name)}</div>`
      : `<div class="team-fallback">${initials(team.name)}</div>`;

    card.innerHTML = `
      ${imageSection}
      <h3>${team.name}</h3>
      <div class="money">${formatMoney(team.cash)}</div>
      <div>Accepted: ${team.accepted || 0} | Rejected: ${team.rejected || 0}</div>
    `;

    teamCardsEl.appendChild(card);
  });
}

async function fetchState() {
  const response = await fetch('/api/state');
  if (!response.ok) return;
  const state = await response.json();
  render(state);
}

fetchState();

const socket = io();
socket.on('state:update', render);

if (openAdminBtn) {
  openAdminBtn.addEventListener('click', async () => {
    const password = window.prompt('Enter admin password');
    if (!password) return;

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        throw new Error('Invalid password');
      }

      localStorage.setItem('trading-admin-key-temp', password);
      window.open('/admin', '_blank', 'noopener,noreferrer');
    } catch (error) {
      window.alert(error.message || 'Unable to open admin panel');
    }
  });
}
