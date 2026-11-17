import type { Source } from '../../core/src/index';
export class SourceClient {
 private worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
 private sequence=0;
 private pending=new Map<number,{resolve:(value:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private requests=new Map<number,AbortController>();
 constructor(){this.worker.onmessage=async({data})=>{
   if(data.type==='http-cancel'){this.requests.get(data.id)?.abort();return}
   if(data.type==='http-request'){
     const controller=new AbortController();this.requests.set(data.id,controller);
     try{
       const r=await fetch(`/api/sources/${encodeURIComponent(data.sourceId)}/request`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data.request),signal:controller.signal});
       const value:any=await r.json();if(!r.ok)throw new Error(value.error?.message||'Bridge failed');
       this.worker.postMessage({type:'http-response',id:data.id,value});
     }catch(e){this.worker.postMessage({type:'http-response',id:data.id,error:String(e)})}
     finally{this.requests.delete(data.id)}return;
   }
   const p=this.pending.get(data.id);if(!p)return;
   clearTimeout(p.timer);this.pending.delete(data.id);if(data.error){p.reject(new Error(data.error));this.dispose()}else p.resolve(data.value);
 };this.worker.onerror=()=>this.dispose();}
 private call(type:string,data:object){return new Promise<any>((resolve,reject)=>{
   const id=++this.sequence;const timer=setTimeout(()=>{this.dispose();reject(new Error('音源工作线程超时，已销毁'))},6000);
   this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({type,id,...data});
 })}
 load(script:string,manifest:Source){return this.call('load',{script,manifest})}
 request(input:{source:string;action:string;info:unknown}){return this.call('request',{input})}
 dispose(){this.requests.forEach(c=>c.abort());this.requests.clear();this.worker.terminate();this.pending.forEach(p=>{clearTimeout(p.timer);p.reject(new Error('工作线程已销毁'))});this.pending.clear()}
}
