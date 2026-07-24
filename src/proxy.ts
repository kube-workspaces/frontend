import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to handle "escaped" requests from proxied workspace apps.
 *
 * When a workspace app (e.g. filebrowser) uses absolute paths like /static/js/app.js
 * or /api/login, the browser sends the request to the frontend host. The Referer header
 * still points to the proxy URL (e.g. /proxy/workspaces/cf-filebrowser-0/), so we
 * detect this and redirect the browser to the correct proxy path so nginx routes it to
 * the workspace pod via the proxy service.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never intercept Next.js internals
  if (pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  // Check Referer for a proxy path — this must run BEFORE the known-path check
  // because proxied apps may use paths like /api/login that collide with our routes.
  const referer = request.headers.get("referer");
  if (referer && pathname !== "/favicon.ico") {
    const proxyPrefix = extractProxyPrefix(referer);
    if (proxyPrefix) {
      // Don't redirect if the request is already going to the correct proxy path
      if (pathname.startsWith(proxyPrefix)) {
        return NextResponse.next();
      }
      // Don't redirect requests to OUR actual API endpoints that the frontend uses
      // (auth callbacks, workspace CRUD, etc.) — only redirect if it looks like a
      // workspace app's internal request. We distinguish by checking if the path
      // matches known kube-workspaces API patterns.
      if (isKubeWorkspacesApiPath(pathname)) {
        return NextResponse.next();
      }
      // Redirect to the proxy-prefixed URL so nginx routes it to the proxy service
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = proxyPrefix + pathname;
      return NextResponse.redirect(redirectUrl, 308);
    }
  }

  return NextResponse.next();
}

/**
 * Check if a path is a known kube-workspaces API/frontend path (not a proxied app path).
 */
function isKubeWorkspacesApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/healthz") ||
    pathname.startsWith("/api/openapi") ||
    pathname.startsWith("/api/godoc") ||
    pathname.startsWith("/proxy/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/workspaces") ||
    pathname.startsWith("/volumes") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/docs") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/profile") ||
    pathname === "/"
  );
}

/**
 * Extract /proxy/{namespace}/{name} prefix from a Referer URL.
 */
function extractProxyPrefix(referer: string): string | null {
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

export const config = {
  // Run middleware on all paths except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
