document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------
  // URL params
  // ------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const type = params.get('type') || 'movie';
  const title = params.get('title') || 'Untitled';
  const season = params.get('season') || 1;
  const episode = params.get('episode') || 1;

  // ------------------------------------------------------------------
  // Element refs
  // ------------------------------------------------------------------
  const playerEl     = document.getElementById('nfPlayer');
  const video        = document.getElementById('video');
  const ui           = document.getElementById('nfUI');
  const loading      = document.getElementById('nfLoading');
  const statusText   = document.getElementById('statusText');
  const titleEl      = document.getElementById('nfTitle');
  const backBtn      = document.getElementById('nfBack');
  const centerBtn    = document.getElementById('nfCenterBtn');
  const playBtn      = document.getElementById('nfPlayBtn');
  const back10Btn    = document.getElementById('nfBack10');
  const fwd10Btn     = document.getElementById('nfFwd10');
  const muteBtn      = document.getElementById('nfMuteBtn');
  const volumeSlider = document.getElementById('nfVolume');
  const ccBtn        = document.getElementById('nfCcBtn');
  const qualityBtn   = document.getElementById('nfQualityBtn');
  const fullscreenBtn= document.getElementById('nfFullscreenBtn');
  const progressEl   = document.getElementById('nfProgress');
  const bufferEl     = document.getElementById('nfBuffer');
  const playedEl     = document.getElementById('nfPlayed');
  const thumbEl      = document.getElementById('nfThumb');
  const timeLeftEl   = document.getElementById('nfTimeLeft');
  const timeRightEl  = document.getElementById('nfTimeRight');
  const qualityPopup = document.getElementById('nfQualityPopup');
  const qualityList  = document.getElementById('nfQualityList');
  const ccPopup      = document.getElementById('nfCcPopup');
  const ccList       = document.getElementById('nfCcList');

  if (!video || !ui) return;

  titleEl.textContent = title;
  document.title = title;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  let hls = null;
  let hideUITimer = null;
  let isDragging = false;
  let wasPlayingBeforeDrag = false;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function formatTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0)
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function showUI() {
    ui.classList.remove('hidden');
    resetHideTimer();
  }

  function resetHideTimer() {
    clearTimeout(hideUITimer);
    if (video.paused) return;
    hideUITimer = setTimeout(() => {
      if (!isDragging && qualityPopup.hidden && ccPopup.hidden) {
        ui.classList.add('hidden');
      }
    }, 3000);
  }

  function showCenterPulse() {
    centerBtn.classList.remove('visible');
    void centerBtn.offsetWidth;
    centerBtn.classList.add('visible');
    setTimeout(() => centerBtn.classList.remove('visible'), 600);
  }

  function updatePlayIcons() {
    const isPaused = video.paused;
    const playSvg  = '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
    const pauseSvg = '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    playBtn.innerHTML = isPaused ? playSvg : pauseSvg;

    const bigPlay  = '<svg viewBox="0 0 24 24" width="72" height="72"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
    const bigPause = '<svg viewBox="0 0 24 24" width="72" height="72"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    centerBtn.innerHTML = isPaused ? bigPlay : bigPause;
  }

  function updateMuteIcon() {
    const muted = video.muted || video.volume === 0;
    muteBtn.innerHTML = muted
      ? '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  }

  function updateFullscreenIcon() {
    const isFs = document.fullscreenElement === playerEl;
    fullscreenBtn.innerHTML = isFs
      ? '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
  }

  // ------------------------------------------------------------------
  // Progress bar
  // ------------------------------------------------------------------
  function updateProgress() {
    const dur = video.duration;
    if (!isFinite(dur) || dur === 0) {
      playedEl.style.width = '0%';
      return;
    }
    const pct = (video.currentTime / dur) * 100;
    playedEl.style.width = pct + '%';
    thumbEl.style.left = pct + '%';

    timeLeftEl.textContent = formatTime(video.currentTime);
    timeRightEl.textContent = '-' + formatTime(dur - video.currentTime);

    if (video.buffered.length) {
      const end = video.buffered.end(video.buffered.length - 1);
      bufferEl.style.width = (end / dur) * 100 + '%';
    }
  }

  function seekFromMouseEvent(e) {
    const rect = progressEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = video.duration;
    if (isFinite(dur)) {
      video.currentTime = ratio * dur;
      updateProgress();
    }
  }

  progressEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    progressEl.classList.add('dragging');
    wasPlayingBeforeDrag = !video.paused;
    video.pause();
    seekFromMouseEvent(e);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  });

  function onDragMove(e) {
    if (!isDragging) return;
    seekFromMouseEvent(e);
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    progressEl.classList.remove('dragging');
    seekFromMouseEvent(e);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    if (wasPlayingBeforeDrag) video.play().catch(() => {});
    resetHideTimer();
  }

  // ------------------------------------------------------------------
  // Play / Pause / Seek / Volume / Fullscreen
  // ------------------------------------------------------------------
  function togglePlay() {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function skip(sec) {
    if (!isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + sec));
    showCenterPulse();
  }

  playBtn.addEventListener('click', () => { togglePlay(); showCenterPulse(); });
  centerBtn.addEventListener('click', () => { togglePlay(); showCenterPulse(); });
  back10Btn.addEventListener('click', () => skip(-10));
  fwd10Btn.addEventListener('click', () => skip(10));

  video.addEventListener('play', () => { updatePlayIcons(); resetHideTimer(); });
  video.addEventListener('pause', () => { updatePlayIcons(); showUI(); clearTimeout(hideUITimer); });
  video.addEventListener('timeupdate', updateProgress);
  video.addEventListener('progress', updateProgress);

  volumeSlider.addEventListener('input', () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = video.volume === 0;
    updateMuteIcon();
  });

  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 1;
      volumeSlider.value = 1;
    }
    updateMuteIcon();
  });

  video.addEventListener('volumechange', () => {
    volumeSlider.value = video.muted ? 0 : video.volume;
    updateMuteIcon();
  });

  function toggleFullscreen() {
    if (document.fullscreenElement === playerEl) {
      document.exitFullscreen();
    } else {
      playerEl.requestFullscreen().catch(() => {});
    }
  }
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenIcon);

  backBtn.addEventListener('click', () => window.history.back());

  // ------------------------------------------------------------------
  // Click on video
  // ------------------------------------------------------------------
  video.addEventListener('click', () => {
    if (ui.classList.contains('hidden')) {
      showUI();
    } else {
      togglePlay();
      showCenterPulse();
    }
  });

  video.addEventListener('dblclick', toggleFullscreen);

  playerEl.addEventListener('mousemove', showUI);
  playerEl.addEventListener('touchstart', showUI, { passive: true });

  // ------------------------------------------------------------------
  // Keyboard shortcuts
  // ------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault(); togglePlay(); showCenterPulse(); break;
      case 'ArrowLeft':   skip(-10); break;
      case 'ArrowRight':  skip(10);  break;
      case 'ArrowUp':
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        video.muted = false;
        break;
      case 'ArrowDown':
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        break;
      case 'm': case 'M':
        video.muted = !video.muted;
        break;
      case 'f': case 'F':
        toggleFullscreen(); break;
      case 'Escape':
        if (qualityPopup.hidden === false) qualityPopup.hidden = true;
        if (ccPopup.hidden === false) ccPopup.hidden = true;
        break;
    }
    showUI();
  });

  // ------------------------------------------------------------------
  // Popups
  // ------------------------------------------------------------------
  qualityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ccPopup.hidden = true;
    qualityPopup.hidden = !qualityPopup.hidden;
    showUI();
  });

  ccBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    qualityPopup.hidden = true;
    ccPopup.hidden = !ccPopup.hidden;
    showUI();
  });

  document.addEventListener('click', (e) => {
    if (!qualityPopup.hidden && !qualityPopup.contains(e.target) && e.target !== qualityBtn) {
      qualityPopup.hidden = true;
    }
    if (!ccPopup.hidden && !ccPopup.contains(e.target) && e.target !== ccBtn) {
      ccPopup.hidden = true;
    }
  });

  // ------------------------------------------------------------------
  // QUALITY MENU — shows ALL levels the server provides
  // ------------------------------------------------------------------
  function buildQualityMenu(levels) {
    qualityList.innerHTML = '';

    // --- Auto entry ---
    const auto = document.createElement('div');
    auto.className = 'nf-popup-item' + (hls.currentLevel === -1 ? ' active' : '');
    auto.textContent = 'Auto';
    auto.addEventListener('click', () => {
      hls.currentLevel = -1;
      qualityBtn.textContent = 'Auto';
      buildQualityMenu(hls.levels);
      qualityPopup.hidden = true;
      resetHideTimer();
    });
    qualityList.appendChild(auto);

    // --- Every level from the server, sorted highest → lowest ---
    const sorted = levels
      .map((lvl, idx) => ({ lvl, idx }))
      .sort((a, b) => (b.lvl.height || b.lvl.bitrate || 0) - (a.lvl.height || a.lvl.bitrate || 0));

    sorted.forEach(({ lvl, idx }) => {
      const item = document.createElement('div');
      item.className = 'nf-popup-item' + (hls.currentLevel === idx ? ' active' : '');

      let label;
      if (lvl.height) {
        label = `${lvl.height}p`;
        if (lvl.frameRate && lvl.frameRate > 30) label += ' (60fps)';
      } else if (lvl.bitrate) {
        label = `${Math.round(lvl.bitrate / 1000)} kbps`;
      } else {
        label = `Level ${idx + 1}`;
      }

      item.textContent = label;

      item.addEventListener('click', () => {
        hls.currentLevel = idx;
        qualityBtn.textContent = lvl.height ? `${lvl.height}p` : 'HD';
        buildQualityMenu(hls.levels);
        qualityPopup.hidden = true;
        resetHideTimer();
      });

      qualityList.appendChild(item);
    });

    // --- Debug info footer ---
    const info = document.createElement('div');
    info.className = 'nf-popup-item';
    info.style.fontSize = '11px';
    info.style.opacity = '0.5';
    info.style.cursor = 'default';
    info.style.justifyContent = 'center';
    info.textContent = `${levels.length} levels from server`;
    qualityList.appendChild(info);
  }

  // ------------------------------------------------------------------
  // Subtitle menu
  // ------------------------------------------------------------------
  function buildCcMenu(tracks) {
    ccList.innerHTML = '';

    const off = document.createElement('div');
    off.className = 'nf-popup-item' +
      (tracks.length === 0 || !tracks.some((t) => t.mode === 'showing') ? ' active' : '');
    off.textContent = 'Off';
    off.addEventListener('click', () => {
      for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'hidden';
      ccBtn.classList.remove('active');
      buildCcMenu(tracks);
      ccPopup.hidden = true;
    });
    ccList.appendChild(off);

    tracks.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = 'nf-popup-item' + (t.mode === 'showing' ? ' active' : '');
      item.textContent = t.label || t.language || `Track ${i + 1}`;
      item.addEventListener('click', () => {
        for (let j = 0; j < video.textTracks.length; j++) {
          video.textTracks[j].mode = 'hidden';
        }
        t.mode = 'showing';
        ccBtn.classList.add('active');
        buildCcMenu(tracks);
        ccPopup.hidden = true;
      });
      ccList.appendChild(item);
    });
  }

  function attachSubtitles(subtitles, referer) {
    if (!subtitles || !subtitles.length) {
      ccBtn.style.display = 'none';
      return;
    }

    subtitles.forEach((sub, i) => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = sub.label || `Subtitle ${i + 1}`;
      track.srclang = (sub.lang || 'en').slice(0, 2).toLowerCase();
      track.src =
        `/api/proxy?url=${encodeURIComponent(sub.url)}` +
        `&referer=${encodeURIComponent(sub.referer || referer || '')}`;
      video.appendChild(track);
    });

    setTimeout(() => {
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].language.startsWith('en')) {
          tracks[i].mode = 'showing';
          ccBtn.classList.add('active');
          break;
        }
      }
      ccBtn.style.display = '';
    }, 250);
  }

  // ------------------------------------------------------------------
  // Extraction + playback
  // ------------------------------------------------------------------
  function setStatus(msg, isError = false) {
    statusText.textContent = msg;
    statusText.classList.toggle('error', isError);
    loading.classList.remove('hidden');
  }

  function hideStatus() {
    loading.classList.add('hidden');
  }

  function playIframe(embedUrl) {
    hideStatus();
    ui.style.display = 'none';
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allowFullscreen = true;
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    iframe.referrerPolicy = 'origin';
    iframe.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;border:none;background:#000;';
    playerEl.appendChild(iframe);
  }

  // ---- Diagnostic: dump the raw master playlist ----
  async function logRawManifest(url) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log('=== RAW MASTER PLAYLIST ===');
      console.log(text);
      const resolutions = text
        .split('\n')
        .filter((l) => l.includes('RESOLUTION'))
        .map((l) => {
          const m = l.match(/RESOLUTION=(\d+)x(\d+)/);
          return m ? `${m[2]}p` : 'unknown';
        });
      console.log('=== RESOLUTIONS IN MANIFEST ===', resolutions);
    } catch (e) {
      console.warn('Could not fetch raw manifest:', e);
    }
  }

  function playHls(url, subtitles, referer) {
    setStatus('Loading video…');

    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,

        // ---- Explicitly disable any player-size capping ----
        capLevelToPlayerSize: false,
        capLevelOnFPSDrop: false,

        // ---- Don't start artificially low ----
        startLevel: -1,
        abrEwmaDefaultEstimate: 5000000,

        // ---- Don't filter any level ----
        minAutoBitrate: 0,
        maxMaxBufferLength: 60,
      });

      // Diagnostic — see the raw playlist in console
      logRawManifest(url);

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        console.log('=== hls.js parsed levels ===');
        data.levels.forEach((lvl, i) => {
          console.log(
            `  #${i}  ${lvl.width}x${lvl.height}  ` +
            `${Math.round(lvl.bitrate / 1000)} kbps  ` +
            `fps=${lvl.frameRate || '?'}  ` +
            `codec=${lvl.videoCodec || '?'}`
          );
        });
        console.log('Total levels:', data.levels.length);
        console.log('autoLevelCapping:', hls.autoLevelCapping);

        if (data.levels.length) {
          buildQualityMenu(data.levels);
        } else {
          qualityBtn.style.display = 'none';
        }

        attachSubtitles(subtitles, referer);
        hideStatus();
        video.play().catch(() => showUI());
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        if (hls.currentLevel === -1) {
          const lvl = hls.levels[data.level];
          if (lvl && lvl.height) qualityBtn.textContent = `Auto ${lvl.height}p`;
        }
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setStatus('Network error, retrying…', true);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setStatus('Media error, recovering…', true);
              hls.recoverMediaError();
              break;
            default:
              setStatus('Playback failed: ' + data.details, true);
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        attachSubtitles(subtitles, referer);
        hideStatus();
        video.play().catch(() => {});
      });
    } else {
      setStatus('HLS not supported in this browser.', true);
    }
  }

  // Initialise icons
  updatePlayIcons();
  updateMuteIcon();
  updateFullscreenIcon();

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  (async function init() {
    if (!id) {
      setStatus('No movie ID provided.', true);
      return;
    }
    setStatus('Extracting stream… this may take 15–40 seconds.');

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: id, type, season, episode }),
      });

      const data = await res.json();
      console.log('[player] response:', data);

      if (!res.ok) {
        setStatus(data.error || `Server error ${res.status}`, true);
        return;
      }

      if (data.mode === 'iframe') {
        playIframe(data.embed);
      } else {
        let proxied =
  `/api/proxy?url=${encodeURIComponent(data.stream)}` +
  `&referer=${encodeURIComponent(data.referer || '')}`;
if (data.cookies) proxied += `&ck=${encodeURIComponent(data.cookies)}`;
      }
    } catch (err) {
      console.error('[player] error:', err);
      setStatus(err.message, true);
    }
  })();

  // Cleanup
  window.addEventListener('beforeunload', () => {
    if (hls) try { hls.destroy(); } catch (_) {}
  });
});
