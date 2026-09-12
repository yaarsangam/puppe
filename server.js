const express = require('express');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.6099.230 Safari/537.36';

const HEADLESS = process.env.HEADLESS !== 'false';
const VIDSRC_HOST = process.env.VIDSRC_HOST || 'rozgarlelo.modiplay.xyz';
const TMDB_TOKEN = process.env.TMDB_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxZGYyMzgyY2RmZGFmNDIzYzFlZDAyMjljYzU0YmY2YiIsIm5iZiI6MTc0NTA1MTI4OC4wMDEsInN1YiI6IjY4MDM1ZTk3YjExM2ZmODcyM2Q5Yzk0NSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.IZCb8jHZ9alKmQ_KU3be_32ug_QztUqw4Y_KDPt1kYk';

// ==================================================================
// WEBSHARE RESIDENTIAL PROXY CONFIG
// ==================================================================
const PROXY_HOST = process.env.PROXY_HOST || '31.59.20.176';
const PROXY_PORT = process.env.PROXY_PORT || '6754';
const PROXY_USER = process.env.PROXY_USER || 'nhbeoqgw';
const PROXY_PASS = process.env.PROXY_PASS || 'fcjehe5riyuw';

let proxyAgent = null;
if (PROXY_HOST && PROXY_USER && PROXY_PASS) {
  const proxyUrl =
    `http://${encodeURIComponent(PROXY_USER)}:${encodeURIComponent(PROXY_PASS)}` +
    `@${PROXY_HOST}:${PROXY_PORT}`;
  proxyAgent = new HttpsProxyAgent(proxyUrl);
  console.log('[proxy] 🌐 Residential proxy enabled:', PROXY_HOST + ':' + PROXY_PORT);
} else {
  console.log('[proxy] ⚠️  No residential proxy configured — using direct connection');
}

// Cache successful extractions for 30 min
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

// Server-side cookie store keyed by a short session id
const cookieStore = new Map();
const COOKIE_TTL = 30 * 60 * 1000;

