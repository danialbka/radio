/* Retro FM Radio – Singapore */

const audio = document.getElementById('audio');
const freqValue = document.getElementById('freqValue');
const stationReadout = document.getElementById('stationReadout');
const songTitleEl = document.getElementById('songTitle');
const volume = document.getElementById('volume');
const powerBtn = document.getElementById('powerBtn');
const powerLed = document.getElementById('powerLed');
const playPause = document.getElementById('playPause');
const muteBtn = document.getElementById('muteBtn');
const presetList = document.getElementById('presetList');
const themeToggle = document.getElementById('themeToggle');
// No tuner controls: channels selected via preset buttons only
// Background disco lights toggle based on audio state
audio.addEventListener('playing', () => document.body.classList.add('playing'));
audio.addEventListener('pause', () => document.body.classList.remove('playing'));
audio.addEventListener('ended', () => document.body.classList.remove('playing'));
audio.addEventListener('stalled', () => document.body.classList.remove('playing'));

// Pixel visualizer setup
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let fadeGain = null;
const vizCanvas = document.getElementById('vizCanvas');
const vizCtx = vizCanvas.getContext('2d');
let vizRAF = null;

function initAudioGraph() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // keep chunky
    analyser.smoothingTimeConstant = 0.85;
  }
  if (!sourceNode) {
    sourceNode = audioCtx.createMediaElementSource(audio);
  }
  if (!fadeGain) {
    fadeGain = audioCtx.createGain();
    fadeGain.gain.value = 1;
    // wiring: source -> analyser (for viz)
    //       : source -> fadeGain -> destination (for audio)
    sourceNode.connect(analyser);
    sourceNode.connect(fadeGain);
    fadeGain.connect(audioCtx.destination);
  }
}

function resizeCanvas() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const rect = vizCanvas.getBoundingClientRect();
  vizCanvas.width = Math.floor(rect.width * dpr);
  vizCanvas.height = Math.floor(rect.height * dpr);
  vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startVisualizer() {
  resizeCanvas();
  cancelAnimationFrame(vizRAF);
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let levels = [];

  function draw() {
    vizRAF = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    const rect = vizCanvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    vizCtx.clearRect(0, 0, width, height);

    // Dot-matrix LED style grid
    const cols = Math.max(36, Math.floor(width / 18));
    const rows = Math.max(16, Math.floor(height / 14));
    const cellW = width / cols;
    const cellH = height / rows;
    const radius = Math.floor(Math.min(cellW, cellH) * 0.28);
    const sampleStep = Math.max(1, Math.floor(bufferLength / cols));
    const decay = 0.02;

    if (levels.length !== cols) {
      levels = new Array(cols).fill(0);
    }

    for (let c = 0; c < cols; c++) {
      // Average a small band for this column
      let sum = 0;
      const start = c * sampleStep;
      const end = Math.min(bufferLength, start + sampleStep);
      for (let i = start; i < end; i++) sum += dataArray[i];
      const v = (sum / ((end - start) || 1)) / 255; // 0..1
      levels[c] = Math.max(v, Math.max(0, levels[c] - decay));

      const lit = Math.floor(levels[c] * rows);
      const hue = 24 + levels[c] * 32; // warm amber range

      for (let r = 0; r < rows; r++) {
        const cx = c * cellW + cellW / 2;
        const cy = height - (r * cellH + cellH / 2);

        const isOn = r < lit;
        const rel = isOn ? 1 - (r / Math.max(1, lit)) : 0; // brighter near the top of the lit column
        const alpha = isOn ? 0.25 + 0.65 * Math.pow(rel, 0.8) : 0.08;
        const lightness = isOn ? 56 : 82;
        vizCtx.fillStyle = `hsla(${hue}, 80%, ${lightness}%, ${alpha})`;

        // Draw dot with glow for active LEDs
        vizCtx.save();
        if (isOn) {
          const glowAlpha = Math.min(0.6, alpha + 0.2);
          vizCtx.shadowBlur = Math.max(6, radius * 1.6);
          vizCtx.shadowColor = `hsla(${hue}, 90%, 60%, ${glowAlpha})`;
        } else {
          vizCtx.shadowBlur = 0;
        }
        vizCtx.beginPath();
        vizCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        vizCtx.fill();
        vizCtx.restore();
      }
    }
  }
  draw();
}

