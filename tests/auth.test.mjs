import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { verifyFirebaseToken, allowedAccount } from '../worker/firebase-auth.ts';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='test-key';
const keys=createLocalJWKSet({keys:[jwk]});
const now=Math.floor(Date.now()/1000);
const base={sub:'user-1',aud:'test-project',iss:'https://securetoken.google.com/test-project',iat:now,exp:now+300,auth_time:now,email:'owner@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
const sign=(claims=base,key=privateKey)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test-key'}).sign(key);
void test('verified Google token and explicit account allowlist',async()=>{
 const payload=await verifyFirebaseToken(await sign(),'test-project',keys);
 assert.equal(payload.sub,'user-1');assert.equal(allowedAccount(payload,'','OWNER@example.com'),true);
 assert.equal(allowedAccount(payload,'user-1'),true);assert.equal(allowedAccount(payload),false);
 assert.equal(allowedAccount(payload,'another-user','other@example.com'),false);
});
void test('rejects tampered token, different signing key, wrong project, missing or invalid claims',async()=>{
 const token=await sign();const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({...base,admin:true})).toString('base64url');
 await assert.rejects(verifyFirebaseToken(parts.join('.'),'test-project',keys));
 const other=await generateKeyPair('RS256');await assert.rejects(verifyFirebaseToken(await sign(base,other.privateKey),'test-project',keys));
 for(const change of [{aud:'other'},{iss:'other'},{exp:now-1},{iat:now+500},{auth_time:now+500},{sub:''},{email_verified:false},{firebase:{sign_in_provider:'password'}},{exp:undefined},{auth_time:undefined}]) {
  await assert.rejects(verifyFirebaseToken(await sign({...base,...change}),'test-project',keys));
 }
});
