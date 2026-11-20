import { z } from 'zod';
import { AppError, type Track } from '../../core/src/index';
import { normalizePlatformTrack } from './import';
import { normalizeExtraTrack } from './extra-tracks';
import { playlistUrl, type PlaylistPlatform } from './links';

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
const trackId = z.union([z.string().regex(/^\d{1,20}$/), z.number().int().positive()]).transform(String);
const records = z.array(z.unknown());
const count = z.coerce.number().int().nonnegative();
const trackArray = z.array(record);

function upstreamError() {
  return new AppError('METADATA_UPSTREAM', '平台暂时未返回可用元数据，请重试', 502);
}

async function requestMetadata(origin: string, path: string, params: Record<string, string>, signal: AbortSignal, referer = origin === qqOrigin ? qqReferer : origin + '/', payload?: object) {
  const url = new URL(path, origin);
  url.search = new URLSearchParams(params).toString();
  try {
    const response = await fetch(url, {
      // Workers supports manual redirects. The status check below rejects any redirects.
      redirect: 'manual',
      method: payload ? 'POST' : 'GET',
      headers: payload ? { accept: 'application/json', referer, 'content-type': 'application/json' } : { accept: 'application/json', referer },
      body: payload ? JSON.stringify(payload) : undefined,
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
  nextCursor?: string;
};

export const profilePageSize = 25;
export type ProfilePage = {
  playlists: { id: string; name: string; url: string; trackCount: number }[];
  nextOffset: number | null;
};

export interface MetadataProvider {
  search(query: string, page: number, signal: AbortSignal): Promise<SearchPage>;
  getUserPlaylists(id: string, offset: number, signal: AbortSignal): Promise<ProfilePage>;
  getPlaylist(id: string, offset: number, signal: AbortSignal): Promise<PlaylistPage>;
}

function normalizeRows(platform: PlaylistPlatform, songs: unknown[], offset: number) {
  const tracks: Track[] = [];
  const failures: PlaylistPage['failures'] = [];
  songs.forEach((song, index) => {
    try {
      const raw = record.parse(song);
      tracks.push(platform === 'wy' || platform === 'tx'
        ? normalizePlatformTrack(platform, raw, offset + index + 1)
        : normalizeExtraTrack(platform, raw));
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

function playlistResult(platform: PlaylistPlatform, name: string, songs: unknown[], offset: number, total: number) {
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

const profileItem = z.object({ id: trackId, name: z.string(), trackCount: count, privacy: count.optional() });
const qqProfileItem = z.object({ tid: trackId, diss_name: z.string(), song_cnt: count, dir_show: count.optional() });
const wyProfile = z.object({ playlist: records, more: z.boolean() });
const qqProfile = z.object({ disslist: records, totoal: count.optional(), total: count.optional() });

function summary(platform: MetadataPlatform, id: string, name: string, trackCount: number) {
  return { id, name: name.trim().slice(0, 200) || `歌单 ${id}`, url: playlistUrl(platform, id), trackCount };
}

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
  async getUserPlaylists(id, offset, signal) {
    const payload = await requestMetadata(wyOrigin, '/api/user/playlist/', {
      uid: id, offset: String(offset), limit: String(profilePageSize),
    }, signal);
    if (payload.code !== 200) throw upstreamError();
    const { playlist, more } = readPayload(wyProfile, payload);
    const page = playlist.slice(0, profilePageSize);
    return {
      playlists: page.flatMap(raw => {
        const item = profileItem.safeParse(raw);
        if (!item.success || item.data.privacy) return [];
        const { id, name, trackCount } = item.data;
        return [summary('wy', id, name, trackCount)];
      }),
      nextOffset: (more || playlist.length > page.length) && page.length ? offset + page.length : null,
    };
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
  async getUserPlaylists(id, offset, signal) {
    const payload = await requestMetadata(qqOrigin, '/rsc/fcgi-bin/fcg_user_created_diss', {
      hostuin: id, sin: String(offset), size: String(profilePageSize), format: 'json',
    }, signal);
    if (payload.code !== 0) throw upstreamError();
    const { disslist, totoal, total } = readPayload(qqProfile, payload.data);
    const page = disslist.slice(0, profilePageSize);
    const reported = total ?? totoal;
    const more = reported === undefined ? page.length === profilePageSize : offset + page.length < reported;
    return {
      playlists: page.flatMap(raw => {
        const item = qqProfileItem.safeParse(raw);
        if (!item.success || item.data.dir_show === 0 || item.data.tid === '0') return [];
        const { tid, diss_name, song_cnt } = item.data;
        return [summary('tx', tid, diss_name, song_cnt)];
      }),
      nextOffset: more && page.length ? offset + page.length : null,
    };
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

const kuwoPayload = z.object({ id: trackId, name: z.string().min(1), total: count, musicList: records });
const miguDetails = z.object({ musicListId: trackId, title: z.string().min(1) });
const miguPayload = z.object({ totalCount: count, songList: records });
const qishuiDetails = z.object({ id: trackId, title: z.string().min(1), count_tracks: count, type: count.optional() });
const qishuiPayload = z.object({
  playlist: qishuiDetails, has_more: z.boolean().default(false), next_cursor: z.union([z.string(), z.number()]).nullish(),
  media_resources: records.default([]),
});

function fixedPage(offset: number, size: number, total: number, received: number) {
  if (offset % size !== 0 || received !== Math.min(size, Math.max(total - offset, 0))) throw upstreamError();
}

export async function getPublicPlaylist(
  platform: PlaylistPlatform, id: string, offset: number, signal: AbortSignal, cursor?: string,
): Promise<PlaylistPage> {
  switch (platform) {
    case 'wy':
    case 'tx':
      return metadataProviders[platform].getPlaylist(id, offset, signal);
    case 'kw': {
      const origin = 'https://m.kuwo.cn';
      const payload = await requestMetadata(origin, '/newh5app/wapi/api/www/playlist/playListInfo', {
        pid: id, pn: String(Math.floor(offset / playlistPageSize) + 1), rn: String(playlistPageSize),
      }, signal, origin + '/newh5app/playlist_detail/' + id);
      if (payload.code !== 200) throw missingPlaylist();
      const list = readPayload(kuwoPayload, payload.data);
      if (list.id !== id) throw upstreamError();
      fixedPage(offset, playlistPageSize, list.total, list.musicList.length);
      return playlistResult(platform, list.name, list.musicList, offset, list.total);
    }
    case 'mg': {
      const size = 50;
      const origin = 'https://c.musicapp.migu.cn';
      const referer = 'https://h5.nf.migu.cn/';
      const [metadata, page] = await Promise.all([
        requestMetadata(origin, '/MIGUM3.0/resource/playlist/v2.0', { playlistId: id }, signal, referer),
        requestMetadata(origin, '/MIGUM3.0/resource/playlist/song/v2.0', {
          playlistId: id, pageNo: String(Math.floor(offset / size) + 1), pageSize: String(size),
        }, signal, referer),
      ]);
      if (metadata.code !== '000000') throw missingPlaylist();
      if (page.code !== '000000') throw upstreamError();
      const info = readPayload(miguDetails, metadata.data);
      const list = readPayload(miguPayload, page.data);
      if (info.musicListId !== id) throw upstreamError();
      fixedPage(offset, size, list.totalCount, list.songList.length);
      return playlistResult(platform, info.title, list.songList, offset, list.totalCount);
    }
    case 'qishui': {
      if (offset && !cursor) throw new AppError('INVALID_INPUT', '请从歌单首页开始导入', 422);
      const payload = await requestMetadata('https://beta-luna.douyin.com', '/luna/playlist/detail', {}, signal,
        'https://www.qishui.com/', { playlist_id: id, cursor: cursor ?? '0', count: 25 });
      const list = readPayload(qishuiPayload, payload);
      const info = list.playlist;
      if (info.id !== id) throw upstreamError();
      if (info.type === 4) throw new AppError('PLAYLIST_UNAVAILABLE', '此汽水歌单来自抖音收藏，平台未提供完整曲目', 422);
      const end = offset + list.media_resources.length;
      const nextCursor = list.next_cursor == null ? '' : String(list.next_cursor);
      if (end > info.count_tracks || (list.has_more !== (end < info.count_tracks)) ||
        (list.has_more && (!list.media_resources.length || !nextCursor || nextCursor === (cursor ?? '0')))) {
        throw upstreamError();
      }
      const page = playlistResult(platform, info.title, list.media_resources, offset, info.count_tracks);
      return list.has_more ? { ...page, nextCursor } : page;
    }
  }
}
