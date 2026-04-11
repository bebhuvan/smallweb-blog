// Cloudflare Worker serving static assets

// Security headers for all HTML responses.
// All fonts and styles are now self-hosted, so the CSP can be tight —
// no third-party origins are allowed.
const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
};

// Cache headers for static assets
const cacheHeaders = {
  js: 'public, max-age=31536000, immutable',
  css: 'public, max-age=31536000, immutable',
  woff2: 'public, max-age=31536000, immutable',
  svg: 'public, max-age=86400',
  png: 'public, max-age=86400',
  ico: 'public, max-age=86400',
  // HTML/XML should reflect feed refreshes immediately after deploys.
  html: 'no-cache, no-store, must-revalidate',
  xml: 'no-cache, no-store, must-revalidate',
};

function getCacheHeader(pathname) {
  const ext = pathname.split('.').pop()?.toLowerCase();
  return cacheHeaders[ext] || 'public, max-age=3600';
}

function getCacheHeaderForResponse(pathname, contentType) {
  if (contentType.includes('text/html')) return cacheHeaders.html;
  if (contentType.includes('xml')) return cacheHeaders.xml;
  return getCacheHeader(pathname);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // For all requests, fetch from static assets and add security headers
    let response = await env.ASSETS.fetch(request);

    // Handle clean URLs by falling back to /index.html
    if (response.status === 404 && !url.pathname.includes('.')) {
      const fallbackUrl = new URL(request.url);
      const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      fallbackUrl.pathname = `${basePath}index.html`;
      response = await env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));
    }
    const contentType = response.headers.get('Content-Type') || '';

    // Clone response and add headers
    const newHeaders = new Headers(response.headers);

    // HSTS + X-Content-Type-Options apply to every response.
    newHeaders.set('Strict-Transport-Security', securityHeaders['Strict-Transport-Security']);
    newHeaders.set('X-Content-Type-Options', securityHeaders['X-Content-Type-Options']);

    // Full security header set is meaningful only on HTML responses.
    if (contentType.includes('text/html')) {
      for (const [key, value] of Object.entries(securityHeaders)) {
        newHeaders.set(key, value);
      }
    }

    // Ensure the service worker updates promptly
    if (url.pathname === '/sw.js' || url.pathname === '/manifest.json') {
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // Add cache headers based on file type
      newHeaders.set('Cache-Control', getCacheHeaderForResponse(url.pathname, contentType));
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
