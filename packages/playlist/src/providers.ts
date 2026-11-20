import { z } from 'zod';
import { AppError, type Track } from '../../core/src/index';
import { normalizePlatformTrack } from './import';

export const metadataPlatform = z.enum(['wy', 'tx']);
export type MetadataPlatform = z.infer<typeof metadataPlatform>;
export const metadataPlatforms = metadataPlatform.options;
export const searchPageSize = 20;
export const playlistPageSize = 100;
export const playlistTrackLimit = 10_000;
const wyOrigin = 'https://music.163.com';
const qqOrigin = 'https://c.y.qq.com';
const qqReferer = 'https://y.qq.com/';
const record = z.record(z.string(), z.unknown());
const trackId = z.union([z.string().regex(/^\d{1,18}$/), z.number().int().positive()]).transform(String);
const records = z.array(z.unknown());
const count = z.coerce.number().int().nonnegative();
const trackArray = z.array(record);

function upstreamError() {
  return new AppError('METADATA_UPSTREAM', '平台暂时未返回可用元数据，请重试', 502);
}

async function requestMetadata(origin: string, path: string, params: Record<string, string>, signal: AbortSignal) {
  const url = new URL(path, origin);
  url.search = new URLSearchParams(params).toString();
  try {
    const response = await fetch(url, {
      // Workers supports manual redirects. The status check below rejects any redirects.
      redirect: 'manual',
      headers: { accept: 'application/json', referer: origin === wyOrigin ? wyOrigin + '/' : qqReferer },
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok || !response.body) throw upstreamError();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) {
          await reader.cancel();
          throw upstreamError();
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
    } finally {
      reader.releaseLock();
    }
    return record.parse(JSON.parse(chunks.join('')));
  } catch {
    throw upstreamError();
  }
}

type SearchPage = { tracks: Track[]; hasMore: boolean };
export type PlaylistPage = {
  name: string;
  total: number;
  tracks: Track[];
  failures: { index: number; message: string }[];
  nextOffset: number | null;
};

export interface MetadataProvider {
  search(query: string, page: number, signal: AbortSignal): Promise<SearchPage>;
  getPlaylist(id: string, offset: number, signal: AbortSignal): Promise<PlaylistPage>;
}

function normalizeRows(platform: MetadataPlatform, songs: unknown[], offset: number) {
  const tracks: Track[] = [];
  const failures: PlaylistPage['failures'] = [];
  songs.forEach((song, index) => {
    try {
      tracks.push(normalizePlatformTrack(platform, record.parse(song), offset + index + 1));
    } catch {
      failures.push({ index: offset + index, message: '平台缺少有效的曲目资料或原生 ID' });
    }
  });
  return { tracks, failures };
}

function searchResult(platform: MetadataPlatform, songs: unknown[], total: number, page: number) {
  const offset = (page - 1) * searchPageSize;
  const matches = new Map(normalizeRows(platform, songs, offset).tracks.map(track => [track.id, track]));
  return { tracks: [...matches.values()], hasMore: songs.length > 0 && offset + songs.length < total };
}

function playlistResult(platform: MetadataPlatform, name: string, songs: unknown[], offset: number, total: number) {
  if (total > playlistTrackLimit) {
    throw new AppError('PLAYLIST_TOO_LARGE', '此歌单超过 10000 首曲目的导入上限', 422);
  }
  return {
    name: name.slice(0, 200), total, ...normalizeRows(platform, songs, offset),
    nextOffset: offset + songs.length < total ? offset + songs.length : null,
  };
}

const wySearch = z.object({
  songCount: count,
  songs: records.default([]),
});
const wyPlaylist = z.object({
  id: trackId,
  name: z.string().min(1),
  trackCount: count,
  trackIds: z.array(z.object({ id: trackId })).optional(),
  tracks: trackArray.default([]),
});
const qqSearch = z.object({
  data: z.object({ song: z.object({ totalnum: count, list: records.default([]) }) }),
});
const qqPlaylist = z.object({
  disstid: trackId,
  dissname: z.string().min(1),
  total_song_num: count.optional(),
  songnum: count.optional(),
  song_begin: count.optional(),
  songlist: records.default([]),
});

function missingPlaylist() {
  return new AppError('PLAYLIST_UNAVAILABLE', '歌单不存在、已设为私密，或平台限制了访问', 422);
}

function readPayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw upstreamError();
  return parsed.data;
}

const wy: MetadataProvider = {
  async search(query, page, signal) {
    const payload = await requestMetadata(wyOrigin, '/api/search/get', {
      s: query, type: '1', limit: String(searchPageSize), offset: String((page - 1) * searchPageSize),
    }, signal);
    if (payload.code !== 200) throw upstreamError();
    const found = readPayload(wySearch, payload.result);
    return searchResult('wy', found.songs, found.songCount, page);
  },
  async getPlaylist(id, offset, signal) {
    const payload = await requestMetadata(wyOrigin, '/api/v6/playlist/detail', { id }, signal);
    if (payload.code === 401 || payload.code === 403 || payload.code === 404 || payload.code === 20001) throw missingPlaylist();
    if (payload.code !== 200) throw upstreamError();
    const list = readPayload(wyPlaylist, payload.playlist);
    if (list.id !== id) throw upstreamError();

    const inline = new Map(list.tracks.map(song => [String(song.id), song]));
    const ids = list.trackIds?.map(track => track.id);
    if (ids?.length) {
      const pageIds = ids.slice(offset, offset + playlistPageSize);
      const missing = pageIds.filter(id => !inline.has(id));
      if (missing.length) {
        const detail = await requestMetadata(wyOrigin, '/api/song/detail', { ids: JSON.stringify(missing) }, signal);
        if (detail.code !== 200) throw upstreamError();
        for (const song of readPayload(trackArray, detail.songs)) inline.set(String(song.id), song);
      }
      return playlistResult('wy', list.name, pageIds.map(id => inline.get(id)), offset, ids.length);
    }
    if (list.trackCount > list.tracks.length) throw upstreamError();
    return playlistResult('wy', list.name, list.tracks.slice(offset, offset + playlistPageSize), offset, list.tracks.length);
  },
};

const tx: MetadataProvider = {
  async search(query, page, signal) {
    const payload = await requestMetadata(qqOrigin, '/soso/fcgi-bin/client_search_cp', {
      w: query, format: 'json', p: String(page), n: String(searchPageSize),
    }, signal);
    if (payload.code !== 0) throw upstreamError();
    const { song } = readPayload(qqSearch, payload).data;
    return searchResult('tx', song.list, song.totalnum, page);
  },
  async getPlaylist(id, offset, signal) {
    const payload = await requestMetadata(qqOrigin, '/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg', {
      type: '1', json: '1', utf8: '1', onlysong: '0', disstid: id, format: 'json',
      song_begin: String(offset), song_num: String(playlistPageSize),
    }, signal);
    if (payload.code !== 0) throw upstreamError();
    if (Array.isArray(payload.cdlist) && payload.cdlist.length === 0) throw missingPlaylist();
    const list = readPayload(z.array(qqPlaylist).min(1), payload.cdlist)[0];
    const total = list.total_song_num ?? list.songnum;
    if (list.disstid !== id || total === undefined || (list.song_begin !== undefined && list.song_begin !== offset)) throw upstreamError();
    if (offset < total && (!list.songlist.length || list.songlist.length > Math.min(playlistPageSize, total - offset))) throw upstreamError();
    return playlistResult('tx', list.dissname, list.songlist, offset, total);
  },
};

export const metadataProviders: Record<MetadataPlatform, MetadataProvider> = { wy, tx };