function stopVisualizer() {
  cancelAnimationFrame(vizRAF);
  vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
}

// Smoothly ramp audio down and pause; also stop lights/visualizer
function fadeOutAndPause(durationSec = 0.6) {
  return new Promise((resolve) => {
    try {
      if (audioCtx && fadeGain && !audio.paused) {
        const now = audioCtx.currentTime;
        const prev = fadeGain.gain.value;
        fadeGain.gain.cancelScheduledValues(now);
        fadeGain.gain.setValueAtTime(prev, now);
        fadeGain.gain.linearRampToValueAtTime(0, now + durationSec);
        setTimeout(() => {
          audio.pause();
          // Reset for next play
          fadeGain.gain.setValueAtTime(1, audioCtx.currentTime + 0.01);
          document.body.classList.remove('playing');
          setTimeout(() => stopVisualizer(), 200);
          resolve();
        }, Math.ceil((durationSec + 0.02) * 1000));
      } else {
        audio.pause();
        document.body.classList.remove('playing');
        stopVisualizer();
        resolve();
      }
    } catch (_) {
      audio.pause();
      document.body.classList.remove('playing');
      stopVisualizer();
      resolve();
    }
  });
}

// removed hex drawing helper

// Frequency selection state (for readout); channels are selected via presets
const minFreq = 87.5;
const maxFreq = 108.0;
let currentFreq = 95.0;

// Station catalog: Singapore FM (sample set)
// Note: Public, known endpoints can change or be region/CORS restricted.
// We include multiple candidate URLs per station to improve reliability.
const stations = [
  {
    name: 'CLASS 95',
    freqMHz: 95.0,
    city: 'Singapore',
    nowPlayingId: 'CLASS95',
    urls: [
      'https://playerservices.streamtheworld.com/api/livestream-redirect/CLASS95AAC_SC',
      'https://playerservices.streamtheworld.com/api/livestream-redirect/CLASS95.mp3'
    ]
  },
  {
    name: 'GOLD 905',
    freqMHz: 90.5,
    city: 'Singapore',
    nowPlayingId: 'GOLD905',
    urls: [
      'https://playerservices.streamtheworld.com/api/livestream-redirect/GOLD905AAC_SC',
      'https://playerservices.streamtheworld.com/api/livestream-redirect/GOLD905.mp3'
    ]
  },
  {
    name: 'YES 933',
    freqMHz: 93.3,
    city: 'Singapore',
    nowPlayingId: 'YES933',
    urls: [
      'https://playerservices.streamtheworld.com/api/livestream-redirect/YES933AAC_SC',
      'https://playerservices.streamtheworld.com/api/livestream-redirect/YES933.mp3'
    ]
  },
  {
    name: '987FM',
    freqMHz: 98.7,
    city: 'Singapore',
    nowPlayingId: '987FM',
    urls: [
      'https://playerservices.streamtheworld.com/api/livestream-redirect/987FMAAC_SC',
      'https://playerservices.streamtheworld.com/api/livestream-redirect/987FM.mp3'
    ]
  },
  {
    name: '88.3JIA',
    freqMHz: 88.3,
    city: 'Singapore',
    nowPlayingId: '883JIA',
    urls: [
      'https://playerservices.streamtheworld.com/api/livestream-redirect/883JIAAAC_SC',
      'https://playerservices.streamtheworld.com/api/livestream-redirect/883JIA.mp3'
    ]
  }
];

// Generate dial ticks
// No dial scale/ticks when using preset-only selection

// No needle when using preset-only selection

function formatFreq(freq) {
  return freq.toFixed(1);
}

function getNearestStation(freq) {
  let nearest = null;
  let smallestDiff = Number.POSITIVE_INFINITY;
  for (const s of stations) {
    const diff = Math.abs(s.freqMHz - freq);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      nearest = s;
    }
  }
  return { station: nearest, diff: smallestDiff };
}

