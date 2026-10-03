// Populate ONLY the isolated localhost preview, never a real Supabase project.
// Run after: node tests/support/preview.mjs
import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
let cookie = '';
async function action(payload) {
  const response = await fetch(`${origin}/api/actions`, {
    method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', Cookie: cookie},
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  if (response.headers.has('set-cookie')) cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}
const state = async () => (await fetch(`${origin}/api/state`, {headers:{Cookie:cookie}})).json();
const current = async () => {const s = await state();return {queueId:s.queue.id,revision:s.queue.revision};};
await action({action:'adminLogin',passphrase:'local-test-admin-passphrase'});
if ((await state()).queue) await action({action:'finish',...await current()});
const title='Математический анализ и дифференциальные уравнения — защита самостоятельной работы';
await action({action:'create',title,startsAt:'2026-10-05T07:30:00Z'});
await action({action:'add',...await current(),name:'Константинопольский-Александров Александр Константинович'});
await action({action:'add',...await current(),name:'Петрова Мария'});
await action({action:'complete',...await current(),entryId:(await state()).entries[0].id});
await action({action:'finish',...await current()});
await action({action:'create',title,startsAt:'2026-10-06T07:30:00Z',note:'Аудитория 214. Подготовьте тетрадь с решением и студенческий билет. Проверка длинного текста на небольшом экране.'});
for (const name of ['Константинопольский-Александров Александр Константинович','Иванов Алексей','Петрова Мария','Смирнов Дмитрий']) {
  await action({action:'add',...await current(),name});
}
console.log('Responsive fixtures ready: active class, archived class, long title and name.');
