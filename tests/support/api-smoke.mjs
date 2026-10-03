// Run only against `node tests/support/preview.mjs`; never a real Supabase project.
import assert from 'node:assert/strict';
const base='http://localhost:3000';
const stats=[];
async function post(input,cookie='',origin=base){
  const response=await fetch(`${base}/api/actions`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(input)});
  return {status:response.status,body:await response.json(),cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),headers:response.headers};
}
async function state(cookie='') {return (await fetch(`${base}/api/state`,{headers:{Cookie:cookie}})).json();}
assert.equal((await post({action:'adminLogin',passphrase:'wrong'})).status,401);
assert.equal((await post({action:'adminLogin',passphrase:'local-test-admin-passphrase'},'', 'https://other.invalid')).status,403);
assert.equal((await post({action:'create',title:'Проверка API',startsAt:new Date().toISOString()})).status,403);
stats.push('wrong passphrase, cross-origin rejection, unauthorized creation');
const login=await post({action:'adminLogin',passphrase:'local-test-admin-passphrase'});
assert.equal(login.status,200); const admin=login.cookie;
assert.match(login.headers.get('set-cookie'),/httponly/i);
assert.match(login.headers.get('set-cookie'),/samesite=lax/i);
let s=await state(admin);
if(s.queue) assert.equal((await post({action:'finish',queueId:s.queue.id,revision:s.queue.revision},admin)).status,200);
assert.equal((await post({action:'create',title:'Проверка одновременной записи',startsAt:'2026-10-06T07:30:00Z'},admin)).status,200);
s=await state(admin); const queueId=s.queue.id;
const names=['Абрамов Алексей','Белов Борис','Васильева Анна','Громов Иван','Демидов Пётр','Егорова Ольга','Жуков Денис','Захаров Павел'];
const members=[];
for(const name of names){ const result=await post({action:'register',name}); assert.equal(result.status,200); members.push(result.cookie); }
const joins=await Promise.all(members.map(cookie=>post({action:'join',queueId},cookie)));
assert.ok(joins.every(r=>r.status===200));
s=await state(admin);
assert.equal(s.entries.length,8); assert.deepEqual(s.entries.map(e=>e.position),[1,2,3,4,5,6,7,8]);
stats.push('8 simultaneous HTTP registrations with unique consecutive positions');
const stale=s.queue.revision;
assert.equal((await post({action:'move',queueId,revision:stale,entryId:s.entries[7].id,position:1},admin)).status,200);
assert.equal((await post({action:'finish',queueId,revision:stale},admin)).status,409);
assert.equal((await post({action:'finish',queueId,revision:stale},members[0])).status,403);
assert.equal((await state(members[0])).audit.length,0);
stats.push('stale revision rejection, privilege checks, private audit log');
const anonymous=await state();
assert.equal(anonymous.isAdmin,false); assert.equal(anonymous.member,null);
assert.ok(!JSON.stringify(anonymous).includes('local-test-admin-passphrase'));
assert.ok(!JSON.stringify(anonymous).includes('sb_secret'));
assert.equal((await post({action:'join',queueId},members[0])).status,200);
assert.equal((await state()).entries.length,8);
stats.push('idempotent rejoin and no secrets in API snapshots');
console.log('HTTP smoke checks passed:\n'+stats.map(v=>`- ${v}`).join('\n'));