function setReadout(freq, stationName) {
  freqValue.textContent = formatFreq(freq);
  stationReadout.textContent = stationName || '—';
}

let poweredOn = false;
let currentStationIndex = -1;
let currentUrlIndex = 0;
let availabilityTimeout = null;
let nowPlayingTimer = null;
let nowPlayingAbort = null;

function clearAvailabilityTimeout() {
  if (availabilityTimeout) {
    clearTimeout(availabilityTimeout);
    availabilityTimeout = null;
  }
}

function setPower(state) {
  poweredOn = state;
  powerBtn.setAttribute('aria-pressed', String(state));
  playPause.disabled = !state;
  muteBtn.disabled = !state;
  if (!state) {
    clearAvailabilityTimeout();
    stopNowPlayingPoll();
    setSongTitle('');
    fadeOutAndPause().finally(() => {
      playPause.textContent = 'Play';
    });
  }
}

function setSongTitle(text) {
  if (!songTitleEl) return;
  const val = (text || '').trim();
  songTitleEl.textContent = val || '—';
}

function stopNowPlayingPoll() {
  if (nowPlayingTimer) {
    clearInterval(nowPlayingTimer);
    nowPlayingTimer = null;
  }
  if (nowPlayingAbort) {
    try { nowPlayingAbort.abort(); } catch (_) {}
    nowPlayingAbort = null;
  }
}

function startNowPlayingPoll(station) {
  stopNowPlayingPoll();
  if (!station || !station.nowPlayingId) {
    setSongTitle('');
    return;
  }
  setSongTitle('');
  const controller = new AbortController();
  nowPlayingAbort = controller;

  const fetchOnce = async () => {
    try {
      const resp = await fetch(`/api/nowplaying?station=${encodeURIComponent(station.nowPlayingId)}`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (resp.status === 204) {
        setSongTitle('');
        return;
      }
      if (resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await resp.json();
          setSongTitle(data && data.title ? data.title : '');
        }
      } else {
        setSongTitle('');
      }
    } catch (_) {
      // ignore errors; keep last title
    }
  };

  // Initial fetch and then poll every 30s
  fetchOnce();
  nowPlayingTimer = setInterval(fetchOnce, 30000);
}

async function tryPlayStation(station) {
  // Try URLs sequentially until one plays
  for (let i = 0; i < station.urls.length; i++) {
    const url = station.urls[i];
    try {
      if (url.endsWith('.m3u8')) {
        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({ enableWorker: true });
          hls.loadSource(url);
          hls.attachMedia(audio);
          await new Promise((resolve, reject) => {
            hls.on(window.Hls.Events.MANIFEST_PARSED, resolve);
            hls.on(window.Hls.Events.ERROR, reject);
          });
          await audio.play();
        } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
          audio.src = url;
          await audio.play();
        } else {
          throw new Error('HLS not supported');
        }
      } else {
        audio.src = url;
        await audio.play();
      }
      currentUrlIndex = i;
      return { ok: true, url };
    } catch (err) {
      // Continue trying next URL
      // In some browsers, play() rejection requires user gesture; power/play button provides it.
    }
  }
  return { ok: false };
}

