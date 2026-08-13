import { createServer } from "http";
import https from "https";
import { parse } from "url";
import next from "next";
import httpProxy from "http-proxy";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env.local and .env files (same as Next.js convention)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env.local") });
config({ path: resolve(__dirname, ".env") });

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// API proxy target (handles /api/*, /auth/*)
const apiTarget = process.env.API_URL || "http://localhost:8090";
const apiIsHttps = apiTarget.startsWith("https://");
const apiProxyOpts = {
  target: apiTarget,
  changeOrigin: true,
  ws: true,
  secure: true,
};
if (apiIsHttps) {
  const targetHost = new URL(apiTarget).hostname;
  apiProxyOpts.agent = new https.Agent({ servername: targetHost });
}
const apiProxy = httpProxy.createProxyServer(apiProxyOpts);
apiProxy.on("error", (err, req, res) => {
  console.error("[api-proxy] error:", err.message);
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
  }
  res.end(`Bad Gateway: ${err.message}`);
});

// Workspace proxy target (handles /proxy/*)
const proxyTarget = process.env.PROXY_URL || "http://localhost:8091";
const proxyIsHttps = proxyTarget.startsWith("https://");
const proxyProxyOpts = {
  target: proxyTarget,
  changeOrigin: true,
  ws: true,
  secure: true,
};
if (proxyIsHttps) {
  const targetHost = new URL(proxyTarget).hostname;
  proxyProxyOpts.agent = new https.Agent({ servername: targetHost });
}
const wsProxy = httpProxy.createProxyServer(proxyProxyOpts);
wsProxy.on("error", (err, req, res) => {
  console.error("[ws-proxy] error:", err.message);
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
  }
  res.end(`Bad Gateway: ${err.message}`);
});

// Extract /proxy/{namespace}/{name} prefix from a Referer header URL.
// Used to redirect "escaped" asset requests back through the workspace proxy.
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
  const referer = req.headers["referer"] || req.headers["Referer"];
  const fromReferer = extractProxyPrefixFromReferer(referer);
  if (fromReferer) return fromReferer;
  return extractProxyPrefixFromCookie(req.headers["cookie"]);
}

// Determine if a path is likely an "escaped" request from a proxied workspace
// rather than a legitimate frontend route.
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

console.log(`[dev-server] proxying /api/*, /auth/* → ${apiTarget}`);
console.log(`[dev-server] proxying /proxy/* → ${proxyTarget}`);

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // API routes: strip /api prefix and forward to API service
    if (pathname.startsWith("/api/") || pathname === "/api" ||
        pathname.startsWith("/auth/") || pathname === "/auth") {
      if (pathname.startsWith("/api/")) {
        req.url = req.url.replace(/^\/api/, "");
      } else if (pathname === "/api") {
        req.url = "/";
      }
      req.headers["x-forwarded-host"] = `${hostname}:${port}`;
      req.headers["x-forwarded-proto"] = "http";
      apiProxy.web(req, res);
      return;
    }

    // Proxy routes: forward directly to proxy service (no path stripping)
    if (pathname.startsWith("/proxy/")) {
      req.headers["x-forwarded-host"] = `${hostname}:${port}`;
      req.headers["x-forwarded-proto"] = "http";
      wsProxy.web(req, res);
      return;
    }

    // Check for "escaped" requests from proxied workspaces.
    // If Referer or cookie contains a proxy path, redirect the request back through the proxy.
    const proxyPrefix = getProxyPrefix(req);
    if (proxyPrefix && isEscapedProxyPath(pathname)) {
      // Rewrite URL to include proxy prefix and forward to proxy service
      req.url = proxyPrefix + req.url;
      req.headers["x-forwarded-host"] = `${hostname}:${port}`;
      req.headers["x-forwarded-proto"] = "http";
      wsProxy.web(req, res);
      return;
    }

    handle(req, res, parsedUrl);
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = req.url.split("?")[0];
    if (pathname.startsWith("/proxy/")) {
      req.headers["x-forwarded-host"] = `${hostname}:${port}`;
      wsProxy.ws(req, socket, head);
    } else if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) {
      if (pathname.startsWith("/api/")) {
        req.url = req.url.replace(/^\/api/, "");
      }
      req.headers["x-forwarded-host"] = `${hostname}:${port}`;
      apiProxy.ws(req, socket, head);
    } else {
      // Check for "escaped" WebSocket requests from proxied workspaces.
      // Uses Referer or kw-proxy-prefix cookie to determine target workspace.
      const proxyPrefix = getProxyPrefix(req);
      if (proxyPrefix && isEscapedProxyPath(pathname)) {
        req.url = proxyPrefix + req.url;
        req.headers["x-forwarded-host"] = `${hostname}:${port}`;
        wsProxy.ws(req, socket, head);
        return;
      }
      app.getUpgradeHandler()(req, socket, head);
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
