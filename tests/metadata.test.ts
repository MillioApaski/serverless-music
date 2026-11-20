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

it('expands a QQ short link once and returns a canonical source for later pages', async () => {
  const fetcher = vi.fn(async (target: URL, init: RequestInit) => {
    expect(init.redirect).toBe('manual');
    if (target.hostname === 'c6.y.qq.com') {
      return Response.redirect('https://i.y.qq.com/n2/m/share/details/taoge.html?id=9138517540');
    }
    expect(target.hostname).toBe('c.y.qq.com');
    expect(target.searchParams.get('disstid')).toBe('9138517540');
    return Response.json({code: 0, cdlist: [{disstid: '9138517540', dissname: 'QQ sample', songnum: 0}]});
  });
  vi.stubGlobal('fetch', fetcher);
  const res = await post('/api/playlists/import', {url: '分享歌单 https://c6.y.qq.com/base/fcgi-bin/u?__=sample'});
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    source: {id: '9138517540', platform: 'tx', url: 'https://y.qq.com/n/ryqq/playlist/9138517540'},
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('rejects a short link redirect to a host outside the provider before the next request', async () => {
  const fetcher = vi.fn(async () => Response.redirect('https://example.com/playlist?id=12345'));
  vi.stubGlobal('fetch', fetcher);
  const res = await post('/api/playlists/import', {url: 'https://163cn.tv/sample'});
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({error: {code: 'SHORTLINK_UNAVAILABLE'}});
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('expands a NetEase profile short link and excludes private results without skipping the upstream offset', async () => {
  vi.stubGlobal('fetch', vi.fn(async (target: URL) => {
    if (target.hostname === '163cn.tv') return Response.redirect('https://y.music.163.com/m/user?id=1825474783');
    expect(target.pathname).toBe('/api/user/playlist/');
    expect(target.searchParams.get('uid')).toBe('1825474783');
    expect(target.searchParams.get('offset')).toBe('25');
    return Response.json({code: 200, more: true, playlist: [
      {id: 2756674066, name: '公开歌单', trackCount: 613, privacy: 0},
      {id: 2255852155, name: '私人歌单', trackCount: 27, privacy: 10},
    ]});
  }));
  const res = await post('/api/playlists/profile', {url: 'https://163cn.tv/sample', offset: 25});
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    playlists: [{id: '2756674066', name: '公开歌单', trackCount: 613}],
    nextOffset: 27,
  });
});

it('keeps the Migu page size, native song ID and exported playlist source', async () => {
  vi.stubGlobal('fetch', vi.fn(async (target: URL) => {
    expect(target.hostname).toBe('c.musicapp.migu.cn');
    if (target.pathname.includes('/song/')) {
      expect(target.searchParams.get('pageNo')).toBe('2');
      return Response.json({code: '000000', data: {totalCount: 51, songList: [{
        songId: '1004665871', songName: '推开世界的门', singerList: [{name: '杨乃文'}],
      }]}});
    }
    return Response.json({code: '000000', data: {musicListId: '236858196', title: '咪咕歌单'}});
  }));
  const response = await post('/api/playlists/import', {
    url: 'https://music.migu.cn/v5/#/playlist/236858196', offset: 50,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    source: {platform: 'mg', id: '236858196'}, total: 51, nextOffset: null,
    tracks: [{id: 'mg:1004665871', title: '推开世界的门'}],
  });
});

it('accepts a terminal Soda Music page that omits has_more and keeps 19-digit IDs exact', async () => {
  vi.stubGlobal('fetch', vi.fn(async (target: URL, init: RequestInit) => {
    expect(target.hostname).toBe('beta-luna.douyin.com');
    expect(JSON.parse(String(init.body))).toMatchObject({playlist_id: '7589791451954135055', cursor: '975'});
    return Response.json({
      playlist: {id: '7589791451954135055', title: '汽水歌单', count_tracks: 627, type: 2},
      next_cursor: '1000',
      media_resources: Array.from({length: 22}, (_, index) => ({
        entity: {track_wrapper: {track: {id: `76746546819838464${index + 10}`, name: '测试曲目', duration: 234000}}},
      })),
    });
  }));
  const response = await post('/api/playlists/import', {
    url: 'https://www.qishui.com/share/playlist?playlist_id=7589791451954135055',
    offset: 605, cursor: '975',
  });
  expect(response.status).toBe(200);
  const data = await response.json() as {tracks: Track[]};
  expect(data).toMatchObject({total: 627, nextOffset: null});
  expect(data.tracks).toHaveLength(22);
  expect(data.tracks[0]).toMatchObject({id: 'qishui:7674654681983846410', duration: 234});
});
