import { SignJWT,jwtVerify } from 'jose';
import { z } from 'zod';
import { AppError } from '../../core/src/index';
const claims=z.object({sub:z.string(),url:z.url(),sourceId:z.string(),exp:z.number()});
function key(secret?:string){if(!secret || new TextEncoder().encode(secret).length<32)throw new AppError('TOKEN_CONFIGURATION','播放凭证密钥未配置',503);return new TextEncoder().encode(secret)}
export async function issueToken(subject:string,url:string,sourceId:string,secret?:string){return new SignJWT({url,sourceId}).setProtectedHeader({alg:'HS256'}).setSubject(subject).setIssuer('serverless-music').setAudience('playback').setIssuedAt().setExpirationTime('5m').sign(key(secret))}
export async function verifyToken(token:string,subject:string,secret?:string){
 const signingKey=key(secret);
 try{const {payload}=await jwtVerify(token,signingKey,{algorithms:['HS256'],issuer:'serverless-music',audience:'playback',requiredClaims:['exp','iat','sub']});const data=claims.parse(payload);if(data.sub!==subject)throw new Error('Identity mismatch');return data}
 catch{throw new AppError('INVALID_PLAYBACK_TOKEN','播放凭证无效或已过期',403)}
}
