import { afterEach, expect, it, vi } from 'vitest';
import { app } from '../apps/worker/src/index';
import { compareTracks } from '../packages/playlist/src/match';
import type { Track } from '../packages/core/src/index';

const origin = 'http://localhost';
const post = (path: string, body: object) => app.request(origin + path, {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify(body),
}, { APP_ENV: 'local', DEV_IDENTITY: 'metadata-test' });
const wyTrack = (id: number) => ({ id, name: `Track ${id}`, ar: [{ name: 'A' }, { name: 'B' }], dt: 180000 });

afterEach(() => vi.unstubAllGlobals());

it('keeps healthy search results when a platform redirects and deduplicates by native ID', async () => {
  const fetcher = vi.fn(async (target: URL, init: RequestInit) => {
    expect(init.redirect).toBe('manual');
    if (target.hostname === 'c.y.qq.com') {
      return Response.redirect('https://elsewhere.example/redirect');
    }
    expect(target.hostname).toBe('music.163.com');
    expect(target.searchParams.get('s')).toBe('晴天 & 雨');
    expect(target.searchParams.get('offset')).toBe('20');
    return Response.json({ code: 200, result: { songCount: 50, songs: [wyTrack(1), wyTrack(1)] } });
  });
  vi.stubGlobal('fetch', fetcher);
  const response = await post('/api/metadata/search', { query: '晴天 & 雨', page: 2 });
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(await response.json()).toMatchObject({
    page: 2, results: [
      { platform: 'wy', tracks: [{ id: 'wy:1', artists: ['A', 'B'] }], hasMore: true },
      { platform: 'tx', tracks: [], hasMore: false, error: expect.any(String) },
    ],
  });
});

it('uses the QQ offset, reports malformed rows and rejects a mismatched offset', async () => {
  let returnedOffset = 100;
  vi.stubGlobal('fetch', vi.fn(async (target: URL) => {
    expect(target.hostname).toBe('c.y.qq.com');
    expect(target.searchParams.get('song_begin')).toBe('100');
    return Response.json({ code: 0, cdlist: [{
      disstid: '12345', dissname: 'QQ sample', songnum: 102, song_begin: returnedOffset,
      songlist: [{ songmid: 'validMid', songname: 'A' }, {}],
    }] });
  }));
  const input = { url: 'https://y.qq.com/n/ryqq/playlist/12345', offset: 100 };
  const ok = await post('/api/playlists/import', input);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toMatchObject({
    total: 102, nextOffset: null, failures: [{ index: 101 }], tracks: [{ id: 'tx:validMid' }],
  });
  returnedOffset = 0;
  expect((await post('/api/playlists/import', input)).status).toBe(502);
});

it('fills missing NetEase metadata and keeps the original playlist order', async () => {
  vi.stubGlobal('fetch', vi.fn(async (target: URL) => {
    expect(target.hostname).toBe('music.163.com');
    if (target.pathname === '/api/v6/playlist/detail') return Response.json({
      code: 200, playlist: { id: 12345, name: '网易云示例', trackCount: 3,
        trackIds: [{ id: 3 }, { id: 1 }, { id: 2 }], tracks: [wyTrack(1)] },
    });
    expect(target.pathname).toBe('/api/song/detail');
    expect(target.searchParams.get('ids')).toBe('["3","2"]');
    return Response.json({ code: 200, songs: [wyTrack(2), wyTrack(3)] });
  }));
  const response = await post('/api/playlists/import', { url: 'https://music.163.com/playlist?id=12345' });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    total: 3, nextOffset: null, tracks: [{ id: 'wy:3' }, { id: 'wy:1' }, { id: 'wy:2' }],
  });
});

it('uses native ID, ISRC and corroborating metadata while keeping versions separate', () => {
  const original: Track = {
    id: 'wy:1', title: 'Live Forever', artists: ['A', 'B'], album: 'First', duration: 210,
    identifiers: [{ platform: 'wy', id: '1' }],
  };
  const candidate: Track = {
    ...original, id: 'tx:2', artists: ['B', 'A'], duration: 211,
    identifiers: [{ platform: 'tx', id: '2' }],
  };
  expect(compareTracks(original, original)).toBe('identifier');
  expect(compareTracks(original, candidate)).toBe('likely');
  expect(compareTracks(original, { ...candidate, album: '' })).toBe('review');
  for (const suffix of ['Live', 'Remix', '伴奏', '翻唱', '重制']) {
    expect(compareTracks(original, { ...candidate, title: `Live Forever (${suffix})` })).toBe('different');
  }
  expect(compareTracks(original, { ...candidate, duration: 234 })).toBe('different');
  const withCode = { ...original, isrc: 'US-ABC-24-12345' };
  expect(compareTracks(withCode, { ...candidate, isrc: 'USABC2412345' })).toBe('isrc');
  expect(compareTracks(withCode, { ...candidate, isrc: 'USABC2412346' })).toBe('different');
});
