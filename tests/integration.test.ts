import {describe,it,expect} from 'vitest';
import {app} from '../apps/worker/src/index';
import {toneResponse} from '../apps/worker/src/fixtures';
import {importFile,parsePlaylistLink,normalizePlatformTrack} from '../packages/playlist/src/import';
const env={APP_ENV:'local',DEV_IDENTITY:'test-user',STREAM_SECRET:'test-secret-longer-than-thirty-two-bytes'};
const post=(path:string,body:unknown)=>app.request(`http://localhost${path}`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)},env);
describe('Worker routes',()=>{
 it('denies production APIs and static entry points with no configuration',async()=>{for(const path of ['/','/api/me','/api/sources','/assets/test.js','/api/stream/token']){const r=await app.request(`https://music.example.com${path}`,undefined,{});expect(r.status).toBe(503)}});
 it('does not accept forged headers as a production identity',async()=>{const r=await app.request('https://music.example.com/api/me',{headers:{'cf-access-authenticated-user-email':'spoof@example.com'}},{ACCESS_ISSUER:'https://team.cloudflareaccess.com',ACCESS_AUD:'a'});expect(r.status).toBe(401)});
 it('enforces the exact fixture target and rejects clients that alter it',async()=>{expect((await post('/api/sources/poc-owned/request',{url:'https://evil.example/'})).status).toBe(403);expect((await post('/api/sources/poc-owned/request',{url:'http://localhost/api/fixtures/resolve',headers:{cookie:'secret'}})).status).toBe(403);expect((await post('/api/sources/poc-owned/request',{url:'http://localhost/api/fixtures/resolve'})).status).toBe(200)});
 it('rejects cross-origin writes',async()=>{const r=await app.request('http://localhost/api/playlists/preview',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'},env);expect(r.status).toBe(403)});
 it('issues direct, proxy and redirect sessions for the fixed owned audio',async()=>{
  const payload={sourceId:'poc-owned',url:'http://localhost/api/fixtures/tone.wav'};
  const direct:any=await (await post('/api/playback/session',{...payload,mode:'direct'})).json();expect(direct.url).toBe(payload.url);
  const proxy:any=await (await post('/api/playback/session',{...payload,mode:'proxy'})).json();const response=await app.request(`http://localhost${proxy.url}`,{headers:{range:'bytes=44-107'}},env);expect(response.status).toBe(206);expect((await response.arrayBuffer()).byteLength).toBe(64);
  const other=await app.request(`http://localhost${proxy.url}`,undefined,{...env,DEV_IDENTITY:'other-user'});expect(other.status).toBe(403);
  const redirect:any=await (await post('/api/playback/session',{...payload,mode:'redirect'})).json();const r=await app.request(`http://localhost${redirect.url}`,undefined,env);expect(r.status).toBe(302);expect(r.headers.get('location')).toBe(payload.url);
 });
 it('resolves a distinct second WAV and serves the same bytes through playback proxy',async()=>{
  const origin='http://localhost';
  const url=origin+'/api/fixtures/dusk.wav';
  const bridge=await post('/api/sources/poc-owned/request',{url:origin+'/api/fixtures/resolve/dusk'});
  expect(bridge.status).toBe(200);
  const resolved=await bridge.json() as {body:string};
  expect(JSON.parse(resolved.body).url).toBe(url);
  const session=await post('/api/playback/session',{sourceId:'poc-owned',url,mode:'proxy'});
  expect(session.status).toBe(200);
  const range={headers:{range:'bytes=44-199'}};
  const direct=await app.request(url,range,env);
  const playback=await session.json() as {url:string};
  const proxy=await app.request(origin+playback.url,range,env);
  const original=await app.request(origin+'/api/fixtures/tone.wav',range,env);
  expect(proxy.status).toBe(206);
  expect(proxy.headers.get('content-range')).toBe('bytes 44-199/384044');
  const expected=new Uint8Array(await direct.arrayBuffer());
  expect(new Uint8Array(await proxy.arrayBuffer())).toEqual(expected);
  expect(new Uint8Array(await original.arrayBuffer())).not.toEqual(expected);
 });
 it('returns a real 501 for unverified online import',async()=>{expect((await post('/api/playlists/import',{url:'https://music.163.com/playlist?id=12345'})).status).toBe(501)});
});
describe('owned audio ranges',()=>{
 it('returns exact byte slices equal to a full reference response',async()=>{const full=new Uint8Array(await toneResponse(new Request('http://localhost/tone')).arrayBuffer());for(const range of ['bytes=0-43','bytes=45-120','bytes=-64']){const r=toneResponse(new Request('http://localhost/tone',{headers:{range}}));const start=range==='bytes=-64'?full.length-64:range==='bytes=0-43'?0:45;const end=range==='bytes=-64'?full.length:range==='bytes=0-43'?44:121;expect(new Uint8Array(await r.arrayBuffer())).toEqual(full.slice(start,end))}});
 it('returns 416 for invalid offsets',()=>{expect(toneResponse(new Request('http://localhost/tone',{headers:{range:'bytes=9999999-'}})).status).toBe(416)});
});
describe('playlist metadata preservation',()=>{
 it('preserves QQ songmid and original fields without playback URL',()=>{const track=normalizePlatformTrack('tx',{songmid:'mid-123',songid:123,songname:'Test',singer:[{name:'Artist'}],file:{media_mid:'media-original'}},1);expect(track.identifiers[0].id).toBe('mid-123');expect(track.identifiers[0].raw?.file).toEqual({media_mid:'media-original'});expect(track).not.toHaveProperty('playbackUrl')});
 it('keeps versions distinct and reports invalid items',()=>{const result=importFile({name:'My songs',platform:'wy',tracks:[{id:1,name:'Song',ar:[{name:'A'}]},{id:2,name:'Song (Live)',ar:[{name:'A'}]},{id:1,name:'Song'},{name:'Missing ID'}]});expect(result.tracks).toHaveLength(2);expect(result.duplicates).toBe(1);expect(result.failures).toHaveLength(1)});
 it('recognizes exact platform URLs and rejects malicious hosts',()=>{expect(parsePlaylistLink('https://music.163.com/#/playlist?id=12345')).toEqual({platform:'wy',id:'12345'});expect(parsePlaylistLink('https://y.qq.com/n/ryqq/playlist/123456')).toEqual({platform:'tx',id:'123456'});expect(()=>parsePlaylistLink('https://y.qq.com.evil.example/playlist/123456')).toThrow();expect(()=>parsePlaylistLink('https://music.163.com/#/user/home?id=12345')).toThrow()});
});
