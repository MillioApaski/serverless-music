import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError, sha256 } from '../../../packages/core/src/index';
export interface AuthEnv {APP_ENV?:string;DEV_IDENTITY?:string;ACCESS_ISSUER?:string;ACCESS_AUD?:string}
export interface Identity {id:string;email?:string;mode:'access'|'local'}
const jwks=new Map<string,JWTVerifyGetKey>();
export async function authenticate(request:Request,env:AuthEnv,key?:JWTVerifyGetKey):Promise<Identity>{
 const host=new URL(request.url).hostname;
 if(env.APP_ENV==='local' && env.DEV_IDENTITY && ['localhost','127.0.0.1','[::1]'].includes(host))return {id:await sha256(`local:${env.DEV_IDENTITY}`),mode:'local'};
 const issuer=env.ACCESS_ISSUER?.replace(/\/$/,'');
 if(!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !env.ACCESS_AUD)throw new AppError('AUTH_CONFIGURATION','Access 尚未配置',503);
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token)throw new AppError('UNAUTHORIZED','请通过 Access 登录后访问',401);
 try{
   let getKey=key||jwks.get(issuer);
   if(!getKey){getKey=createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`),{timeoutDuration:5000});jwks.set(issuer,getKey)}
   const {payload}=await jwtVerify(token,getKey,{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub'],clockTolerance:5});
   if(typeof payload.sub!=='string' || !payload.sub || payload.type!=='app')throw new Error('Invalid identity');
   return {id:await sha256(`${issuer}:${payload.sub}`),email:typeof payload.email==='string'?payload.email:undefined,mode:'access'};
 }catch{throw new AppError('UNAUTHORIZED','Access 会话无效或已过期',401)}
}
