// Executed ONLY inside QuickJS, never in the page's JavaScript realm.
export const bootstrap = `
(() => {
  const handlers = Object.create(null);let requestId=0;
  globalThis.lx = Object.freeze({
    version: '2.0.0', env: 'desktop', currentScriptInfo: Object.freeze({ name: 'PoC source' }),
    EVENT_NAMES: Object.freeze({inited:'inited',request:'request',updateAlert:'updateAlert'}),
    on(event, handler) { if (event !== 'request' || typeof handler !== 'function') throw new Error('Unsupported event'); handlers[event] = handler; },
    send(event, data) { if(event === 'inited') __emit('inited', JSON.stringify(data)); },
    request(url, options, callback) {
      let cancelled = false; const id=++requestId;
      options = options || {};
      __http(JSON.stringify({url,method:options.method||'GET',headers:options.headers||{},body:options.body,timeout:options.timeout}),id).then(
        response => { if(cancelled) return; const r=JSON.parse(response);if((r.headers['content-type']||'').includes('application/json')){try{r.body=JSON.parse(r.body)}catch{}} callback(null,r,r.body); },
        error => { if(!cancelled) callback(new Error(String(error)),null,null); }
      );
      return () => { cancelled = true; __cancelHttp(id); };
    },
    utils: Object.freeze({})
  });
  globalThis.console = Object.freeze({log(){},warn(){},error(){}});
  const timers = new Map(); let sequence = 0;
  globalThis.setTimeout = (fn,ms=0) => { if(timers.size>=16) throw new Error('Timer limit');const id=++sequence; timers.set(id,fn);__delay(Math.min(Math.max(Number(ms)||0,0),10000)).then(()=>{const f=timers.get(id);timers.delete(id);if(f)f();});return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.__dispatch = json => Promise.resolve().then(()=>{if(!handlers.request)throw new Error('No request handler');return handlers.request(JSON.parse(json));}).then(value=>__emit('result',JSON.stringify(value)),error=>__emit('error',String(error)));
})();`;
