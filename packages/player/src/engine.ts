export interface Playable {id:string;title:string;artist:string}
export type PlayerState='idle'|'resolving'|'playing'|'paused'|'blocked'|'error';
export class PlayerEngine {
 private generation=0;
 private controller?:AbortController;
 private listeners=new Set<()=>void>();
 state:PlayerState='idle';track?:Playable;error='';
 constructor(readonly audio:HTMLAudioElement){
  audio.preload='metadata';
  audio.addEventListener('play',()=>{this.state='playing';this.emit()});
  audio.addEventListener('pause',()=>{if(this.state==='playing'){this.state='paused';this.emit()}});
  audio.addEventListener('error',()=>{this.state='error';this.error='音频加载失败';this.emit()});
  audio.addEventListener('ended',()=>{this.state='paused';this.emit()});
 }
 subscribe=(callback:()=>void)=>{this.listeners.add(callback);return ()=>this.listeners.delete(callback)};
 private emit(){this.listeners.forEach(fn=>fn())}
 async select(track:Playable,resolve:(signal:AbortSignal)=>Promise<string>){
  const generation=++this.generation;this.controller?.abort();this.controller=new AbortController();
  this.audio.pause();this.audio.removeAttribute('src');this.audio.load();
  this.track=track;this.state='resolving';this.error='';this.emit();
  try{const url=await resolve(this.controller.signal);if(generation!==this.generation)return;
   this.audio.src=url;await this.audio.play();
   if(generation!==this.generation)return;
   this.state='playing';this.emit();
   if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist});navigator.mediaSession.setActionHandler('play',()=>void this.resume());navigator.mediaSession.setActionHandler('pause',()=>this.pause());navigator.mediaSession.setActionHandler('seekto',detail=>{if(detail.seekTime!==undefined)this.seek(detail.seekTime)})}
  }catch(error){if(generation!==this.generation)return;this.state=error instanceof DOMException&&error.name==='NotAllowedError'?'blocked':'error';this.error=String(error);this.emit()}
 }
 async resume(){try{await this.audio.play();this.state='playing';this.error='';this.emit()}catch(e){this.state='blocked';this.error=String(e);this.emit()}}
 pause(){this.audio.pause();this.state='paused';this.emit()}
 seek(time:number){if(Number.isFinite(time)&&time>=0&&Number.isFinite(this.audio.duration))this.audio.currentTime=Math.min(time,this.audio.duration)}
 setVolume(value:number){this.audio.volume=Math.max(0,Math.min(1,value))}
 reset(){++this.generation;this.controller?.abort();this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.track=undefined;this.state='idle';this.emit()}
}
let singleton:PlayerEngine|undefined;
export const player=()=>singleton??=new PlayerEngine(new Audio());
