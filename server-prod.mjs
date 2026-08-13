// Production server wrapper for kube-workspaces frontend.
// Starts the Next.js standalone server on an internal port, then wraps it
// with a front proxy that handles:
// - /proxy/* forwarding to the workspace proxy service
// - Escaped request recovery (e.g. /websockify) using Referer header
// - WebSocket upgrade for both proxied and escaped paths
import { createServer } from "http";
import { spawn } from "child_process";
import https from "https";
import { dirname } from "path";
import { fileURLToPath } from "url";
import httpProxy from "http-proxy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const nextPort = port + 1; // Internal port for Next.js

// Proxy target for workspace proxy service
const proxyTarget = process.env.PROXY_URL || "http://localhost:8091";
const proxyIsHttps = proxyTarget.startsWith("https://");
const proxyOpts = {
  target: proxyTarget,
  changeOrigin: true,
  ws: true,
  secure: true,
};
if (proxyIsHttps) {
  const targetHost = new URL(proxyTarget).hostname;
  proxyOpts.agent = new https.Agent({ servername: targetHost });
}
const wsProxy = httpProxy.createProxyServer(proxyOpts);
wsProxy.on("error", (err, req, res) => {
  console.error("[ws-proxy] error:", err.message);
  if (res && !res.headersSent && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Bad Gateway: ${err.message}`);
  }
});

// Proxy to internal Next.js server
const nextProxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${nextPort}`,
  ws: true,
});
nextProxy.on("error", (err, req, res) => {
  console.error("[next-proxy] error:", err.message);
  if (res && !res.headersSent && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Bad Gateway: ${err.message}`);
  }
});

// Extract /proxy/{namespace}/{name} prefix from a Referer header URL.
function extractProxyPrefixFromReferer(referer) {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const match = url.pathname.match(/\/proxy\/([^/]+)\/([^/]+)/);
    if (match) {
      return `/proxy/${match[1]}/${match[2]}`;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// Extract proxy prefix from the kw-proxy-prefix cookie.
// Set by the proxy service when serving HTML pages.
function extractProxyPrefixFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/kw-proxy-prefix=(\/proxy\/[^/]+\/[^/;]+)/);
  if (match) {
    return match[1];
  }
  return null;
}

// Get proxy prefix from request headers (Referer or cookie fallback).
function getProxyPrefix(req) {
  const referer = req.headers["referer"];
  const fromReferer = extractProxyPrefixFromReferer(referer);
  if (fromReferer) return fromReferer;
  return extractProxyPrefixFromCookie(req.headers["cookie"]);
}

// Determine if a path is likely an "escaped" request from a proxied workspace
// rather than a legitimate frontend route. We use a blocklist of known frontend
// path prefixes — anything else is assumed to be an escaped workspace request.
const FRONTEND_PATH_PREFIXES = [
  "/workspaces", "/admin", "/auth", "/api", "/login",
  "/volumes", "/profile",
  "/_next", "/favicon", "/manifest", "/sw.js",
  "/images", "/icons",
  "/icon-192.png", "/icon-512.png", "/icon-maskable.png",
  "/icon.svg", "/apple-touch-icon.png",
];
function isEscapedProxyPath(pathname) {
  if (pathname === "/" || pathname === "") return false;
  for (const prefix of FRONTEND_PATH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + ".")) {
      return false;
    }
  }
  return true;
}

// Start the Next.js standalone server on the internal port
const nextEnv = { ...process.env, PORT: String(nextPort), HOSTNAME: "127.0.0.1" };
const nextProc = spawn("node", ["server.js"], {
  cwd: __dirname,
  env: nextEnv,
  stdio: ["ignore", "pipe", "inherit"],
});

// Wait for Next.js to be ready by watching its stdout
let nextReady = false;
const readyPromise = new Promise((resolve) => {
  nextProc.stdout.on("data", (data) => {
    const msg = data.toString();
    if (!nextReady) {
      process.stdout.write(msg);
    }
    if (msg.includes("Ready") || msg.includes("Listening")) {
      nextReady = true;
      resolve();
    }
  });
  // Fallback: resolve after 5s even if we don't see the ready message
  setTimeout(resolve, 5000);
});

nextProc.on("exit", (code) => {
  console.error(`Next.js server exited with code ${code}`);
  process.exit(code || 1);
});

// Handle SIGTERM/SIGINT gracefully
function shutdown() {
  nextProc.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

readyPromise.then(() => {
  const server = createServer((req, res) => {
    const pathname = req.url.split("?")[0];

    // No-op ServiceWorker for proxied apps that try to register one at root scope
    if (pathname === "/sw.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Service-Worker-Allowed": "/",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      res.end("// no-op service worker for proxied workspaces\nself.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));\n");
      return;
    }

    // Proxy routes: forward directly to workspace proxy service
    if (pathname.startsWith("/proxy/")) {
      req.headers["x-forwarded-host"] = req.headers.host || `${hostname}:${port}`;
      req.headers["x-forwarded-proto"] = "https";
      wsProxy.web(req, res);
      return;
    }

    // Check for "escaped" requests from proxied workspaces.
    // Only forward if the path doesn't look like a frontend route.
    // Frontend routes: /, /_next/*, /workspaces*, /admin*, /auth*, /api*, /favicon*, etc.
    const proxyPrefix = getProxyPrefix(req);
    if (proxyPrefix && isEscapedProxyPath(pathname)) {
      req.url = proxyPrefix + req.url;
      req.headers["x-forwarded-host"] = req.headers.host || `${hostname}:${port}`;
      req.headers["x-forwarded-proto"] = "https";
      wsProxy.web(req, res);
      return;
    }

    // Everything else goes to Next.js
    nextProxy.web(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = req.url.split("?")[0];

    if (pathname.startsWith("/proxy/")) {
      req.headers["x-forwarded-host"] = req.headers.host || `${hostname}:${port}`;
      wsProxy.ws(req, socket, head);
      return;
    }

    // Escaped WebSocket (e.g. /websockify from KasmVNC)
    const proxyPrefix = getProxyPrefix(req);
    if (proxyPrefix && isEscapedProxyPath(pathname)) {
      req.url = proxyPrefix + req.url;
      req.headers["x-forwarded-host"] = req.headers.host || `${hostname}:${port}`;
      wsProxy.ws(req, socket, head);
      return;
    }

    // Next.js WebSocket
    nextProxy.ws(req, socket, head);
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`  Next.js on internal port ${nextPort}`);
    console.log(`  proxying /proxy/* → ${proxyTarget}`);
  });
});
