import type { Track } from '../../core/src/index';

const versionLabels = [
  ['live', /\blive\b|现场|演唱会/u],
  ['remix', /\bremix\b|混音/u],
  ['instrumental', /\b(?:instrumental|karaoke)\b|伴奏|纯音乐/u],
  ['cover', /\bcover\b|翻唱/u],
  ['remaster', /\bremaster(?:ed)?\b|重制|重录/u],
  ['acoustic', /\bacoustic\b|不插电/u],
  ['demo', /\bdemo\b|小样/u],
] as const;

function normalized(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function versions(title: string) {
  const text = title.normalize('NFKC').toLowerCase();
  const tags = [...text.matchAll(/\(([^()]*)\)|\[([^\[\]]*)\]|\s[-–—]\s(.+)$/g)]
    .map(match => match[1] ?? match[2] ?? match[3]).join(' ');
  return versionLabels.filter(([, pattern]) => pattern.test(tags)).map(([label]) => label).join(',');
}

function artistKey(artists: string[]) {
  return [...new Set(artists.map(normalized).filter(artist => artist && artist !== '未知歌手'))].sort().join('|');
}

function isrcKey(isrc?: string) {
  const value = isrc?.replace(/[-\s]/g, '').toUpperCase() ?? '';
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value) ? value : '';
}

export type TrackMatch = 'identifier' | 'isrc' | 'likely' | 'review' | 'different';

export function compareTracks(reference: Track, candidate: Track): TrackMatch {
  if (reference.identifiers.some(left =>
    candidate.identifiers.some(right => left.platform === right.platform && left.id === right.id),
  )) return 'identifier';

  const leftISRC = isrcKey(reference.isrc);
  const rightISRC = isrcKey(candidate.isrc);
  const durationGap = reference.duration && candidate.duration
    ? Math.abs(reference.duration - candidate.duration)
    : undefined;
  if (versions(reference.title) !== versions(candidate.title) ||
    (durationGap !== undefined && durationGap > 10) ||
    (leftISRC && rightISRC && leftISRC !== rightISRC)) return 'different';
  if (leftISRC && leftISRC === rightISRC) return 'isrc';

  const title = normalized(reference.title);
  const artists = artistKey(reference.artists);
  if (!title || title !== normalized(candidate.title) || !artists || artists !== artistKey(candidate.artists)) {
    return 'different';
  }
  const album = normalized(reference.album);
  if (durationGap !== undefined && durationGap <= 3 && album && album === normalized(candidate.album)) return 'likely';
  return 'review';
}
