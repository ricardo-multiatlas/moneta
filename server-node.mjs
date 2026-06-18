// Adapter para correr Moneta en Node.js (Railway, VPS, etc.)
//
// El bundle vite genera dist/server/server.js exportando un handler estilo
// Cloudflare Workers ({ fetch(request) → Response }). Este wrapper:
//   1. Sirve los assets estáticos de dist/client en /assets/, /favicon, etc.
//   2. Para cualquier otra ruta, convierte el req de Node a Request (Fetch API)
//      y delega al handler SSR. La Response que devuelve se convierte de vuelta
//      a res de Node.
//
// Variables de entorno usadas:
//   PORT       Puerto a escuchar (Railway lo inyecta, default 3000)
//   HOST       Host a bindear (default 0.0.0.0 para Railway)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, "dist", "client");
const SERVER_ENTRY = path.join(__dirname, "dist", "server", "server.js");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Cargar el handler SSR — usar file:// URL para que funcione en Windows
const serverModule = await import(pathToFileURL(SERVER_ENTRY).href);
const handler = serverModule.default ?? serverModule;

if (!handler?.fetch) {
  console.error("Error: dist/server/server.js no exporta { fetch }. ¿Build OK?");
  process.exit(1);
}

// MIME types simples
const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

function sendStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const isHashedAsset = /\/assets\/[\w.\-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?)$/.test(filePath);
  res.statusCode = 200;
  res.setHeader("content-type", mime);
  if (isHashedAsset) {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  }
  fs.createReadStream(filePath).pipe(res);
}

// Convierte req Node a Request (Fetch API)
async function nodeReqToFetchRequest(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `${HOST}:${PORT}`;
  const url = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, String(v));
  }

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  return new Request(url, { method: req.method, headers, body });
}

// Envía Response (Fetch API) por res Node
async function fetchResponseToNodeRes(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    // 1. Servir assets estáticos primero (rápido, sin pasar por SSR)
    if (pathname.startsWith("/assets/") || pathname.startsWith("/_build/")) {
      const filePath = path.join(CLIENT_DIR, pathname);
      if (filePath.startsWith(CLIENT_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return sendStatic(res, filePath);
      }
      res.statusCode = 404; res.end("Not found"); return;
    }

    // 2. Archivos sueltos en raíz: manifest, sw.js, robots, favicon, etc.
    if (pathname !== "/" && !pathname.includes("..")) {
      const candidate = path.join(CLIENT_DIR, pathname);
      if (candidate.startsWith(CLIENT_DIR) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return sendStatic(res, candidate);
      }
    }

    // 3. Para todo lo demás → SSR. Log si la respuesta es 500 para diagnóstico.
    const request = await nodeReqToFetchRequest(req);
    const response = await handler.fetch(request, {}, {});
    if (response.status >= 500) {
      console.error(`[server] SSR devolvió ${response.status} para ${req.method} ${pathname}`);
      const cloned = response.clone();
      try {
        const body = await cloned.text();
        console.error(`[server] body 500: ${body.slice(0, 500)}`);
      } catch {}
    }
    await fetchResponseToNodeRes(response, res);
  } catch (err) {
    console.error("[server] EXCEPTION procesando request:", err);
    console.error("[server] stack:", err?.stack);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/html; charset=utf-8");
    }
    res.end(`<h1>500 · Error interno</h1><pre>${String(err?.message || err).slice(0, 1000)}</pre>`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`✓ Moneta server arrancado en http://${HOST}:${PORT}`);
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`\nRecibido ${sig}, cerrando server…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
