#!/usr/bin/env node
/**
 * scripts/serve-static.js — minimal static file server for the built frontend.
 *
 * Zero dependencies (node stdlib only). NOT part of the application; it is
 * used only by per-client deployments (scripts/deploy-client.sh) and local
 * previews. The application itself (server.js / production-api.js) intentionally
 * does not serve the frontend, so this file never touches the API surface or
 * the regression suite.
 *
 * Usage: node scripts/serve-static.js <root-dir> <port>
 *
 * Behavior:
 *   - Serves <root-dir> over HTTP on 127.0.0.1:<port>.
 *   - SPA fallback: unknown paths (and directories) serve index.html so React
 *     Router can handle client-side routing.
 *   - Path traversal is rejected; no directory listings.
 *   - Optional same-origin API gateway: when PROXY_API_PORT is set, requests
 *     to /health and /v3/* are reverse-proxied to 127.0.0.1:$PROXY_API_PORT.
 *     This lets a standalone localhost deployment work with no reverse proxy
 *     in front (the built frontend calls /v3/... relative to its own origin).
 *     In production, Caddy/nginx takes over this job — see docs/DEPLOY.md.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2] ? path.resolve(process.argv[2]) : '';
const port = parseInt(process.argv[3] || '0', 10);
const proxyApiPort = parseInt(process.env.PROXY_API_PORT || '0', 10);

if (!root || !port || Number.isNaN(port)) {
    console.error('usage: node scripts/serve-static.js <root-dir> <port>');
    process.exit(2);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
};

function proxyToApi(req, res) {
    const proxy = http.request(
        { host: '127.0.0.1', port: proxyApiPort, path: req.url, method: req.method, headers: req.headers },
        (pres) => {
            res.writeHead(pres.statusCode, pres.headers);
            pres.pipe(res);
        }
    );
    proxy.on('error', () => {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('bad gateway: api unreachable');
    });
    req.pipe(proxy);
}

function safePath(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
    } catch {
        return null;
    }
    const resolved = path.resolve(root, '.' + decoded);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
    return resolved;
}

const server = http.createServer((req, res) => {
    const urlPath = req.url || '/';

    if (proxyApiPort && (urlPath === '/health' || urlPath.startsWith('/health?') || urlPath.startsWith('/v3/'))) {
        return proxyToApi(req, res);
    }

    let filePath = safePath(urlPath);
    if (!filePath) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('forbidden');
        return;
    }

    const serveIndexFallback = () => {
        fs.readFile(path.join(root, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(404, { 'content-type': 'text/plain' });
                res.end('not found');
                return;
            }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    };

    fs.stat(filePath, (err, stat) => {
        if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
        fs.readFile(filePath, (err2, data) => {
            if (err2) return serveIndexFallback(); // SPA fallback
            const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
            res.writeHead(200, { 'content-type': type });
            res.end(data);
        });
    });
});

server.listen(port, '127.0.0.1', () => {
    console.log(
        `[serve-static] serving ${root} on http://127.0.0.1:${port}` +
        (proxyApiPort ? ` (proxying /health and /v3/* to 127.0.0.1:${proxyApiPort})` : '')
    );
});
