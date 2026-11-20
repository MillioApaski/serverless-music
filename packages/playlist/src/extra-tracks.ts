import { z } from 'zod';
import { TrackSchema } from '../../core/src/index';

const nativeId = z.union([z.string().min(1), z.number().int().positive()]).transform(String);
const artistNames = z.array(z.object({ name: z.string() })).nullish();
const durationInSeconds = z.number().nonnegative().nullish();
const kuwoSong = z.object({
  rid: nativeId, name: z.string(), artist: z.string().nullish(), album: z.string().nullish(),
  duration: durationInSeconds, pic: z.string().nullish(),
});
const miguSong = z.object({
  songId: nativeId, songName: z.string(), singerList: artistNames, album: z.string().nullish(),
  duration: durationInSeconds, img2: z.string().nullish(),
});
const qishuiSong = z.object({
  entity: z.object({ track_wrapper: z.object({ track: z.object({
    id: nativeId, name: z.string(), artists: artistNames, duration: durationInSeconds,
    album: z.object({ name: z.string() }).nullish(),
  }) }) }),
});

function imageUrl(value?: string | null) {
  return value && /^https?:\/\//.test(value) ? value : undefined;
}

export function normalizeExtraTrack(platform: 'kw' | 'mg' | 'qishui', raw: Record<string, unknown>) {
  let id: string;
  let title: string;
  let artists: string[];
  let album: string | null | undefined;
  let duration: number | null | undefined;
  let cover: string | undefined;
  if (platform === 'kw') {
    const song = kuwoSong.parse(raw);
    id = song.rid;
    title = song.name;
    artists = song.artist?.split('&') ?? [];
    album = song.album;
    duration = song.duration;
    cover = imageUrl(song.pic);
  } else if (platform === 'mg') {
    const song = miguSong.parse(raw);
    id = song.songId;
    title = song.songName;
    artists = song.singerList?.map(artist => artist.name) ?? [];
    album = song.album;
    duration = song.duration;
    cover = imageUrl(song.img2?.startsWith('/data/') ? 'https://d.musicapp.migu.cn' + song.img2 : song.img2);
  } else {
    const { track } = qishuiSong.parse(raw).entity.track_wrapper;
    id = track.id;
    title = track.name;
    artists = track.artists?.map(artist => artist.name) ?? [];
    album = track.album?.name;
    duration = track.duration == null ? undefined : track.duration / 1000;
  }
  artists = artists.map(artist => artist.trim()).filter(Boolean);
  return TrackSchema.parse({
    id: `${platform}:${id}`, title: title.trim(), album: album ?? '', duration: duration ?? undefined, cover,
    artists: artists.length ? artists : ['未知歌手'], identifiers: [{ platform, id, raw }],
  });
}
