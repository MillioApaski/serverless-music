import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { AppError,ManifestSchema,errorBody,type Source } from '../../../packages/core/src/index';
import { authenticate,type AuthEnv,type Identity } from './auth';
import { sourceScript,fixtureManifest,toneResponse } from './fixtures';
import { testTracks } from '../../../packages/core/src/test-tracks';
import { httpBridge } from '../../../packages/stream-proxy/src/network';
import { issueToken,verifyToken } from '../../../packages/stream-proxy/src/token';
import { proxyAudio } from '../../../packages/stream-proxy/src/stream';
import { authorizeTarget } from '../../../packages/source-sdk/src/policy';
import { importFile,parsePlaylistLink } from '../../../packages/playlist/src/import';
import registry from '../../../sources/registry/sources.json';
interface Env extends AuthEnv {ASSETS?:Fetcher;STREAM_SECRET?:string;HTTP_LIMITER?:{limit(input:{key:string}):Promise<{success:boolean}>}}
const sources:Source[]=z.array(ManifestSchema).parse(registry);
const app=new Hono<{Bindings:Env;Variables:{identity:Identity}}>();
app.onError((error,c)=>{
 if(error instanceof AppError)return c.json(errorBody(error.code,error.message),error.status as 400);
 if(error instanceof z.ZodError)return c.json(errorBody('INVALID_INPUT','请求字段无效'),400);
 return c.json(errorBody('INTERNAL_ERROR','请求处理失败'),500);
});
app.use('*',async(c,next)=>{
 c.header('cache-control','private, no-store');c.header('x-content-type-options','nosniff');c.header('referrer-policy','no-referrer');
 c.set('identity',await authenticate(c.req.raw,c.env));
 if(['POST','PUT','PATCH','DELETE'].includes(c.req.method)){
   if(c.req.header('origin')!==new URL(c.req.url).origin)throw new AppError('ORIGIN_DENIED','请求来源无效',403);
   if(!c.req.header('content-type')?.startsWith('application/json'))throw new AppError('INVALID_CONTENT_TYPE','请使用 JSON 请求',415);
 }
 await next();
});
app.use('/api/*',bodyLimit({maxSize:1024*1024,onError:c=>c.json(errorBody('BODY_TOO_LARGE','请求体过大'),413)}));
async function sourceById(id:string){if(id==='poc-owned')return fixtureManifest();const source=sources.find(s=>s.id===id&&s.enabled);if(!source)throw new AppError('SOURCE_NOT_FOUND','音源不存在或已禁用',404);return source}
async function rateLimit(c:any){if(c.env.APP_ENV==='local')return;if(!c.env.HTTP_LIMITER)throw new AppError('LIMITER_CONFIGURATION','请求限流尚未配置',503);if(!(await c.env.HTTP_LIMITER.limit({key:c.get('identity').id})).success)throw new AppError('RATE_LIMITED','请求过于频繁',429)}
const exactFixture=(url:string,origin:string)=>testTracks.find(track=>url===origin+track.audioPath);
app.get('/api/me',c=>c.json(c.get('identity')));
app.get('/api/status',c=>c.json({phase:2,completedPhases:[0,1],productionReady:false,blockers:['尚未接入获得授权的真实第三方音源','Access 专项验收与长期内存测试延期','真实平台歌单端点尚未验证'],identity:c.get('identity').mode,features:{quickjs:'poc',httpBridge:'poc',range:'poc',playlist:'local-json-csv'}}));
app.get('/api/sources',async c=>c.json({sources:[await fixtureManifest(),...sources]}));
app.get('/api/fixtures/source.js',c=>c.body(sourceScript,200,{'content-type':'text/javascript; charset=utf-8'}));
for(const track of testTracks){
 app.on(['GET','HEAD'],track.audioPath,c=>toneResponse(c.req.raw,track));
 app.get(track.resolvePath,c=>c.json({url:new URL(track.audioPath,c.req.url).href}));
}
const bridgeInput=z.object({url:z.url().max(2048),method:z.enum(['GET','HEAD','POST']).default('GET'),headers:z.record(z.string(),z.string().max(2048)).default({}),body:z.string().max(65536).optional(),timeout:z.number().int().positive().max(10000).optional()}).strict();
app.post('/api/sources/:id/request',async c=>{
 await rateLimit(c);const source=await sourceById(c.req.param('id'));const input=bridgeInput.parse(await c.req.json());
 if(source.id==='poc-owned'){
   const origin=new URL(c.req.url).origin;
   const track=testTracks.find(candidate=>input.url===origin+candidate.resolvePath);
   if(!track||input.method!=='GET'||Object.keys(input.headers).length||input.body)throw new AppError('TARGET_DENIED','测试音源仅允许固定测试端点',403);
   return c.json({statusCode:200,headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+track.audioPath})});
 }
 return c.json(await httpBridge(input,source.allowedHosts,c.req.raw.signal));
});
const playbackInput=z.object({sourceId:z.string(),url:z.url().max(2048),mode:z.enum(['direct','redirect','proxy']).default('direct')}).strict();
app.post('/api/playback/session',async c=>{
 await rateLimit(c);const input=playbackInput.parse(await c.req.json());const source=await sourceById(input.sourceId);const origin=new URL(c.req.url).origin;
 if(source.id==='poc-owned'){if(!exactFixture(input.url,origin))throw new AppError('TARGET_DENIED','测试音源地址无效',403)}else authorizeTarget(input.url,'GET',source.allowedHosts);
 if(input.mode==='direct')return c.json({mode:'direct',url:input.url});
 const token=await issueToken(c.get('identity').id,input.url,source.id,c.env.STREAM_SECRET);
 return c.json({mode:input.mode,url:`/api/${input.mode==='proxy'?'stream':'redirect'}/${token}`,expiresIn:300});
});
app.on(['GET','HEAD'],'/api/stream/:token',async c=>{
 const data=await verifyToken(c.req.param('token'),c.get('identity').id,c.env.STREAM_SECRET);const source=await sourceById(data.sourceId);
 if(source.id==='poc-owned'){
  const track=exactFixture(data.url,new URL(c.req.url).origin);
  if(!track)throw new AppError('TARGET_DENIED','目标地址无效',403);
  return toneResponse(c.req.raw,track);
 }
 return proxyAudio(c.req.raw,data.url,source.allowedHosts);
});
app.get('/api/redirect/:token',async c=>{
 const data=await verifyToken(c.req.param('token'),c.get('identity').id,c.env.STREAM_SECRET);const source=await sourceById(data.sourceId);
 if(source.id==='poc-owned'){if(!exactFixture(data.url,new URL(c.req.url).origin))throw new AppError('TARGET_DENIED','目标地址无效',403)}else authorizeTarget(data.url,'GET',source.allowedHosts);
 return c.redirect(data.url,302);
});
app.post('/api/playlists/preview',async c=>c.json(importFile(await c.req.json())));
app.post('/api/playlists/identify',async c=>c.json(parsePlaylistLink(z.object({url:z.string()}).parse(await c.req.json()).url)));
app.post('/api/playlists/import',c=>c.json(errorBody('PROVIDER_NOT_VERIFIED','线上歌单导入尚未完成真实平台验证；可以先导入 JSON 文件'),501));
app.all('/api/*',c=>c.json(errorBody('NOT_FOUND','接口不存在'),404));
app.get('*',async c=>{
 if(!c.env.ASSETS)return c.text('请运行 pnpm dev 预览 PoC，或构建静态资源。',503);
 const response=await c.env.ASSETS.fetch(c.req.raw);const headers=new Headers(response.headers);
 headers.set('cache-control','private, no-store');
 headers.set('content-security-policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' https: blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
 return new Response(response.body,{status:response.status,headers});
});
export { app };
export default {fetch:app.fetch};
