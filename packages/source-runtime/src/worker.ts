import { SourceRuntime,setWasmLocation } from './runtime';
import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
setWasmLocation(wasmUrl);
import { sha256, type Source, type BridgeRequest, type BridgeResponse } from '../../core/src/index';
let runtime:SourceRuntime|undefined;
let bridgeSequence=0;
const waiting=new Map<number,{resolve:(value:BridgeResponse)=>void;reject:(error:Error)=>void}>();
self.onmessage=async(event:MessageEvent)=>{
 const message=event.data;
 if(message.type==='http-response'){
   const pending=waiting.get(message.id);waiting.delete(message.id);
   if(pending){if(message.error)pending.reject(new Error(message.error));else pending.resolve(message.value)}return;
 }
 try {
   if(message.type==='load'){
     runtime?.dispose(); const manifest=message.manifest as Source;
     if(await sha256(message.script)!==manifest.sha256)throw new Error('音源哈希校验失败');
     runtime=await SourceRuntime.create(message.script,(request:BridgeRequest,signal)=>new Promise((resolve,reject)=>{
       const id=++bridgeSequence;waiting.set(id,{resolve,reject});
       signal.addEventListener('abort',()=>{waiting.delete(id);reject(new Error('Cancelled'));self.postMessage({type:'http-cancel',id})},{once:true});
       self.postMessage({type:'http-request',id,sourceId:manifest.id,request});
     }));
     self.postMessage({type:'result',id:message.id,value:runtime.capabilities});
   }else if(message.type==='request'){
     if(!runtime)throw new Error('音源尚未初始化');
     const value=await runtime.request(message.input);self.postMessage({type:'result',id:message.id,value});
   }else if(message.type==='dispose'){runtime?.dispose();runtime=undefined;self.close()}
 }catch(error){self.postMessage({type:'result',id:message.id,error:String(error)});self.close()}
};
