import test from 'node:test';
import assert from 'node:assert/strict';

import { createExcerpt, decodeHtmlEntities, stripHtml } from './html.js';
import { normalizeUrl, normalizeGuid } from './urls.js';
import { generatePostId, getPostKey, makeLookupKey, getLookupKeyForPost } from './dedupe.js';
import { createDateResolver } from './dates.js';

test('html helpers decode entities and strip markup', () => {
  assert.equal(decodeHtmlEntities('Tom &amp; Jerry &mdash; Fun'), 'Tom & Jerry \u2014 Fun');
  assert.equal(stripHtml('<p>Hello <strong>world</strong>&nbsp;</p>'), 'Hello world');
  assert.equal(createExcerpt('<p>Hello world</p>', 50), 'Hello world');
});

test('url helpers normalize tracking params, hash, and trailing slash', () => {
  const normalized = normalizeUrl(
    'https://example.com/path/?utm_source=x&ref=foo&keep=1#section',
    undefined
  );
  assert.equal(normalized, 'https://example.com/path?keep=1');

  assert.equal(
    normalizeUrl('/post/?utm_medium=email&x=1', 'https://example.com/blog/'),
    'https://example.com/post?x=1'
  );

  assert.equal(
    normalizeGuid('https://example.com/a/?utm_campaign=z#hash'),
    'https://example.com/a'
  );
});

test('dedupe helpers produce stable keys and ids', () => {
  const key = getPostKey({
    link: 'https://example.com/post/?utm_source=newsletter',
    guid: 'guid-123',
    title: 'Ignored because link exists',
  });
  assert.equal(key, 'https://example.com/post');

  assert.equal(makeLookupKey('blog1', key), 'blog1::https://example.com/post');
  assert.equal(
    getLookupKeyForPost({ blogId: 'blog1', link: 'https://example.com/post/', title: 'Title', id: 'id1' }),
    'blog1::https://example.com/post'
  );

  assert.equal(generatePostId('blog1', key), generatePostId('blog1', key));
});

test('date resolver prefers inferred link date when recent primary looks wrong', () => {
  const resolver = createDateResolver({
    maxFutureDays: 2,
    recentPrimaryDays: 7,
    inferredDateMaxDiffDays: 30,
  });
  const nowMs = Date.parse('2026-02-25T00:00:00.000Z');
  const result = resolver.resolvePostDate(
    {
      pubDate: '2026-02-24T00:00:00.000Z',
      link: 'https://example.com/2025/12/15/post-title',
    },
    {},
    { url: 'https://example.com' },
    0,
    null,
    nowMs
  );

  assert.equal(result, '2025-12-15T00:00:00.000Z');
});

test('date resolver falls back to existing date when primary is too far in the future', () => {
  const resolver = createDateResolver({ maxFutureDays: 2 });
  const nowMs = Date.parse('2026-02-25T00:00:00.000Z');
  const result = resolver.resolvePostDate(
    {
      pubDate: '2026-03-20T00:00:00.000Z',
      link: 'https://example.com/post',
    },
    {},
    { url: 'https://example.com' },
    0,
    '2026-02-20T00:00:00.000Z',
    nowMs
  );

  assert.equal(result, '2026-02-20T00:00:00.000Z');
});

test('date resolver can synthesize fallback dates for feeds that allow missing dates', () => {
  const resolver = createDateResolver({ maxFutureDays: 2 });
  const nowMs = Date.parse('2026-02-25T10:00:00.000Z');
  const result = resolver.resolvePostDate(
    {
      title: 'No date item',
      link: 'https://example.com/no-date',
    },
    {
      lastBuildDate: '2026-02-25T09:00:00.000Z',
    },
    {
      url: 'https://example.com',
      allowMissingDates: true,
    },
    3,
    null,
    nowMs
  );

  assert.equal(result, '2026-02-25T08:57:00.000Z');
});

