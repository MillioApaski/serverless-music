import {parentPort} from 'node:worker_threads';
import {SourceRuntime} from '../packages/source-runtime/src/runtime';
const script="lx.on('request',async()=>{const huge=[];while(true)huge.push('x'.repeat(20000))});lx.send('inited',{sources:{local:{type:'music',actions:['musicUrl'],qualitys:[]}}});";
try{const r=await SourceRuntime.create(script,async()=>({statusCode:200,headers:{},body:''}),{memoryBytes:1024*1024,timeoutMs:100});await r.request({source:'local',action:'musicUrl',info:{}});parentPort!.postMessage({unexpected:true})}catch(e){parentPort!.postMessage({error:String(e)})}
