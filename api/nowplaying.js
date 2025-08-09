// Vercel Serverless Function: Fetch ICY metadata (StreamTitle) for whitelisted stations
// Notes:
// - Only allows predefined stations to avoid open proxy abuse
// - Follows up to 3 redirects (StreamTheWorld often redirects)
// - Reads one ICY metadata block and returns JSON { title }

const http = require('http');
const https = require('https');

const STATION_URLS = {
  CLASS95: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CLASS95.mp3',
  GOLD905: 'https://playerservices.streamtheworld.com/api/livestream-redirect/GOLD905.mp3',
  YES933: 'https://playerservices.streamtheworld.com/api/livestream-redirect/YES933.mp3',
  _987FM: 'https://playerservices.streamtheworld.com/api/livestream-redirect/987FM.mp3',
  _883JIA: 'https://playerservices.streamtheworld.com/api/livestream-redirect/883JIA.mp3'
};

function getUrlForStation(id) {
  if (id === '987FM') return STATION_URLS._987FM;
  if (id === '883JIA') return STATION_URLS._883JIA;
  return STATION_URLS[id];
}

module.exports = async function handler(req, res) {
  try {
    const { station } = req.query;
    const url = getUrlForStation(String(station || '').toUpperCase());
    if (!url) {
      res.status(400).json({ error: 'Unsupported station' });
      return;
    }

    const data = await fetchIcyTitle(url);
    if (!data) {
      res.status(204).end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ title: data });
  } catch (e) {
    res.status(204).end();
  }
}

function fetchIcyTitle(url, redirects = 0) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'Icy-MetaData': '1',
        'User-Agent': 'Mozilla/5.0'
      }
    }, (resp) => {
      // Follow up to 3 redirects
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        const loc = resp.headers.location;
        resp.resume();
        if (redirects >= 3) {
          resolve(null);
          return;
        }
        resolve(fetchIcyTitle(loc, redirects + 1));
        return;
      }
      handleStream(resp, resolve);
    });
    req.setTimeout(6000, () => { try { req.destroy(); } catch (_) {} resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function handleStream(resp, resolve) {
  const metaInt = parseInt(resp.headers['icy-metaint'] || resp.headers['icy-metaint'.toLowerCase()], 10);
  if (!metaInt || Number.isNaN(metaInt)) {
    // No ICY metadata
    resp.destroy();
    resolve(null);
    return;
  }
  let received = 0;
  let audioSkip = metaInt;
  let buffer = Buffer.alloc(0);
  resp.on('data', (chunk) => {
    received += chunk.length;
    buffer = Buffer.concat([buffer, chunk]);

    if (buffer.length >= audioSkip + 1) {
      // Skip audio bytes
      const metaLenByte = buffer[audioSkip];
      const metaLen = metaLenByte * 16;
      if (buffer.length >= audioSkip + 1 + metaLen) {
        const meta = buffer.slice(audioSkip + 1, audioSkip + 1 + metaLen).toString('utf8');
        const m = /StreamTitle='([^']*)'/.exec(meta);
        resp.destroy();
        resolve(m && m[1] ? m[1] : null);
      }
    }
    // Safety: limit amount downloaded
    if (received > metaInt + 1024) {
      resp.destroy();
      resolve(null);
    }
  });
  resp.on('error', () => resolve(null));
}
