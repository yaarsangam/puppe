const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxZGYyMzgyY2RmZGFmNDIzYzFlZDAyMjljYzU0YmY2YiIsIm5iZiI6MTc0NTA1MTI4OC4wMDEsInN1YiI6IjY4MDM1ZTk3YjExM2ZmODcyM2Q5Yzk0NSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.IZCb8jHZ9alKmQ_KU3be_32ug_QztUqw4Y_KDPt1kYk';
const IMG = 'https://image.tmdb.org/t/p';

if (TMDB_TOKEN === 'PASTE_YOUR_TMDB_BEARER_TOKEN_HERE' || !TMDB_TOKEN.startsWith('eyJ')) {
  alert('TMDB token missing. Open app.js and paste your v4 token.');
}

const ROWS = [
  { key: 'trending',       label: '🔥 Trending Now',  url: '/trending/all/week' },
  { key: 'popular_movies', label: 'Popular Movies',   url: '/movie/popular' },
  { key: 'popular_tv',     label: 'Popular TV Shows', url: '/tv/popular' },
  { key: 'top_rated',      label: 'Top Rated',        url: '/movie/top_rated' },
  { key: 'upcoming',       label: 'New & Upcoming',   url: '/movie/upcoming' },
];

async function tmdb(path, params = '') {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.themoviedb.org/3${path}${sep}language=en-US${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

function cardHTML(item) {
  const poster = item.poster_path
    ? `${IMG}/w342${item.poster_path}`
    : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="%2316161d" width="200" height="300"/></svg>';
  const title = item.title || item.name || 'Untitled';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
  const type = item.media_type || (item.title ? 'movie' : 'tv');
  return `
    <div class="card" data-id="${item.id}" data-type="${type}" data-title="${title.replace(/"/g, '&quot;')}">
      <img class="card-poster" src="${poster}" alt="${title}" loading="lazy" />
      ${rating ? `<span class="card-rating">★ ${rating}</span>` : ''}
      <div class="card-info">
        <div class="card-title">${title}</div>
        <div class="card-year">${year}</div>
      </div>
    </div>`;
}

async function buildRows() {
  for (const row of ROWS) {
    const el = document.querySelector(`.row-section[data-row="${row.key}"]`);
    if (!el) continue;
    el.innerHTML = `
      <div class="row-title">${row.label}</div>
      <div class="row-scroll">${Array(8).fill('<div class="skeleton"></div>').join('')}</div>`;
    try {
      const data = await tmdb(row.url);
      const items = (data.results || []).slice(0, 20);
      const scroll = el.querySelector('.row-scroll');
      scroll.innerHTML = items.map(cardHTML).join('');
      attachCardHandlers(scroll);
    } catch (err) {
      el.querySelector('.row-scroll').innerHTML = `<p style="color:#e50914;padding:20px;">Failed: ${err.message}</p>`;
    }
  }
}

async function buildHero() {
  try {
    const data = await tmdb('/trending/all/week');
    const item = data.results.find((x) => x.backdrop_path) || data.results[0];
    if (!item) return;
    document.getElementById('heroBg').style.backgroundImage = `url(${IMG}/original${item.backdrop_path})`;
    const title = item.title || item.name || 'Untitled';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const type = item.media_type || (item.title ? 'movie' : 'tv');
    document.getElementById('heroContent').innerHTML = `
      <span class="hero-badge">Trending Now</span>
      <h1 class="hero-title">${title}</h1>
      <div class="hero-meta">
        <span class="rating">★ ${rating}</span><span class="dot">•</span>
        <span>${year}</span><span class="dot">•</span>
        <span>${type === 'tv' ? 'TV Series' : 'Movie'}</span>
      </div>
      <p class="hero-desc">${item.overview || ''}</p>
      <div class="hero-buttons">
        <button class="btn btn-play" onclick="openModal(${item.id}, '${type}')">▶ Play</button>
        <button class="btn btn-info" onclick="openModal(${item.id}, '${type}')">ⓘ More Info</button>
      </div>`;
  } catch (err) { console.error('Hero failed:', err); }
}

async function openModal(id, type = 'movie') {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  body.innerHTML = `<div style="padding:60px;text-align:center;color:#9a9aa6;">Loading…</div>`;

  try {
    const item = await tmdb(`/${type}/${id}`);
    const backdrop = item.backdrop_path ? `${IMG}/original${item.backdrop_path}` : '';
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';

    // ---- Season/episode picker for TV shows ----
    let episodePicker = '';
    if (type === 'tv' && item.seasons) {
      const options = item.seasons
        .filter((s) => s.season_number > 0)
        .map((s) => `<option value="${s.season_number}">Season ${s.season_number}</option>`)
        .join('');
      episodePicker = `
        <div class="modal-tv-picker" style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;">
          <label style="display:flex;flex-direction:column;font-size:12px;color:#9a9aa6;gap:4px;">
            Season
            <select id="seasonSelect" style="padding:8px 12px;background:#0b0b0f;color:#e8e8ec;border:1px solid #30363d;border-radius:6px;font-size:14px;">
              ${options}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:12px;color:#9a9aa6;gap:4px;">
            Episode
            <select id="episodeSelect" style="padding:8px 12px;background:#0b0b0f;color:#e8e8ec;border:1px solid #30363d;border-radius:6px;font-size:14px;">
              ${Array.from({ length: 30 }, (_, i) => `<option value="${i + 1}">Episode ${i + 1}</option>`).join('')}
            </select>
          </label>
        </div>`;
    }

    body.innerHTML = `
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-hero" style="background-image:url('${backdrop}')"></div>
      <div class="modal-content">
        <h2 class="modal-title">${title}</h2>
        <div class="modal-meta">
          <span style="color:#46d369;font-weight:700;">★ ${rating}</span>
          <span>${year}</span>
          ${item.runtime ? `<span>${item.runtime} min</span>` : ''}
          <span>${type === 'tv' ? 'TV Series' : 'Movie'}</span>
        </div>
        <p class="modal-overview">${item.overview || ''}</p>
        ${episodePicker}
        <div class="modal-actions">
          <button class="btn btn-play"
                  data-id="${id}"
                  data-type="${type}"
                  data-title="${title.replace(/"/g, '&quot;')}"
                  onclick="playSource(this)">▶ Play Now</button>
        </div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div style="padding:60px;text-align:center;color:#e50914;">Error: ${err.message}</div>`;
  }
}

function playSource(btn) {
  const id = btn.dataset.id;
  const type = btn.dataset.type;
  const title = btn.dataset.title || '';
  const seasonEl = document.getElementById('seasonSelect');
  const episodeEl = document.getElementById('episodeSelect');
  const season = seasonEl ? seasonEl.value : 1;
  const episode = episodeEl ? episodeEl.value : 1;

  window.location.href =
    `/player.html?id=${id}&type=${type}&title=${encodeURIComponent(title)}` +
    `&season=${season}&episode=${episode}`;
}

function closeModal() {
  document.getElementById('modal').hidden = true;
  document.getElementById('modalBody').innerHTML = '';
  document.body.style.overflow = '';
}

const searchInput = document.getElementById('searchInput');
const searchSection = document.getElementById('searchResults');
const mainContent = document.getElementById('mainContent');
const heroSection = document.getElementById('hero');
let searchTimer;

searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) {
    searchSection.hidden = true;
    mainContent.style.display = '';
    heroSection.style.display = '';
    return;
  }
  searchTimer = setTimeout(() => runSearch(q), 400);
});

async function runSearch(q) {
  searchSection.hidden = false;
  mainContent.style.display = 'none';
  heroSection.style.display = 'none';
  const grid = document.getElementById('searchGrid');
  grid.innerHTML = Array(12).fill('<div class="skeleton"></div>').join('');
  try {
    const data = await tmdb('/search/multi', `&query=${encodeURIComponent(q)}&include_adult=false`);
    const items = (data.results || []).filter((x) => x.media_type !== 'person').slice(0, 24);
    if (!items.length) {
      grid.innerHTML = `<p style="color:#9a9aa6;grid-column:1/-1;">No results for "${q}"</p>`;
      return;
    }
    grid.innerHTML = items.map(cardHTML).join('');
    attachCardHandlers(grid);
  } catch (err) {
    grid.innerHTML = `<p style="color:#e50914;grid-column:1/-1;">Search error: ${err.message}</p>`;
  }
}

function attachCardHandlers(root) {
  root.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => openModal(card.dataset.id, card.dataset.type));
  });
}

window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

(async function init() {
  await buildHero();
  await buildRows();
})();