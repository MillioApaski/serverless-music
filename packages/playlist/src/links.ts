import { AppError } from '../../core/src/index';
import type { MetadataPlatform } from './providers';

export const playlistPlatforms = ['wy', 'tx', 'kw', 'mg', 'qishui'] as const;
export type PlaylistPlatform = (typeof playlistPlatforms)[number];
const hosts: Record<PlaylistPlatform, readonly string[]> = {
  wy: ['music.163.com', 'y.music.163.com'],
  tx: ['y.qq.com', 'i.y.qq.com', 'music.qq.com'],
  kw: ['kuwo.cn', 'www.kuwo.cn', 'm.kuwo.cn'],
  mg: ['music.migu.cn', 'h5.nf.migu.cn'],
  qishui: ['qishui.com', 'www.qishui.com', 'music.douyin.com'],

};
const idPattern = /^\d{4,20}$/;

function invalid(message: string) {
  return new AppError('INVALID_INPUT', message, 422);
}

function publicUrl(input: string): URL {
  if (input.length > 2048) throw invalid('分享链接过长');
  const candidate = input.match(/https?:\/\/[^\s<>"‘’“”【】()（）]+/i)?.[0]?.replace(/[，。；、,;]+$/u, '');
  try {
    const url = new URL(candidate ?? '');
    if (url.username || url.password || url.port || !['https:', 'http:'].includes(url.protocol)) throw Error();
    return url;
  } catch {
    throw invalid('请粘贴有效的公开分享链接');
  }
}

export function playlistUrl(platform: PlaylistPlatform, id: string) {
  switch (platform) {
    case 'wy': return `https://music.163.com/playlist?id=${id}`;
    case 'tx': return `https://y.qq.com/n/ryqq/playlist/${id}`;
    case 'kw': return `https://www.kuwo.cn/playlist_detail/${id}`;
    case 'mg': return `https://h5.nf.migu.cn/app/v4/p/share/playlist/index.html?id=${id}`;
    case 'qishui': return `https://www.qishui.com/share/playlist?playlist_id=${id}`;
  }
}

function shortLink(url: URL): PlaylistPlatform | undefined {
  if (['163cn.tv', 'www.163cn.tv'].includes(url.hostname) && /^\/[\w-]+\/?$/.test(url.pathname)) return 'wy';
  if (['qishui.douyin.com', 'qishui.com', 'www.qishui.com'].includes(url.hostname) && /^\/s\/[\w-]+\/?$/.test(url.pathname)) return 'qishui';
  if (['c6.y.qq.com', 'c.y.qq.com', 'y.qq.com'].includes(url.hostname) &&
    url.pathname === '/base/fcgi-bin/u' && /^[\w-]+$/.test(url.searchParams.get('__') ?? '')) return 'tx';
}

function longLink(url: URL) {
  const platform = playlistPlatforms.find(item => hosts[item].includes(url.hostname));
  if (!platform) throw new AppError('UNSUPPORTED_PLATFORM', ['kugou.com','www.kugou.com','m.kugou.com'].includes(url.hostname)
    ? '酷狗完整歌单导入暂未接入，可使用 JSON 或 CSV 文件' : '暂不支持这个平台的公开链接', 422);
  const route = url.hash.startsWith('#/') ? new URL(url.origin + url.hash.slice(1)) : url;
  return { platform, route };
}

export function parsePlaylistLink(input: string) {
  const { platform, route } = longLink(publicUrl(input));
  const match = route.pathname.match(/\/(?:playlist|taoge|playsquare|playlist_detail)(?:_v\d+)?\/(\d{4,20})(?:\.html)?\/?$/i);
  const isPlaylistRoute = /\/(?:playlist|taoge|playsquare)(?:\.html|\/index\.html)?\/?$/i.test(route.pathname);
  const id = match?.[1] ?? (isPlaylistRoute
    ? route.searchParams.get('id') ?? route.searchParams.get('disstid') ?? route.searchParams.get('playlist_id') ?? route.searchParams.get('playlistId')
    : null);
  if (!id || !idPattern.test(id)) throw invalid('未识别到歌单 ID，请使用歌单分享链接');
  return { platform, id };
}

function parseProfile(url: URL) {
  const { platform, route } = longLink(url);
  if (platform !== 'wy' && platform !== 'tx') throw invalid('公开主页导入支持网易云音乐和 QQ 音乐');
  const id = platform === 'wy'
    ? /^\/(?:m\/)?user\/(?:home\/)?(\d{4,18})\/?$/.exec(route.pathname)?.[1]
      ?? (/^\/(?:m\/)?(?:user(?:\/home)?|home)\/?$/.test(route.pathname) ? route.searchParams.get('id') : null)
    : /\/(?:profile(?:\.html)?|homepage)(?:\/|$)/.test(route.pathname)
      ? route.searchParams.get('uin') ?? route.searchParams.get('hostuin') : null;
  if (!id || !idPattern.test(id)) throw invalid('未识别到用户 ID，请使用含 UID 或 QQ 号的公开主页链接');
  return { platform, id };
}

export function resolvePublicLink(input: string, kind: 'profile', signal: AbortSignal): Promise<{platform: MetadataPlatform; id: string}>;
export function resolvePublicLink(input: string, kind: 'playlist', signal: AbortSignal): Promise<{platform: PlaylistPlatform; id: string}>;
export async function resolvePublicLink(input: string, kind: 'playlist' | 'profile', signal: AbortSignal) {
  let url = publicUrl(input);
  const expected = shortLink(url);
  if (expected) {
    const unavailable = () => new AppError('SHORTLINK_UNAVAILABLE', '无法展开分享短链，请检查链接或粘贴平台长链接', 422);
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    for (let hop = 0; shortLink(url) === expected; hop++) {
      if (hop === 4) throw unavailable();
      url.protocol = 'https:';
      url.hash = '';
      let location: string | null = null;
      try {
        const response = await fetch(url, { redirect: 'manual', signal: timeout });
        if ([301, 302, 303, 307, 308].includes(response.status)) location = response.headers.get('location');
        if (response.body) await response.body.cancel();
        if (!location) throw unavailable();
        url = publicUrl(new URL(location, url).href);
      } catch {
        throw unavailable();
      }
      if (shortLink(url) !== expected && !hosts[expected].includes(url.hostname)) throw unavailable();
    }
  }
  return kind === 'profile' ? parseProfile(url) : parsePlaylistLink(url.href);
}
