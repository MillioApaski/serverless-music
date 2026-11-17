import {describe,it,expect} from 'vitest';
import {authorizeTarget,filterHeaders} from '../packages/source-sdk/src/policy';
import {httpBridge,permittedFetch} from '../packages/stream-proxy/src/network';
import {issueToken,verifyToken} from '../packages/stream-proxy/src/token';
import {proxyAudio} from '../packages/stream-proxy/src/stream';
import {authenticate} from '../apps/worker/src/auth';
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from 'jose';
const policy=[{host:'audio.example.com',pathPrefix:'/approved/',methods:['GET','HEAD','POST'] as ('GET'|'HEAD'|'POST')[],headers:['content-type']}];
describe('egress policy',()=>{
 it.each(['http://audio.example.com/approved/a','https://audio.example.com.evil.com/approved/a','https://audio.example.com/approved-evil','https://audio.example.com/approved/../private','https://audio.example.com:444/approved/a','https://user:pass@audio.example.com/approved/a','https://127.0.0.1/approved/a','https://[::1]/approved/a','https://2130706433/approved/a','https://169.254.169.254/approved/a','https://audio.example.com./approved/a','https://audio.example.com/approved/%2e%2e%2fprivate'])('denies %s',url=>{expect(()=>authorizeTarget(url,'GET',policy)).toThrow()});
 it('allows an exact host and path boundary',()=>{expect(authorizeTarget('https://audio.example.com/approved/song.wav','GET',policy).url.hostname).toBe('audio.example.com')});
 it.each(['cookie','authorization','Cf-Access-Jwt-Assertion','cf-access-client-secret','proxy-authorization','host','x-secret'])('rejects %s',name=>{expect(()=>filterHeaders({[name]:'secret'},policy[0])).toThrow()});
 it('checks each redirect before issuing the next request',async()=>{let calls=0;await expect(permittedFetch({url:'https://audio.example.com/approved/a'},policy,new AbortController().signal,async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/'}})})).rejects.toThrow();expect(calls).toBe(1)});
 it('limits redirect hops',async()=>{let calls=0;await expect(permittedFetch({url:'https://audio.example.com/approved/a'},policy,new AbortController().signal,async()=>{calls++;return new Response(null,{status:302,headers:{location:'/approved/b'}})})).rejects.toThrow();expect(calls).toBe(4)});
 it('rejects oversized bodies before an upstream request',async()=>{await expect(httpBridge({url:'https://audio.example.com/approved/a',method:'POST',body:'x'.repeat(65537)},policy,new AbortController().signal,async()=>{throw new Error('must not fetch')})).rejects.toThrow(/请求体/)});
 it('bounds actual response bytes even if length is absent',async()=>{await expect(httpBridge({url:'https://audio.example.com/approved/a'},policy,new AbortController().signal,async()=>new Response('x'.repeat(1024*1024+1)))).rejects.toThrow(/大小限制/)});
});
describe('playback tokens',()=>{
 const secret='test-secret-longer-than-thirty-two-bytes';
 it('binds a token to identity and detects changes',async()=>{const token=await issueToken('user-a','https://audio.example.com/approved/a','owned',secret);expect((await verifyToken(token,'user-a',secret)).sourceId).toBe('owned');await expect(verifyToken(token,'user-b',secret)).rejects.toThrow();await expect(verifyToken(`${token}bad`,'user-a',secret)).rejects.toThrow()});
 it('rejects expired credentials',async()=>{const token=await new SignJWT({url:'https://audio.example.com/approved/a',sourceId:'owned'}).setProtectedHeader({alg:'HS256'}).setSubject('a').setIssuer('serverless-music').setAudience('playback').setIssuedAt().setExpirationTime(1).sign(new TextEncoder().encode(secret));await expect(verifyToken(token,'a',secret)).rejects.toThrow()});
 it('fails closed with no secret',async()=>{await expect(issueToken('a','https://audio.example.com/approved/a','owned')).rejects.toThrow(/密钥/)});
});
describe('audio streams',()=>{
 it('preserves Range, status and headers while streaming',async()=>{let seen='';const response=await proxyAudio(new Request('https://music.example.com/api/stream/x',{headers:{range:'bytes=2-5'}}),'https://audio.example.com/approved/a',policy,async req=>{seen=req.headers.get('range')||'';return new Response(new Uint8Array([2,3,4,5]),{status:206,headers:{'content-type':'audio/wav','content-range':'bytes 2-5/100','content-length':'4','accept-ranges':'bytes'}})});expect(seen).toBe('bytes=2-5');expect(response.status).toBe(206);expect(response.headers.get('content-range')).toBe('bytes 2-5/100');expect((await response.arrayBuffer()).byteLength).toBe(4)});
 it('forwards HEAD without a body',async()=>{const response=await proxyAudio(new Request('https://music.example.com/api/stream/x',{method:'HEAD'}),'https://audio.example.com/approved/a',policy,async req=>{expect(req.method).toBe('HEAD');return new Response(null,{headers:{'content-type':'audio/wav','content-length':'100'}})});expect(response.body).toBeNull();expect(response.headers.get('content-length')).toBe('100')});
 it('rejects multiple ranges',async()=>{await expect(proxyAudio(new Request('https://music.example.com/api/stream/x',{headers:{range:'bytes=0-1,4-5'}}),'https://audio.example.com/approved/a',policy)).rejects.toThrow()});
 it('rejects non-audio upstreams',async()=>{await expect(proxyAudio(new Request('https://music.example.com/api/stream/x'),'https://audio.example.com/approved/a',policy,async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}}))).rejects.toThrow()});
 it('cancels the upstream body when the consumer cancels',async()=>{let cancelled=false;const upstream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(100))},cancel(){cancelled=true}});const response=await proxyAudio(new Request('https://music.example.com/api/stream/x'),'https://audio.example.com/approved/a',policy,async()=>new Response(upstream,{headers:{'content-type':'audio/wav'}}));await response.body!.cancel();expect(cancelled).toBe(true)});
});
describe('Access verification',()=>{
 const env={APP_ENV:'production',ACCESS_ISSUER:'https://music-team.cloudflareaccess.com',ACCESS_AUD:'music-app'};
 it('fails closed without production configuration',async()=>{await expect(authenticate(new Request('https://music.example.com/'),{})).rejects.toThrow(/配置/)});
 it('does not trust identity headers or local flags on public origins',async()=>{await expect(authenticate(new Request('https://music.example.com/',{headers:{'cf-access-authenticated-user-email':'owner@example.com'}}),env)).rejects.toThrow(/登录/);await expect(authenticate(new Request('https://music.example.com/'),{...env,APP_ENV:'local',DEV_IDENTITY:'spoof'})).rejects.toThrow()});
 it('accepts a signed identity and rejects wrong issuer, aud, exp and signature',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test-key';const keys=createLocalJWKSet({keys:[jwk]});
  const sign=async(issuer=env.ACCESS_ISSUER,aud=env.ACCESS_AUD,exp:number|string='5m')=>new SignJWT({email:'a@example.com',type:'app'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('stable-sub').setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
  const request=(token:string)=>new Request('https://music.example.com/api/me',{headers:{'Cf-Access-Jwt-Assertion':token}});
  const valid=await sign();const identity=await authenticate(request(valid),env,keys);expect(identity.mode).toBe('access');expect(identity.email).toBe('a@example.com');expect(identity.id).toHaveLength(64);
  for(const token of [await sign('https://wrong.cloudflareaccess.com'),await sign(undefined,'wrong'),await sign(undefined,undefined,1),valid+'bad'])await expect(authenticate(request(token),env,keys)).rejects.toThrow(/无效/);
 });
});
