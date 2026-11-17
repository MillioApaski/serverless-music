import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSWASMModule, type QuickJSContext, type QuickJSRuntime, type QuickJSDeferredPromise } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import { bootstrap } from './bootstrap';
import type { BridgeRequest, BridgeResponse } from '../../core/src/index';

export interface RuntimeLimits { memoryBytes:number; stackBytes:number; timeoutMs:number; requests:number; responseBytes:number }
const defaults:RuntimeLimits={memoryBytes:16*1024*1024,stackBytes:256*1024,timeoutMs:3000,requests:8,responseBytes:1024*1024};
export type HttpBridge=(request:BridgeRequest,signal:AbortSignal)=>Promise<BridgeResponse>;
export interface Capabilities { sources:Record<string,{name?:string;type:string;actions:string[];qualitys:string[]}> }
let modulePromise:Promise<QuickJSWASMModule>|undefined;
let wasmLocation:string|undefined;
export function setWasmLocation(url:string){wasmLocation=url}
const moduleInstance=()=>modulePromise??=newQuickJSWASMModuleFromVariant(wasmLocation?newVariant(RELEASE_SYNC,{wasmLocation}):RELEASE_SYNC);

/** One isolated QuickJS runtime per source; module bytes are shared, guest state is not. */
export class SourceRuntime {
  private vm:QuickJSContext;
  private runtime:QuickJSRuntime;
  private deadline=0;
  private closed=false;
  private busy=false;
  private count=0;
  private pending=new Set<QuickJSDeferredPromise>();
  private timers=new Set<ReturnType<typeof setTimeout>>();
  private controllers=new Set<AbortController>();
  private network=new Map<number,AbortController>();
  private messages=new Map<string,string>();
  private limits:RuntimeLimits;
  private constructor(module:QuickJSWASMModule,private bridge:HttpBridge,limits:Partial<RuntimeLimits>){
    this.limits={...defaults,...limits};
    this.runtime=module.newRuntime();
    this.runtime.setMemoryLimit(this.limits.memoryBytes);
    this.runtime.setMaxStackSize(this.limits.stackBytes);
    this.runtime.setInterruptHandler(()=>this.closed || Date.now()>this.deadline);
    this.vm=this.runtime.newContext();
    this.install('__emit', (event,data)=>{ const name=this.vm.getString(event);if(!['inited','result','error'].includes(name))throw new Error('Unsupported host message');const value=this.vm.getString(data);if(value.length>65536)throw new Error('Host message size limit');this.messages.set(name,value);return this.vm.undefined; });
    this.install('__http', (json,idHandle)=>{
      if(++this.count>this.limits.requests) throw new Error('Network request limit exceeded');
      const jsonText=this.vm.getString(json);if(jsonText.length>65536)throw new Error('Request size limit');
      const request=JSON.parse(jsonText) as BridgeRequest;const id=this.vm.getNumber(idHandle);
      const controller=new AbortController();this.controllers.add(controller);this.network.set(id,controller);
      return this.defer(async()=>{
        try {
          const response=await this.bridge(request,controller.signal);
          const encoded=JSON.stringify(response);
          if(new TextEncoder().encode(encoded).byteLength>this.limits.responseBytes) throw new Error('Response size limit exceeded');
          return encoded;
        } finally {this.controllers.delete(controller);this.network.delete(id)}
      });
    });
    this.install('__cancelHttp',id=>{this.network.get(this.vm.getNumber(id))?.abort();return this.vm.undefined});
    this.install('__delay', (ms)=>{
      if(this.timers.size>=16) throw new Error('Timer limit exceeded');
      const delay=Math.min(10000,Math.max(0,this.vm.getNumber(ms)));
      return this.defer(()=>new Promise<string>(resolve=>{
        const timer=setTimeout(()=>{this.timers.delete(timer);resolve('')},delay);
        this.timers.add(timer);
      }));
    });
  }
  private install(name:string,fn:Parameters<QuickJSContext['newFunction']>[1]){
    const handle=this.vm.newFunction(name,fn); this.vm.setProp(this.vm.global,name,handle);handle.dispose();
  }
  private defer(work:()=>Promise<string>){
    const deferred=this.vm.newPromise(); this.pending.add(deferred);
    // All asynchronous completions check liveness before touching WASM handles.
    void Promise.resolve().then(work).then(value=>{
      if(this.closed)return;
      const handle=this.vm.newString(value);deferred.resolve(handle);handle.dispose();
    },error=>{
      if(this.closed)return;
      const handle=this.vm.newString(String(error));deferred.reject(handle);handle.dispose();
    }).finally(()=>{
      if(!this.closed){this.pending.delete(deferred);deferred.dispose()}
    });
    return deferred.handle;
  }
  private evaluate(code:string){
    const result=this.vm.evalCode(code,'source.js');
    if(result.error){const message=String(this.vm.dump(result.error)?.message||this.vm.dump(result.error));result.error.dispose();throw new Error(message)}
    result.value.dispose();
  }
  private pump(){
    const jobs=this.runtime.executePendingJobs(100);
    if(jobs.error){const message=String(jobs.error.context.dump(jobs.error));jobs.error.dispose();throw new Error(message)}
  }
  private async waitFor(event:string){
    while(!this.messages.has(event)){
      if(this.closed)throw new Error('Runtime disposed');
      if(Date.now()>this.deadline)throw new Error('Source execution timeout');
      this.pump();
      if(!this.messages.has(event))await new Promise(resolve=>setTimeout(resolve,2));
    }
    this.pump();
    const result=this.messages.get(event)!;this.messages.delete(event);return result;
  }
  static async create(script:string,bridge:HttpBridge,limits:Partial<RuntimeLimits>={}){
    const instance=new SourceRuntime(await moduleInstance(),bridge,limits);
    instance.deadline=Date.now()+instance.limits.timeoutMs;
    try {
      instance.evaluate(bootstrap); instance.evaluate(script);
      const init=JSON.parse(await instance.waitFor('inited')) as Capabilities;
      if(!init || !init.sources || typeof init.sources!=='object') throw new Error('Invalid source capabilities');
      for(const [platform,capability] of Object.entries(init.sources)){
        if(!['wy','tx','kg','kw','mg','local'].includes(platform) || capability.type!=='music' || !Array.isArray(capability.actions) || !Array.isArray(capability.qualitys))throw new Error('Invalid source capabilities');
      }
      instance.capabilities=init;return instance;
    } catch(error){instance.dispose();throw error}
  }
  capabilities!:Capabilities;
  async request(input:{source:string;action:string;info:unknown}){
    if(this.closed)throw new Error('Runtime disposed');
    if(this.busy)throw new Error('Runtime busy');
    const capability=this.capabilities.sources[input.source];
    if(!capability?.actions.includes(input.action))throw new Error('Unsupported source action');
    this.busy=true;this.count=0;this.deadline=Date.now()+this.limits.timeoutMs;
    this.messages.delete('error');this.messages.delete('result');
    try {
      this.evaluate(`__dispatch(${JSON.stringify(JSON.stringify(input))})`);
      while(!this.messages.has('result') && !this.messages.has('error')){
        if(Date.now()>this.deadline)throw new Error('Source execution timeout');
        if(this.closed)throw new Error('Runtime disposed');
        this.pump();await new Promise(resolve=>setTimeout(resolve,2));
      }
      if(this.messages.has('error'))throw new Error(this.messages.get('error'));
      const result=this.messages.get('result');
      if(result===undefined)throw new Error('Missing result');return JSON.parse(result);
    } catch(error){this.dispose();throw error}
    finally {this.busy=false}
  }
  memory(){if(this.closed)throw new Error('Runtime disposed');const h=this.runtime.computeMemoryUsage();try{return this.vm.dump(h)}finally{h.dispose()}}
  dispose(){
    if(this.closed)return; this.closed=true;
    this.controllers.forEach(c=>c.abort());this.controllers.clear();this.network.clear();
    this.timers.forEach(t=>clearTimeout(t));this.timers.clear();
    this.pending.forEach(p=>p.dispose());this.pending.clear();
    try{this.vm.dispose();this.runtime.dispose()}catch(error){modulePromise=undefined;throw new Error('Fatal sandbox disposal; terminate the owning Worker', {cause:error})}
  }
}
