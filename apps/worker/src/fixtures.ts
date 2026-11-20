import { testTracks, type TestTrack } from '../../../packages/core/src/test-tracks';
import { sha256,type Source,AppError } from '../../../packages/core/src/index';
export const sourceScript=`/** @name Owned PoC source\n * @version 0.0.1\n * @author Serverless Music */
const {EVENT_NAMES,on,send,request}=lx;
on(EVENT_NAMES.request,({source,action,info})=>new Promise((resolve,reject)=>{
 request(info.musicInfo.endpoint,{method:'GET'},(err,resp)=>{if(err)return reject(err);if(resp.statusCode!==200)return reject(new Error('upstream'));resolve(resp.body.url);});
}));
send(EVENT_NAMES.inited,{sources:{local:{name:'自有测试音源',type:'music',actions:['musicUrl'],qualitys:[]}}});`;
export async function fixtureManifest():Promise<Source>{return {id:'poc-owned',name:'自有测试音源',version:'0.0.1',scriptUrl:'/api/fixtures/source.js',sha256:await sha256(sourceScript),enabled:true,supportedPlatforms:['local'],supportedQualities:[],supportedActions:['musicUrl'],allowedHosts:[],priority:1,healthStatus:'untested',updatedAt:'2026-11-17T00:00:00Z',checkedAt:null,license:'MIT',authorization:'项目自行生成的测试旋律；不代表第三方音乐平台可用性'}}
// Procedural PCM fixture: each response chunk is generated independently, including byte ranges.
const sampleRate = 16000;
const melodies = {
  glow: { notes: [261.63, 329.63, 392, 493.88, 440, 392, 329.63, 293.66], beatSeconds: .6, decay: 7 },
  dusk: { notes: [659.25, 523.25, 440, 349.23, 392, 440, 523.25, 329.63], beatSeconds: .375, decay: 4 },
};

function header(total: number) {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  const str = (value: string, offset: number) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  str('RIFF', 0);
  view.setUint32(4, total - 8, true);
  str('WAVEfmt ', 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str('data', 36);
  view.setUint32(40, total - 44, true);
  return bytes;
}

function byteAt(offset: number, wavHeader: Uint8Array, melody: (typeof melodies)[TestTrack['id']]) {
  if (offset < wavHeader.length) return wavHeader[offset];
  const index = Math.floor((offset - wavHeader.length) / 2);
  const time = index / sampleRate;
  const { notes, beatSeconds, decay } = melody;
  const beat = time % beatSeconds;
  const frequency = notes[Math.floor(time / beatSeconds) % notes.length];
  const value = Math.round(7500 * Math.sin(2 * Math.PI * frequency * time) * Math.exp(-beat * decay) * Math.min(time * 8, 1));
  return ((offset - wavHeader.length) % 2 ? value >> 8 : value) & 255;
}

export function toneResponse(request: Request, track: TestTrack = testTracks[0]) {
 const total = 44 + sampleRate * track.duration * 2;
 const melody = melodies[track.id];
 const range=request.headers.get('range');let start=0,end=total-1,status=200;
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'content-range':`bytes */${total}`}});
 if(!m[1]){start=Math.max(0,total-Number(m[2]))}else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]))}
 if(start>end||start>=total||!Number.isSafeInteger(start))return new Response(null,{status:416,headers:{'content-range':`bytes */${total}`}});status=206}
 const headers=new Headers({'content-type':'audio/wav','content-length':String(end-start+1),'accept-ranges':'bytes','cache-control':'private, no-store'});if(status===206)headers.set('content-range',`bytes ${start}-${end}/${total}`);
 if(request.method==='HEAD')return new Response(null,{status,headers});
 const h=header(total);let position=start;
 return new Response(new ReadableStream({pull(controller){if(request.signal.aborted){controller.error(new AppError('CANCELLED','已取消'));return}if(position>end){controller.close();return}const chunk=new Uint8Array(Math.min(8192,end-position+1));for(let i=0;i<chunk.length;i++)chunk[i]=byteAt(position+i,h,melody);position+=chunk.length;controller.enqueue(chunk)}}),{status,headers});
}
