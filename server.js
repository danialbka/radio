// Minimal local dev server for Retro FM Radio
// - Serves static files from project root
// - Exposes /api/nowplaying using the same handler as Vercel

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const apiNowPlaying = require('./api/nowplaying.js');

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const root = __dirname;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  if (body !== undefined) res.end(body);
  else res.end();
}

function enhanceRes(res) {
  if (typeof res.status !== 'function') {
    res.status = function (code) { this.statusCode = code; return this; };
  }
  if (typeof res.json !== 'function') {
    res.json = function (obj) {
      if (!this.getHeader('Content-Type')) this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(obj));
    };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host}`);

    // API route
    if (parsed.pathname === '/api/nowplaying') {
      // Patch a req.query for compatibility
      req.query = Object.fromEntries(parsed.searchParams.entries());
      enhanceRes(res);
      return apiNowPlaying(req, res);
    }

    // Static files
    let filePath = path.join(root, decodeURIComponent(parsed.pathname));
    if (parsed.pathname === '/') filePath = path.join(root, 'index.html');

    // Prevent path traversal
    if (!filePath.startsWith(root)) {
      return send(res, 403, 'Forbidden');
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        return send(res, 404, 'Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = mime[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    send(res, 500, 'Server error');
  }
});

server.listen(port, () => {
  console.log(`Retro FM local dev server running: http://localhost:${port}`);
});
