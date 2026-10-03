// Isolated end-to-end verification. Never imported by the production application.
// Start after `npm run build`: node tests/support/preview.mjs
// Test data lives only in this process and is discarded when it stops.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import next from 'next';

process.env.SUPABASE_URL='https://queue-test.invalid';
process.env.SUPABASE_SECRET_KEY='sb_secret_local_test_only';
process.env.SESSION_SECRET='local-verification-session-secret-not-for-deployment-2026';
process.env.ADMIN_PASSPHRASE='local-test-admin-passphrase';
process.env.GROUP_NAME='Тестовая группа';
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(await readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
const signatures = {
  queue_state: ['p_actor','p_admin','p_queue_id','p_offset'],
  queue_command: ['p_action','p_actor','p_admin','p_payload'],
  take_rate_limit: ['p_key','p_limit','p_seconds'],
};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(!url.startsWith('https://queue-test.invalid/rest/v1/rpc/')) return nativeFetch(input,init);
  const name=url.split('/').at(-1);
  if(!Object.hasOwn(signatures,name)) return Response.json({}, {status:404});
  try {
    const args=JSON.parse(init.body);
    const keys=signatures[name];
    const values=keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]);
    const result=await db.query(`select public.${name}(${keys.map((_,i)=>`$${i+1}`).join(',')}) as result`,values);
    return Response.json(result.rows[0].result);
  } catch(e) {return Response.json({message:e.message,code:e.code},{status:400});}
};
const app=next({dev:false,hostname:'localhost',port:3000});
await app.prepare();
const handle=app.getRequestHandler();
const server=createServer((req,res)=>handle(req,res));
server.listen(3000,'127.0.0.1',()=>console.log('Isolated verification ready at http://localhost:3000'));
process.on('SIGINT',()=>server.close(()=>db.close().then(()=>process.exit(0))));
