// Cloudflare Worker with Static Assets + RSS Proxy API

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
  html: 'public, max-age=0, must-revalidate',
  xml: 'public, max-age=3600',
};

function getCacheHeader(pathname) {
  const ext = pathname.split('.').pop()?.toLowerCase();
  return cacheHeaders[ext] || 'public, max-age=3600';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle RSS proxy API route
    if (url.pathname === '/api/fetch-rss') {
      return handleRssProxy(request);
    }

    // For all other requests, fetch from static assets and add security headers
    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('Content-Type') || '';

    // Clone response and add headers
    const newHeaders = new Headers(response.headers);

    // Add security headers to HTML responses
    if (contentType.includes('text/html')) {
      for (const [key, value] of Object.entries(securityHeaders)) {
        newHeaders.set(key, value);
      }
    }

    // Add cache headers based on file type
    newHeaders.set('Cache-Control', getCacheHeader(url.pathname));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};

async function handleRssProxy(request) {
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const feedUrl = url.searchParams.get('url');
  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing feed URL parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    console.log(`Fetching RSS feed: ${feedUrl}`);

    const feedResponse = await fetch(feedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    if (!feedResponse.ok) {
      console.error(`Feed fetch failed: ${feedResponse.status} ${feedResponse.statusText}`);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch RSS feed',
          status: feedResponse.status,
          statusText: feedResponse.statusText,
          url: feedUrl,
        }),
        {
          status: feedResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const content = await feedResponse.text();
    console.log(`Successfully fetched ${content.length} bytes from ${feedUrl}`);

    return new Response(content, {
      headers: {
        'Content-Type': feedResponse.headers.get('Content-Type') || 'application/xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error(`RSS proxy error for ${feedUrl}:`, error);
    return new Response(
      JSON.stringify({
        error: 'RSS fetch failed',
        details: error.message,
        url: feedUrl,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
