import { AppError,type NetworkPolicy } from '../../core/src/index';
import { permittedFetch,type Fetcher } from './network';
const forwarded=['content-type','content-length','content-range','accept-ranges','etag','last-modified'];
export async function proxyAudio(request:Request,target:string,policies:NetworkPolicy[],fetcher?:Fetcher){
 if(!['GET','HEAD'].includes(request.method))throw new AppError('METHOD_NOT_ALLOWED','仅支持 GET 和 HEAD',405);
 const range=request.headers.get('range');
 if(range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))throw new AppError('INVALID_RANGE','仅支持单段字节 Range',416);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(120000)]);
 const allowed=policies.map(p=>({...p,headers:[...new Set([...p.headers,'range','if-range'])]}));
 const headers:Record<string,string>={};if(range)headers.range=range;
 const ifRange=request.headers.get('if-range');if(ifRange && ifRange.length<256)headers['if-range']=ifRange;
 const upstream=await permittedFetch({url:target,method:request.method,headers},allowed,signal,fetcher);
 if(![200,206,304,416].includes(upstream.status)){await upstream.body?.cancel();throw new AppError('UPSTREAM_AUDIO','音频上游暂时不可用',502)}
 if(upstream.status!==416 && upstream.status!==304 && !/^(audio\/|application\/octet-stream)/i.test(upstream.headers.get('content-type')||'')){await upstream.body?.cancel();throw new AppError('INVALID_AUDIO','上游未返回音频',502)}
 if(upstream.status===206 && !upstream.headers.has('content-range')){await upstream.body?.cancel();throw new AppError('INVALID_RANGE_RESPONSE','上游缺少 Content-Range',502)}
 const output=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff'});
 for(const header of forwarded){const value=upstream.headers.get(header);if(value)output.set(header,value)}
 if(upstream.status===416){await upstream.body?.cancel();output.delete('content-length');output.set('content-type','audio/wav');return new Response(null,{status:416,headers:output})}
 if(request.method==='HEAD'){await upstream.body?.cancel();return new Response(null,{status:upstream.status,headers:output})}
 return new Response(upstream.body,{status:upstream.status,headers:output});
}