// ------------------------------------------------------------------
// TMDB ID → IMDB ID
// ------------------------------------------------------------------
async function tmdbToImdb(tmdbId, type) {
  const endpoint = type === 'tv' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/external_ids`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  });
  if (!res.ok) throw new Error(`TMDB external_ids failed: ${res.status}`);
  const data = await res.json();
  if (!data.imdb_id) throw new Error('No IMDB ID found for this title');
  return data.imdb_id;
}

// ------------------------------------------------------------------
// Language guess from subtitle URL
// ------------------------------------------------------------------
function extractLangFromUrl(url) {
  const m = url.toLowerCase().match(/\/([a-z]{2,3})[./_]/);
  if (m) {
    const map = {
      en: 'English', eng: 'English',
      es: 'Spanish', spa: 'Spanish',
      fr: 'French', fra: 'French', fre: 'French',
      de: 'German', deu: 'German', ger: 'German',
      it: 'Italian', ita: 'Italian',
      pt: 'Portuguese', por: 'Portuguese',
      ru: 'Russian', rus: 'Russian',
      ar: 'Arabic', ara: 'Arabic',
      hi: 'Hindi', hin: 'Hindi',
      ja: 'Japanese', jpn: 'Japanese',
      ko: 'Korean', kor: 'Korean',
      zh: 'Chinese', chi: 'Chinese',
    };
    return map[m[1]] || m[1].toUpperCase();
  }
  return null;
}

// ------------------------------------------------------------------
// Derive the correct CDN referer from a proxied stream URL
// ------------------------------------------------------------------
function deriveReferer(streamUrl, fallback) {
  try {
    const u = new URL(streamUrl);
    const ebd = u.searchParams.get('ebd');
    const ref = u.searchParams.get('ref');
    if (ebd) return ebd.endsWith('/') ? ebd : ebd + '/';
    if (ref) return ref;
  } catch (_) {}
  return fallback;
}

// ------------------------------------------------------------------
// Filter cookies by target host (matches exact + parent domains)
// ------------------------------------------------------------------
function cookiesForHost(cookiesArr, host) {
  if (!cookiesArr || !cookiesArr.length || !host) return '';
  const matched = cookiesArr.filter((c) => {
    const d = (c.domain || '').replace(/^\./, '');
    if (!d) return false;
    return host === d || host.endsWith('.' + d);
  });
  return matched.map((c) => `${c.name}=${c.value}`).join('; ');
}

// ------------------------------------------------------------------
// POST /api/extract
// ------------------------------------------------------------------
app.post('/api/extract', async (req, res) => {
  const { tmdbId, type = 'movie', season = 1, episode = 1 } = req.body;
  if (!tmdbId) return res.status(400).json({ error: 'tmdbId is required' });

  console.log('\n======================================================');
  console.log('[extract] TMDB ID:', tmdbId, '| type:', type);
  console.log('======================================================');

  const key = `${type}-${tmdbId}-${season}-${episode}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    console.log('[extract] 💾 cache hit');
    return res.json(hit);
  }

  let browser;
  try {
    console.log('[extract] Converting TMDB → IMDB...');
    const imdbId = await tmdbToImdb(tmdbId, type);
    console.log('[extract] ✅ IMDB ID:', imdbId);

    const embedUrl =
      type === 'tv'
        ? `https://${VIDSRC_HOST}/embed/tv/${imdbId}/${season}/${episode}`
        : `https://${VIDSRC_HOST}/embed/tmdb/movie?id=${imdbId}`;

    console.log('[extract] ▶ Loading:', embedUrl);

    browser = await puppeteer.launch({
      headless: HEADLESS ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,720',
        '--disable-gpu',
      ],
      defaultViewport: { width: 1280, height: 720 },
    });
    console.log('[extract] ✅ Chromium launched');

    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setBypassServiceWorker(true);

    let streamUrl = null;
    let referer = `https://${VIDSRC_HOST}/`;
    const subtitleUrls = [];
    const seen = new Set();

    page.on('request', (request) => {
      const url = request.url();

      if (
        url.includes('.m3u8') ||
        url.includes('playlist') ||
        url.includes('.mp4') ||
        url.includes('master')
      ) {
        if (!seen.has(url)) {
          seen.add(url);
          console.log('[net]', url);
        }
      }

      if (
        (url.includes('.vtt') || url.includes('.srt') || url.includes('subtitle')) &&
        !subtitleUrls.includes(url)
      ) {
        subtitleUrls.push(url);
        console.log('[subtitle] 🎬 Found:', url);
      }

      if (!streamUrl && (url.includes('.m3u8') || url.includes('playlist'))) {
        streamUrl = url;
        const headers = request.headers();
        referer = deriveReferer(url, headers.referer || referer);
        console.log('[extract] 🎯 FOUND STREAM:', url);
        console.log('[extract] 🎯 REFERER:', referer);
      }
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) {
        console.log('[page]', msg.type(), text);
      }
    });

    page.on('pageerror', (err) => console.log('[page error]', err.message));

    page.on('response', (resp) => {
      if (resp.status() >= 400) {
        console.log('[http]', resp.status(), resp.url());
      }
    });

    console.log('[extract] Navigating to embed page...');
    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('[extract] ✅ Page loaded');

    const title = await page.title();
    const bodySnippet = await page.evaluate(() =>
      (document.body?.innerText || '').slice(0, 300).replace(/\s+/g, ' ')
    );
    console.log('[extract] Title:', title);
    console.log('[extract] Body:', bodySnippet);

    await new Promise((r) => setTimeout(r, 3000));
    await tryClickPlayer(page);

    const start = Date.now();
    let tick = 0;
    while (!streamUrl && Date.now() - start < 40000) {
      await new Promise((r) => setTimeout(r, 500));
      tick++;
      if (tick % 8 === 0) {
        console.log(`[extract] ⏳ ${Math.round((Date.now() - start) / 1000)}s`);
      }
    }

    // ── Grab ALL cookies the browser session collected ─────────
    let allCookies = [];
    try {
      const cdp = await page.target().createCDPSession();
      const result = await cdp.send('Network.getAllCookies');
      allCookies = result.cookies || [];
      await cdp.detach();
      console.log('[extract] 🍪 Captured cookies:', allCookies.length);
    } catch (e) {
      console.log('[extract] ⚠️ Cookie capture failed:', e.message);
    }

    await browser.close();

    if (!streamUrl) {
      console.log('[extract] ❌ No m3u8 found — falling back to iframe');
      return res.json({ embed: embedUrl, mode: 'iframe' });
    }

    // Build subtitle list
    const subtitles = [...new Set(subtitleUrls)].map((url) => ({
      url,
      lang: extractLangFromUrl(url) || 'en',
      label: extractLangFromUrl(url) || 'Subtitle',
      referer,
    }));

    // ── Store cookies server-side under a short id ────────────
    const ckId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    cookieStore.set(ckId, { cookies: allCookies, ts: Date.now() });
    // Cleanup expired
    for (const [k, v] of cookieStore) {
      if (Date.now() - v.ts > COOKIE_TTL) cookieStore.delete(k);
    }

    const payload = {
      stream: streamUrl,
      referer,
      subtitles,
      cookies: ckId,
      mode: 'extract',
    };

    cache.set(key, { ...payload, ts: Date.now() });

    console.log('[extract] ✅ Stream captured');
    console.log('[extract] ✅ Subtitles:', subtitles.length);
    res.json(payload);
  } catch (err) {
    console.error('[extract] ❌ FATAL:', err.message);
    if (browser) try { await browser.close(); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// tryClickPlayer
// ------------------------------------------------------------------
async function tryClickPlayer(page) {
  console.log('[click] Trying to click server/play buttons...');
  try {
    const clickedMain = await page.evaluate(() => {
      const selectors = [
        '.server', 'button[data-id]', 'a[data-id]',
        '[class*="server"]', '[class*="Server"]',
        '.btn', 'button', '[class*="play"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && typeof el.click === 'function') { el.click(); return sel; }
      }
      return null;
    });
    console.log('[click] Main page clicked:', clickedMain);

    const frames = page.frames();
    console.log('[click] Frames found:', frames.length);
    for (let i = 0; i < frames.length; i++) {
      try {
        const res = await frames[i].evaluate(() => {
          const b = document.querySelector('button, .play, [class*="play"], [class*="server"]');
          if (b && typeof b.click === 'function') { b.click(); return true; }
          return false;
        });
        if (res) console.log(`[click] Clicked inside frame #${i}`);
      } catch (_) {}
    }
  } catch (err) {
    console.log('[click] Error:', err.message);
  }
}

// ------------------------------------------------------------------
// GET /api/proxy  (routes through Webshare when configured)
// ------------------------------------------------------------------
app.get('/api/proxy', async (req, res) => {
  const target = req.query.url;
  const referer = req.query.referer || `https://${VIDSRC_HOST}/`;
  const ckId = req.query.ck || '';
  if (!target) return res.status(400).send('url query param required');

  let tgtHost = '';
  try { tgtHost = new URL(target).host; } catch (_) {}

  // ── Referer selection ───────────────────────────────────────
  // For URLs on the source host (modiplay etc.), use the source root.
  // For everything else (CDNs), use the derived referer.
  let effectiveReferer = referer;
  if (tgtHost === VIDSRC_HOST) {
    effectiveReferer = `https://${VIDSRC_HOST}/`;
  }

  // ── Build headers ───────────────────────────────────────────
  const headers = {
    Referer: effectiveReferer,
    'User-Agent': UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Same-origin Origin only
  try {
    const refOrigin = new URL(effectiveReferer).origin;
    const tgtOrigin = new URL(target).origin;
    if (refOrigin === tgtOrigin) headers.Origin = refOrigin;
  } catch (_) {}

  // ── Attach cookies for the target host ──────────────────────
  if (ckId) {
    const entry = cookieStore.get(ckId);
    if (entry) {
      const cookieHeader = cookiesForHost(entry.cookies, tgtHost);
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
        console.log(`[proxy] 🍪 Sending ${cookieHeader.length} bytes of cookies to ${tgtHost}`);
      }
    }
  }

  // ── Decide whether to route through the residential proxy ───
  // Rule: use the proxy for anything that is NOT the source host itself.
  // (Source host = modiplay; it accepts datacenter IPs fine.)
  // Set FORCE_PROXY=true to route EVERYTHING through the proxy.
  const FORCE_PROXY = process.env.FORCE_PROXY === 'true';
  const useProxy = proxyAgent && (FORCE_PROXY || tgtHost !== VIDSRC_HOST);

  try {
    const fetchOpts = { headers };
    if (useProxy) fetchOpts.agent = proxyAgent;

    const upstream = await fetch(target, fetchOpts);

    if (!upstream.ok) {
      console.log(
        '[proxy] Upstream error:', upstream.status, target.slice(0, 120),
        useProxy ? '(via proxy)' : '(direct)'
      );
      return res.status(upstream.status).send(`Upstream ${upstream.status}`);
    }

    const isPlaylist = target.includes('.m3u8') || target.includes('playlist');
    const isVtt = target.includes('.vtt') || target.includes('.srt') || target.includes('subtitle');

    if (isPlaylist) {
      const text = await upstream.text();
      const base = new URL(target);
      const ckParam = ckId ? `&ck=${encodeURIComponent(ckId)}` : '';
      const rewritten = text.split('\n').map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
          const absolute = new URL(trimmed, base).toString();
          return `/api/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(referer)}${ckParam}`;
        } catch (_) { return line; }
      }).join('\n');

      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set(
      'Content-Type',
      isVtt
        ? 'text/vtt; charset=utf-8'
        : (upstream.headers.get('content-type') || 'application/octet-stream')
    );
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error('[proxy] Error:', err.message, useProxy ? '(via proxy)' : '(direct)');
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('======================================================');
  console.log(`  ✅ Server running at http://0.0.0.0:${PORT}`);
  console.log('  Host      :', VIDSRC_HOST);
  console.log('  Headless  :', HEADLESS);
  console.log('  TMDB token:', TMDB_TOKEN.startsWith('eyJ') ? 'set ✅' : 'MISSING ❌');
  console.log('  Proxy     :', proxyAgent ? `${PROXY_HOST}:${PROXY_PORT} ✅` : 'not configured');
  console.log('======================================================');
  console.log('');
});
