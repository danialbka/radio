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
const vizStyleSelect = document.getElementById('vizStyle');
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
let currentVizStyle = 'dots';
let vizTick = 0;
let rotationPhase = 0;
const barPeaks = [];

function initAudioGraph() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024; // higher resolution for richer visuals
    analyser.smoothingTimeConstant = 0.82;
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
  const freqBins = analyser.frequencyBinCount;
  const freqArray = new Uint8Array(freqBins);
  const timeArray = new Uint8Array(analyser.fftSize);
  let levels = [];
  let usedBinsSmoothed = Math.floor(freqBins * 0.9);

  function draw() {
    vizRAF = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(freqArray);
    analyser.getByteTimeDomainData(timeArray);
    const rect = vizCanvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    // subtle trail
    vizCtx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.35)';
    vizCtx.fillRect(0, 0, width, height);

    vizTick += 1;
    rotationPhase += 0.0035; // for radial mode

    const decay = 0.02;

    // Compute effective usable frequency range by spectral rolloff
    let totalEnergy = 0;
    for (let i = 0; i < freqBins; i++) totalEnergy += freqArray[i];
    let rolloffTarget = Math.floor(freqBins * 0.85);
    if (totalEnergy > 0) {
      const targetEnergy = totalEnergy * 0.985; // 98.5% rolloff
      let accum = 0;
      let idx = 0;
      for (; idx < freqBins; idx++) {
        accum += freqArray[idx];
        if (accum >= targetEnergy) break;
      }
      rolloffTarget = idx;
    }
    const minUsed = Math.floor(freqBins * 0.55);
    const maxUsed = freqBins;
    const targetUsed = Math.max(minUsed, Math.min(maxUsed, rolloffTarget));
    usedBinsSmoothed = Math.round(usedBinsSmoothed * 0.9 + targetUsed * 0.1);
    const usedBins = Math.max(minUsed, Math.min(maxUsed, usedBinsSmoothed));

    if (currentVizStyle === 'bars') {
      const bars = Math.max(36, Math.floor(width / 12));
      const barW = width / bars;
      const step = Math.max(1, Math.floor(usedBins / bars));
      if (levels.length !== bars) levels = new Array(bars).fill(0);
      if (barPeaks.length !== bars) {
        barPeaks.length = 0;
        for (let i = 0; i < bars; i++) barPeaks[i] = 0;
      }
      for (let b = 0; b < bars; b++) {
        let sum = 0;
        const start = b * step;
        const end = Math.min(usedBins, start + step);
        for (let i = start; i < end; i++) sum += freqArray[i];
        const v = (sum / ((end - start) || 1)) / 255; // 0..1
        levels[b] = Math.max(v, Math.max(0, levels[b] - decay));

        const h = levels[b] * height * 0.9;
        const x = b * barW + barW * 0.12;
        const y = height - h;
        const w = barW * 0.76;
        const hue = (20 + levels[b] * 40 + (b / bars) * 60 + vizTick * 0.2) % 360;
        const grad = vizCtx.createLinearGradient(0, y, 0, height);
        grad.addColorStop(0, `hsla(${hue}, 95%, 60%, 1)`);
        grad.addColorStop(1, `hsla(${hue}, 95%, 70%, 0.35)`);
        vizCtx.fillStyle = grad;
        const r = Math.min(8, w * 0.35);
        // glow
        vizCtx.save();
        vizCtx.shadowBlur = 10;
        vizCtx.shadowColor = `hsla(${hue}, 95%, 65%, 0.75)`;
        vizCtx.beginPath();
        vizCtx.moveTo(x + r, y);
        vizCtx.lineTo(x + w - r, y);
        vizCtx.quadraticCurveTo(x + w, y, x + w, y + r);
        vizCtx.lineTo(x + w, height);
        vizCtx.lineTo(x, height);
        vizCtx.lineTo(x, y + r);
        vizCtx.quadraticCurveTo(x, y, x + r, y);
        vizCtx.closePath();
        vizCtx.fill();
        vizCtx.restore();

        // peak caps with gentle fall
        barPeaks[b] = Math.max(barPeaks[b] - 0.01, levels[b]);
        const peakY = height - barPeaks[b] * height * 0.9;
        vizCtx.fillStyle = `hsla(${hue}, 95%, 85%, 0.9)`;
        vizCtx.fillRect(x, Math.max(0, peakY - 3), w, 3);
      }
      return;
    }

    if (currentVizStyle === 'wave') {
      const colorA = 'hsla(170, 85%, 60%, 0.95)';
      const colorB = 'hsla(30, 95%, 60%, 0.95)';
      const layers = 3;
      for (let l = 0; l < layers; l++) {
        const tOff = l * 0.06;
        vizCtx.lineWidth = Math.max(1.5, Math.min(3.5, width / 520)) + l * 0.75;
        const grad = vizCtx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, colorA);
        grad.addColorStop(1, colorB);
        vizCtx.strokeStyle = grad;
        vizCtx.shadowBlur = 12;
        vizCtx.shadowColor = 'rgba(255, 180, 120, 0.55)';
        vizCtx.beginPath();
        const midY = height * (0.52 + l * 0.03);
        const amp = height * (0.28 - l * 0.06);
        for (let i = 0; i < timeArray.length; i++) {
          const t = (timeArray[i] - 128) / 128; // -1..1
          const x = (i / (timeArray.length - 1)) * width;
          const y = midY + t * amp + Math.sin(x * 0.02 + vizTick * 0.08 + tOff) * 2;
          if (i === 0) vizCtx.moveTo(x, y); else vizCtx.lineTo(x, y);
        }
        vizCtx.stroke();
      }
      return;
    }

    if (currentVizStyle === 'radial') {
      const cx = width / 2;
      const cy = height / 2;
      const baseR = Math.min(width, height) * 0.22;
      const spokes = 120;
      const step = Math.max(1, Math.floor(usedBins / spokes));
      if (levels.length !== spokes) levels = new Array(spokes).fill(0);
      vizCtx.save();
      vizCtx.translate(cx, cy);
      vizCtx.rotate(rotationPhase);
      vizCtx.translate(-cx, -cy);
      for (let s = 0; s < spokes; s++) {
        let sum = 0;
        const start = s * step;
        const end = Math.min(usedBins, start + step);
        for (let i = start; i < end; i++) sum += freqArray[i];
        const v = (sum / ((end - start) || 1)) / 255; // 0..1
        levels[s] = Math.max(v, Math.max(0, levels[s] - decay));

        const angle = (s / spokes) * Math.PI * 2;
        const len = baseR + levels[s] * Math.min(width, height) * 0.32;
        const hue = (28 + levels[s] * 200 + vizTick * 0.6) % 360;
        vizCtx.strokeStyle = `hsla(${hue}, 95%, 65%, 0.95)`;
        vizCtx.lineWidth = 2.2;
        vizCtx.shadowBlur = 14;
        vizCtx.shadowColor = `hsla(${hue}, 95%, 65%, 0.75)`;
        vizCtx.beginPath();
        vizCtx.moveTo(cx + Math.cos(angle) * baseR, cy + Math.sin(angle) * baseR);
        vizCtx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        vizCtx.stroke();
      }
      vizCtx.restore();
      // inner ring
      vizCtx.beginPath();
      vizCtx.lineWidth = 2;
      vizCtx.strokeStyle = 'rgba(0,0,0,0.12)';
      if (document.documentElement.getAttribute('data-theme') === 'dark') {
        vizCtx.strokeStyle = 'rgba(255,255,255,0.18)';
      }
      vizCtx.arc(cx, cy, baseR, 0, Math.PI * 2);
      vizCtx.stroke();
      return;
    }

    // default: dot-matrix
    const cols = Math.max(36, Math.floor(width / 16));
    const rows = Math.max(18, Math.floor(height / 12));
    const cellW = width / cols;
    const cellH = height / rows;
    const radius = Math.floor(Math.min(cellW, cellH) * 0.28);
    const sampleStep = Math.max(1, Math.floor(usedBins / cols));
    if (levels.length !== cols) levels = new Array(cols).fill(0);

    for (let c = 0; c < cols; c++) {
      let sum = 0;
      const start = c * sampleStep;
      const end = Math.min(usedBins, start + sampleStep);
      for (let i = start; i < end; i++) sum += freqArray[i];
      const v = (sum / ((end - start) || 1)) / 255; // 0..1
      levels[c] = Math.max(v, Math.max(0, levels[c] - decay));

      const lit = Math.floor(levels[c] * rows);
      const hue = (24 + levels[c] * 180 + c * 0.8 + vizTick * 0.5) % 360;
      for (let r = 0; r < rows; r++) {
        const dx = c * cellW + cellW / 2;
        const dy = height - (r * cellH + cellH / 2);
        const isOn = r < lit;
        const rel = isOn ? 1 - (r / Math.max(1, lit)) : 0;
        const alpha = isOn ? 0.35 + 0.6 * Math.pow(rel, 0.8) : 0.06;
        const lightness = isOn ? 60 : 85;
        vizCtx.fillStyle = `hsla(${hue}, 95%, ${lightness}%, ${alpha})`;
        vizCtx.save();
        if (isOn) {
          const glowAlpha = Math.min(0.75, alpha + 0.25);
          vizCtx.shadowBlur = Math.max(8, radius * 1.8);
          vizCtx.shadowColor = `hsla(${hue}, 95%, 65%, ${glowAlpha})`;
        } else {
          vizCtx.shadowBlur = 0;
        }
        vizCtx.beginPath();
        vizCtx.arc(dx, dy, radius, 0, Math.PI * 2);
        vizCtx.fill();
        vizCtx.restore();
      }
    }
  }
  draw();
}

function stopVisualizer() {
  cancelAnimationFrame(vizRAF);
  // Full clear including any trails
  const rect = vizCanvas.getBoundingClientRect();
  vizCtx.setTransform(1, 0, 0, 1, 0, 0);
  vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  // Restore DPR transform
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  vizCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  // Visualizer style init
  try {
    const savedStyle = localStorage.getItem('vizStyle');
    if (savedStyle) currentVizStyle = savedStyle;
  } catch (_) {}
  if (vizStyleSelect) {
    vizStyleSelect.value = currentVizStyle;
    vizStyleSelect.addEventListener('change', () => {
      currentVizStyle = vizStyleSelect.value;
      try { localStorage.setItem('vizStyle', currentVizStyle); } catch (_) {}
      // Hard reset visualizer to prevent style overlays/trails
      try { barPeaks.length = 0; } catch (_) {}
      stopVisualizer();
      if (poweredOn && !audio.paused) {
        startVisualizer();
      }
    });
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