async function tuneTo(freq, snap = true) {
  setReadout(freq, '');
  if (!poweredOn) return;

  // Smoothly stop current audio before switching
  await (async () => {
    try {
      if (audioCtx && fadeGain && !audio.paused) {
        const now = audioCtx.currentTime;
        const prev = fadeGain.gain.value;
        fadeGain.gain.cancelScheduledValues(now);
        fadeGain.gain.setValueAtTime(prev, now);
        fadeGain.gain.linearRampToValueAtTime(0, now + 0.35);
        await new Promise(res => setTimeout(res, 370));
        audio.pause();
        fadeGain.gain.setValueAtTime(1, audioCtx.currentTime + 0.01);
      }
    } catch (_) { /* ignore */ }
  })();

  // Change in station — stop old polling
  stopNowPlayingPoll();
  setSongTitle('');

  const { station } = getNearestStation(freq);
  if (!station) return;

  // Snap logic: if within 0.3 MHz, snap; else just display freq
  const diff = Math.abs(station.freqMHz - freq);
  let targetFreq = freq;
  if (snap && diff <= 0.3) {
    targetFreq = station.freqMHz;
    currentFreq = targetFreq;
  }

  setReadout(targetFreq, station.name);

  const idx = stations.findIndex(s => s.name === station.name);
  if (idx !== -1) currentStationIndex = idx;

  const res = await tryPlayStation(station);
  if (res.ok) {
    playPause.textContent = 'Pause';
    document.body.classList.add('playing');
    try { initAudioGraph(); if (audioCtx.state === 'suspended') audioCtx.resume(); startVisualizer(); } catch(_) {}
    // Begin now playing polling
    startNowPlayingPoll(station);
  }

  // Only mark unavailable after a short delay if still not playing
  clearAvailabilityTimeout();
  const stationName = station.name;
  availabilityTimeout = setTimeout(() => {
    if (audio.paused) {
      stationReadout.textContent = `${stationName} (unavailable)`;
    } else {
      stationReadout.textContent = stationName;
    }
  }, 2000);
}

function buildPresets() {
  presetList.innerHTML = '';
  for (const s of stations) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.innerHTML = `${s.name}<span class="meta">${s.freqMHz.toFixed(1)} MHz</span>`;
    btn.addEventListener('click', async () => {
      currentFreq = s.freqMHz;
      await userInteractPlay(() => tuneTo(currentFreq, true));
    });
    li.appendChild(btn);
    presetList.appendChild(li);
  }
}

function initVolume() {
  audio.volume = parseFloat(volume.value);
  volume.addEventListener('input', () => {
    audio.volume = parseFloat(volume.value);
  });
}

async function userInteractPlay(fn) {
  // Ensure a user gesture precedes play for browsers that require it
  try {
    await fn();
  } catch (_) {
    // ignore
  }
}

powerBtn.addEventListener('click', async () => {
  const next = !poweredOn;
  setPower(next);
  if (next) {
    await userInteractPlay(() => tuneTo(currentFreq, true));
  }
});

playPause.addEventListener('click', async () => {
  if (!poweredOn) return;
  if (audio.paused) {
    await userInteractPlay(async () => {
      await tuneTo(currentFreq, true);
      try { initAudioGraph(); if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume(); startVisualizer(); } catch(_) {}
    });
  } else {
    // Smooth fade-out on pause
    try {
      if (audioCtx && fadeGain) {
        const now = audioCtx.currentTime;
        const prev = fadeGain.gain.value;
        fadeGain.gain.cancelScheduledValues(now);
        fadeGain.gain.setValueAtTime(prev, now);
        fadeGain.gain.linearRampToValueAtTime(0, now + 0.6);
        setTimeout(() => {
          audio.pause();
          fadeGain.gain.setValueAtTime(1, audioCtx.currentTime + 0.01); // reset for next play
        }, 620);
      } else {
        audio.pause();
      }
    } finally {
      playPause.textContent = 'Play';
      document.body.classList.remove('playing');
      stopNowPlayingPoll();
      setSongTitle('');
      // let the visualizer linger slightly for a smoother stop
      setTimeout(() => stopVisualizer(), 300);
    }
  }
});

muteBtn.addEventListener('click', () => {
  if (!poweredOn) return;
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? 'Unmute' : 'Mute';
});

// No step tuning buttons in preset-only mode

// Initialize
(function init() {
  buildPresets();
  initVolume();
  setReadout(currentFreq, '');
  window.addEventListener('resize', resizeCanvas);
  // Theme init from localStorage
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle?.setAttribute('aria-pressed', 'true');
  }
  themeToggle?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggle.setAttribute('aria-pressed', 'true');
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeToggle.setAttribute('aria-pressed', 'false');
    }
    localStorage.setItem('theme', next);
  });
})();
