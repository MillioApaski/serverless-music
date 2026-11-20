import { z } from 'zod';
import { TrackSchema,AppError,type Track } from '../../core/src/index';
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
export const ImportFileSchema=z.object({name:z.string().min(1).max(200),platform:z.enum(['wy','tx','native']),tracks:z.array(raw).max(10000)});
export function importFile(input:unknown){
 const file=ImportFileSchema.parse(input);const tracks:Track[]=[];const failures:{index:number;message:string}[]=[];
 const seen=new Set<string>();
 file.tracks.forEach((song,index)=>{try{
   const track=file.platform==='native'?TrackSchema.parse(song):normalizePlatformTrack(file.platform,song,index+1);
   if(!seen.has(track.id)){tracks.push(track);seen.add(track.id)}
 }catch{failures.push({index,message:'歌曲字段无效或缺少平台 ID'})}});
 return {name:file.name,tracks,failures,total:file.tracks.length,duplicates:file.tracks.length-tracks.length-failures.length};
}
export function parsePlaylistLink(input:string){
 if(input.length>2048)throw new AppError('INVALID_INPUT','链接过长');
 const candidate=input.match(/https?:\/\/[^\s)）]+/)?.[0];
 if(!candidate)throw new AppError('INVALID_INPUT','请粘贴公开歌单链接');
 let url:URL;try{url=new URL(candidate.replace(/#\/?/,'/'))}catch{throw new AppError('INVALID_INPUT','链接无效')}
 if(url.username||url.password||!['https:','http:'].includes(url.protocol))throw new AppError('INVALID_INPUT','链接无效');
 let platform:'wy'|'tx';
 if(['music.163.com','y.music.163.com'].includes(url.hostname))platform='wy';
 else if(['y.qq.com','i.y.qq.com','music.qq.com'].includes(url.hostname))platform='tx';
 else throw new AppError('UNSUPPORTED_PLATFORM','目前支持网易云和 QQ 音乐的标准歌单链接',422);
 if(/\/user|\/home/.test(url.pathname))throw new AppError('INVALID_INPUT','请使用歌单链接');
 const id=url.pathname.match(/\/(?:playlist|taoge|playsquare)\/(\d{4,18})(?:\/|$)/)?.[1] || (/playlist|taoge|playsquare/.test(url.pathname)?url.searchParams.get('id'):null);
 if(!id||!/^\d{4,18}$/.test(id))throw new AppError('INVALID_INPUT','未识别到歌单 ID');
 return {platform,id};
}
