import { z } from 'zod';
export const Platform = z.enum(['wy','tx','kg','kw','mg','local','qishui']);
export type Platform = z.infer<typeof Platform>;
export const TrackSchema = z.object({id:z.string().min(1),title:z.string().min(1),artists:z.array(z.string()).min(1),album:z.string().default(''),duration:z.number().nonnegative().optional(),cover:z.url().optional(),isrc:z.string().optional(),identifiers:z.array(z.object({platform:Platform,id:z.string(),raw:z.record(z.string(),z.unknown()).optional()})).default([])});
export type Track = z.infer<typeof TrackSchema>;
export const PolicySchema = z.object({host:z.string().regex(/^[a-z0-9.-]+$/),pathPrefix:z.string().startsWith('/'),methods:z.array(z.enum(['GET','HEAD','POST'])).min(1),headers:z.array(z.string()).default([])});
export type NetworkPolicy = z.infer<typeof PolicySchema>;
export const ManifestSchema = z.object({id:z.string().regex(/^[a-z0-9-]+$/),name:z.string(),version:z.string(),scriptUrl:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),enabled:z.boolean(),supportedPlatforms:z.array(Platform),supportedQualities:z.array(z.string()),supportedActions:z.array(z.string()),allowedHosts:z.array(PolicySchema),priority:z.number(),healthStatus:z.enum(['available','partial','unavailable','untested','stale']),updatedAt:z.string(),checkedAt:z.string().nullable(),license:z.string(),authorization:z.string()});
export type Source = z.infer<typeof ManifestSchema>;
export interface BridgeRequest { url:string; method?:string; headers?:Record<string,string>; body?:string; timeout?:number }
export interface BridgeResponse { statusCode:number; headers:Record<string,string>; body:string }
export class AppError extends Error { constructor(public code:string,message:string,public status=400){super(message)} }
export const errorBody = (code:string,message:string) => ({error:{code,message}});
export async function sha256(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('')}
