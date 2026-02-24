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
const winnerRevealEl = document.getElementById('winnerReveal');
const winnerTextEl = document.getElementById('winnerText');

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

function shapeKey(shape) {
  if (shape.kind) return shape.kind;
  const n = (shape.name || '').toLowerCase();
  if (n.includes('square')) return 'square';
  if (n.includes('semi') && n.includes('circle')) return 'semi_circle';
  if (n.includes('equilateral')) return 'equilateral_triangle';
  if (n.includes('isosceles')) return 'isosceles_triangle';
  if (n.includes('circle')) return 'circle';
  if (n.includes('triangle')) return 'equilateral_triangle';
  return 'square';
}

function shapeSvg(shape) {
  const key = shapeKey(shape);
  const stroke = 'rgba(255,255,255,0.95)';

  if (key === 'circle') {
    return `<svg viewBox="0 0 120 80" class="shape-svg"><circle cx="60" cy="40" r="24" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  if (key === 'equilateral_triangle') {
    return `<svg viewBox="0 0 120 80" class="shape-svg"><polygon points="60,14 95,66 25,66" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  if (key === 'isosceles_triangle') {
    return `<svg viewBox="0 0 120 80" class="shape-svg"><polygon points="60,12 102,66 18,66" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  if (key === 'semi_circle') {
    return `<svg viewBox="0 0 120 80" class="shape-svg"><path d="M24,60 A36,36 0 0 1 96,60" fill="none" stroke="${stroke}" stroke-width="6"/><line x1="24" y1="60" x2="96" y2="60" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  return `<svg viewBox="0 0 120 80" class="shape-svg"><rect x="30" y="18" width="60" height="44" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
}

function render(state) {
  const { meta, shapes, teams, winner } = state;

  titleEl.textContent = meta.title || 'Trading Simulation';
  subtitleEl.textContent = meta.subtitle || '';
  roundLabelEl.textContent = meta.roundLabel || '';
  announcementEl.textContent = meta.announcement || '';
  updatedAtEl.textContent = meta.updatedAt ? `Updated ${new Date(meta.updatedAt).toLocaleTimeString()}` : '';
  pausedOverlayEl.classList.toggle('hidden', !meta.paused);

  if (meta.revealWinner && winner) {
    winnerRevealEl.classList.remove('hidden');
    winnerTextEl.textContent = `${winner.name} wins with ${formatMoney(winner.cash)} and ${winner.traded || 0} shapes traded.`;
  } else {
    winnerRevealEl.classList.add('hidden');
    winnerTextEl.textContent = '';
  }

  shapesGridEl.innerHTML = '';
  shapes.forEach((shape) => {
    const card = document.createElement('article');
    card.className = 'shape-card';
    card.style.background = shape.color || '#1f6f8b';
    card.innerHTML = `
      <div class="shape-art">${shapeSvg(shape)}</div>
      <h3>${shape.name}</h3>
      <div class="price">${formatMoney(shape.price)}</div>
    `;
    shapesGridEl.appendChild(card);
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
      <div>Shapes Traded: ${team.traded || 0}</div>
      <div>Accepted: ${team.accepted || 0} | Rejected: ${team.rejected || 0}</div>
    `;

    teamCardsEl.appendChild(card);
  });

  leaderboardBodyEl.innerHTML = '';
  teams.forEach((team) => {
    const row = document.createElement('tr');
    if (team.rank === 1) row.classList.add('top-rank');
    row.innerHTML = `
      <td>#${team.rank}</td>
      <td>${team.name}</td>
      <td>${formatMoney(team.cash)}</td>
      <td>${team.traded || 0}</td>
      <td>${team.accepted || 0}</td>
      <td>${team.rejected || 0}</td>
    `;
    leaderboardBodyEl.appendChild(row);
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
