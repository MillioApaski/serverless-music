import {mkdir,writeFile} from 'node:fs/promises';
import {SourceRuntime} from '../packages/source-runtime/src/runtime';
import {sourceScript} from '../apps/worker/src/fixtures';
const start=performance.now();
const bridge=async()=>({statusCode:200,headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://owned.example/song.wav'})});
const runtime=await SourceRuntime.create(sourceScript,bridge);const initMs=performance.now()-start;
const input={source:'local',action:'musicUrl',info:{musicInfo:{endpoint:'https://owned.example/resolve'}}};
try{
 await runtime.request(input);const before=runtime.memory();const times:number[]=[];
 for(let i=0;i<1000;i++){const t=performance.now();const result=await runtime.request(input);if(result!=='https://owned.example/song.wav')throw new Error('Unexpected resolver output');times.push(performance.now()-t)}
 const after=runtime.memory();times.sort((a,b)=>a-b);
 const report={generatedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,quickjs:'0.32.0 release-sync',where:'local Node; mocked HTTP transport, real WASM runtime'},initWallMs:initMs,calls:times.length,requestWallP50:times[Math.floor(times.length*.5)],requestWallP95:times[Math.floor(times.length*.95)],guestBytesBefore:before.memory_used_size,guestBytesAfter:after.memory_used_size,guestBytesDelta:after.memory_used_size-before.memory_used_size,workerCpuP95:null,limitations:['Does not measure Cloudflare CPU, real upstreams, or long-running browser memory.','QuickJS guest allocation stats do not represent total WASM linear memory or browser RSS.']};
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/poc-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{runtime.dispose()}
