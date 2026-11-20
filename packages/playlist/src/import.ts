import { z } from 'zod';
import { TrackSchema,AppError,type Track } from '../../core/src/index';
import { playlistPlatforms } from './links';
import { normalizeNeteaseTrack,type RawNeteaseSong } from './vendor/netease/normalize';
import { normalizeQQTrack,type RawQQSong } from './vendor/qqmusic/normalize';
const raw=z.record(z.string(),z.unknown());
export function normalizePlatformTrack(platform:'wy'|'tx',song:Record<string,unknown>,index:number):Track{
 const metadata=platform==='wy'?normalizeNeteaseTrack(song as RawNeteaseSong,index):normalizeQQTrack(song as RawQQSong,index);
 const id=(platform==='wy'?[song.id]:[song.songmid,song.mid,song.songid,song.id])
  .find(value=>(typeof value==='string'&&value.trim())||(typeof value==='number'&&Number.isSafeInteger(value)&&value>0));
 const nativeId=id===undefined?'':String(id).trim();
 const rawArtists=platform==='wy'?(song.ar??song.artists):song.singer;
 const artists=Array.isArray(rawArtists)?rawArtists.flatMap(value=>{
  const artist=raw.safeParse(value);
  if(!artist.success)return [];
  const name=artist.data.name??artist.data.title;
  return typeof name==='string'&&name.trim()?[name.trim()]:[];
 }):[];
 if(!nativeId)throw new AppError('MISSING_NATIVE_ID','歌曲缺少平台原生 ID',422);
 return TrackSchema.parse({id:`${platform}:${nativeId}`,title:metadata.title,artists:artists.length?artists:[metadata.artist||'未知歌手'],album:metadata.album||'',duration:metadata.durationMs===undefined?undefined:metadata.durationMs/1000,cover:metadata.coverUrl,isrc:metadata.isrc||(typeof song.isrc==='string'?song.isrc:undefined),identifiers:[{platform,id:nativeId,raw:song}]});
}
export const PlaylistSource = z.object({
 platform:z.enum(playlistPlatforms),
 id:z.string().regex(/^\d{4,20}$/),
 url:z.string().url(),
});
export type PlaylistSource = z.infer<typeof PlaylistSource>;
export const ImportFileSchema=z.object({name:z.string().min(1).max(200),platform:z.enum(['wy','tx','native']),tracks:z.array(raw).max(10000),source:PlaylistSource.optional()});
export function importFile(input:unknown){
 const file=ImportFileSchema.parse(input);const tracks:Track[]=[];const failures:{index:number;message:string}[]=[];
 const seen=new Set<string>();
 file.tracks.forEach((song,index)=>{try{
   const track=file.platform==='native'?TrackSchema.parse(song):normalizePlatformTrack(file.platform,song,index+1);
   if(!seen.has(track.id)){tracks.push(track);seen.add(track.id)}
 }catch{failures.push({index,message:'歌曲字段无效或缺少平台 ID'})}});
 return {name:file.name,source:file.source,tracks,failures,total:file.tracks.length,duplicates:file.tracks.length-tracks.length-failures.length};
}
export { parsePlaylistLink } from './links';
