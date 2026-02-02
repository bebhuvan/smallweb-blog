// Cloudflare Worker serving static assets

// Security headers for all HTML responses
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

// Cache headers for static assets
const cacheHeaders = {
  js: 'public, max-age=31536000, immutable',
  css: 'public, max-age=31536000, immutable',
  woff2: 'public, max-age=31536000, immutable',
  svg: 'public, max-age=86400',
  png: 'public, max-age=86400',
  ico: 'public, max-age=86400',
  html: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400',
  xml: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=21600, stale-if-error=21600',
};

function getCacheHeader(pathname) {
  const ext = pathname.split('.').pop()?.toLowerCase();
  return cacheHeaders[ext] || 'public, max-age=3600';
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

    // Add security headers to HTML responses
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
      newHeaders.set('Cache-Control', getCacheHeader(url.pathname));
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
