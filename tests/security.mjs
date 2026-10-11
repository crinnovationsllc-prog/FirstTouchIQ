import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const christian=id(1), kari=id(2), parent=id(3), otherParent=id(4), player=id(5);
const t11=id(11), t12=id(12), t13=id(13);
let passed=0;
async function test(name, fn) { await fn(); console.log(`PASS ${name}`); passed++; }
async function rows(sql) { return (await db.query(sql)).rows; }
async function scalar(sql) { return Object.values((await rows(sql))[0])[0]; }
async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function denied(sql) { await assert.rejects(db.exec(sql)); }
try {
 await db.exec(await readFile(new URL('./fixtures/production-schema.sql',import.meta.url),'utf8'));
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
 ('${christian}','crinnovationsllc@gmail.com',now()),('${kari}','coach@example.test',now()),('${parent}','parent@example.test',now()),('${otherParent}','other@example.test',now()),('${player}','player@example.test',now());
 insert into profiles(id,role,display_name,active) values
 ('${christian}','coach','Coach Christian',true),('${kari}','player','Coach Kari',true),('${parent}','parent','Parent',true),('${otherParent}','parent','Other Parent',true),('${player}','player','Direct Player',true);
 insert into teams(id,name,created_by,active) values('${t11}','Hawaii Surf 11U','${christian}',true),('${t12}','Hawaii Surf 12U','${christian}',true),('${t13}','Hawaii Surf 13U','${christian}',true);
 insert into coach_team_access(coach_id,team_id,assigned_by) values('${kari}','${t13}','${christian}');
 insert into team_members(team_id,player_id) values('${t13}','${player}');`);
 for(let n=1;n<=27;n++) {
  const tid=n<=6?t12:t11, pid=n<=6?parent:otherParent;
  await db.exec(`insert into player_registration_requests(id,parent_id,team_id,player_name,status) values('${id(100+n)}','${pid}','${tid}','Player ${n}','approved');
  insert into parent_managed_players(id,registration_request_id,parent_id,team_id,display_name) values('${id(200+n)}','${id(100+n)}','${pid}','${tid}','Player ${n}');
  insert into player_team_memberships(managed_player_id,team_id) values('${id(200+n)}','${tid}');`);
  if(n<=6) await db.exec(`insert into player_team_memberships(managed_player_id,team_id) values('${id(200+n)}','${t13}');`);
 }
 for(let n=1;n<=4;n++) await db.exec(`insert into assignments(id,team_id,created_by,title,status) values('${id(300+n)}','${n<=2?t11:t12}','${christian}','Existing ${n}','published');`);
 await db.exec(`update parent_managed_submissions set status='completed',answers='{"saved":"Existing work"}',training_completed=true where managed_player_id='${id(201)}';`);
 const before=await rows('select * from parent_managed_submissions order by id');
 const migration=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_team_scoped_coaches_and_multi_team_players.sql'));
 await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
 await test('Existing 27 players, 33 memberships, 54 submissions and their values preserved',async()=>{
  assert.equal(await scalar('select count(*) from parent_managed_players'),27);
  assert.equal(await scalar('select count(*) from player_team_memberships'),33);
  assert.equal(await scalar('select count(*) from coach_team_access'),1);
  assert.deepEqual(await rows('select * from parent_managed_submissions order by id'),before);
 });
 await test('Migration does not activate Kari',async()=>assert.equal(await scalar(`select role from profiles where id='${kari}'`),'player'));
 // Simulation only, in isolated local database. Real activation is a separate release gate.
 await db.exec(`update profiles set role='coach' where id='${kari}';`);
 await as(kari,async()=>{
  await test('Kari reads only 13U and its six managed players',async()=>{
   assert.deepEqual(await rows('select id from teams'),[{id:t13}]);
   assert.equal(await scalar('select count(*) from parent_managed_players'),6);
   assert.equal(await scalar('select count(*) from player_team_memberships'),6);
   assert.equal(await scalar('select count(*) from assignments'),0);
   assert.equal(await scalar('select count(*) from parent_managed_submissions'),0);
  });
  await test('Kari cannot promote herself, alter Christian or assign another team',async()=>{
   assert.equal((await rows(`update profiles set role='coach' where id='${parent}' returning id`)).length,0);
   assert.equal((await rows(`update profiles set active=false where id='${christian}' returning id`)).length,0);
   await denied(`insert into coach_team_access(coach_id,team_id,assigned_by) values('${kari}','${t12}','${kari}')`);
   await denied(`insert into private.app_administrators values('${kari}')`);
  });
  await test('Kari cannot create, edit or delete 12U assignments or tasks',async()=>{
   await denied(`insert into assignments(team_id,created_by,title,status) values('${t12}','${kari}','Unauthorized','published')`);
   assert.equal((await rows(`update assignments set title='Unauthorized' where team_id='${t12}' returning id`)).length,0);
   assert.equal((await rows(`delete from assignments where team_id='${t12}' returning id`)).length,0);
   await denied(`insert into assignment_tasks(assignment_id,position,description) values('${id(303)}',0,'Unauthorized')`);
  });
  await test('13U publishing fans out to six existing players, without duplicate profiles',async()=>{
   await db.exec(`insert into assignments(id,team_id,created_by,title,status) values('${id(313)}','${t13}','${kari}','13U test','published');
     insert into assignment_tasks(assignment_id,position,description) values('${id(313)}',0,'Wall passes');
     insert into questions(id,assignment_id,position,prompt,type,required) values('${id(413)}','${id(313)}',0,'What did you learn?','short_answer',true);`);
   assert.equal(await scalar(`select count(*) from parent_managed_submissions where assignment_id='${id(313)}'`),6);
   await denied(`update assignments set team_id='${t12}' where id='${id(313)}'`);
   await denied(`delete from assignments where id='${id(313)}'`);
  });
 });
 await as(parent,async()=>{
  await test('Parent sees both 12U and 13U assignments and content using existing child ID',async()=>{
   assert.equal(await scalar('select count(*) from parent_managed_players'),6);
   assert.equal(await scalar('select count(*) from assignments'),3);
   assert.equal(await scalar('select count(*) from assignment_tasks'),1);
   assert.equal(await scalar('select count(*) from parent_managed_submissions'),18);
   assert.equal(await scalar(`select count(*) from parent_managed_players where id='${id(227)}'`),0);
  });
  await test('Parent can save and submit 13U work but cannot review, reassign or overwrite reviewed work',async()=>{
   await denied(`update parent_managed_submissions set managed_player_id='${id(202)}' where managed_player_id='${id(201)}' and assignment_id='${id(313)}'`);
   await denied(`update parent_managed_submissions set status='reviewed' where managed_player_id='${id(201)}' and assignment_id='${id(313)}'`);
   await db.exec(`update parent_managed_submissions set status='in_progress',answers='{"draft":"saved"}' where managed_player_id='${id(201)}' and assignment_id='${id(313)}';
    update parent_managed_submissions set status='completed',training_completed=true where managed_player_id='${id(201)}' and assignment_id='${id(313)}';`);
   assert.equal(await scalar(`select status from parent_managed_submissions where managed_player_id='${id(201)}' and assignment_id='${id(313)}'`),'completed');
   assert.equal((await rows(`update parent_managed_submissions set answers='{}' where managed_player_id='${id(201)}' and assignment_id='${id(313)}' returning id`)).length,0);
  });
  await test('Parent cannot mutate memberships or request another parents child',async()=>{
   await denied(`insert into player_team_memberships(managed_player_id,team_id) values('${id(201)}','${t11}')`);
   await denied(`insert into player_registration_requests(parent_id,team_id,player_name,managed_player_id) values('${parent}','${t13}','Wrong child','${id(227)}')`);
   await denied(`select review_player_request('${id(101)}','approved')`);
  });
 });
 await as(kari,async()=>{
  await test('Kari reviews 13U progress without changing answers; 12U stays inaccessible',async()=>{
   await denied(`update parent_managed_submissions set answers='{}',status='reviewed' where managed_player_id='${id(201)}' and assignment_id='${id(313)}'`);
   await db.exec(`update parent_managed_submissions set status='reviewed' where managed_player_id='${id(201)}' and assignment_id='${id(313)}'`);
   assert.equal((await rows(`update parent_managed_submissions set status='reviewed' where assignment_id='${id(303)}' returning id`)).length,0);
  });
 });
 await as(christian,async()=>{
  await test('Christian administers all three teams and assignments created by Kari',async()=>{
   assert.equal(await scalar('select count(*) from teams'),3);
   assert.equal(await scalar('select count(*) from parent_managed_players'),27);
   assert.equal(await scalar('select count(*) from parent_managed_submissions'),60);
   assert.equal((await rows(`update assignments set title='Admin edit' where id='${id(313)}' returning id`)).length,1);
  });
 });
 // Requests for new/dual-team players: no duplicates on sequential approvals/retry.
 await db.exec(`insert into player_registration_requests(id,parent_id,team_id,player_name,managed_player_id) values
 ('${id(501)}','${parent}','${t13}','Player 1','${id(201)}'),
 ('${id(502)}','${parent}','${t12}','New Dual Player',null),
 ('${id(503)}','${parent}','${t13}','New Dual Player',null),
 ('${id(504)}','${otherParent}','${t11}','Denied',null);`);
 await as(kari,async()=>{
  await test('Kari approves only 13U requests and reuses an existing child',async()=>{
   await denied(`select review_player_request('${id(504)}','approved')`);
   await db.exec(`select review_player_request('${id(501)}','approved')`);
   await denied(`select review_player_request('${id(501)}','approved')`);
  });
 });
 await as(christian,()=>db.exec(`select review_player_request('${id(502)}','approved')`));
 await as(kari,()=>db.exec(`select review_player_request('${id(503)}','approved')`));
 await test('Two new-player team approvals produce one player and two memberships',async()=>{
  assert.equal(await scalar('select count(*) from parent_managed_players'),28);
  assert.equal(await scalar("select count(*) from player_team_memberships m join parent_managed_players p on p.id=m.managed_player_id where p.display_name='New Dual Player'"),2);
 });
 await as(otherParent,async()=>{
  await test('Unrelated parent cannot read 13U answers, tasks, assignments or players',async()=>{
   assert.equal(await scalar(`select count(*) from assignments where team_id='${t13}'`),0);
   assert.equal(await scalar(`select count(*) from parent_managed_submissions where assignment_id='${id(313)}'`),0);
   assert.equal(await scalar('select count(*) from assignment_tasks'),0);
   assert.equal(await scalar('select count(*) from questions'),0);
  });
 });
 await as(kari,async()=>{
  await test('Kari cannot modify global curriculum or storage',async()=>{
   await denied(`insert into mindset_resources(title,resource_type,video_url,created_by) values('Global edit','link','https://example.test','${kari}')`);
   await denied(`insert into storage.objects(bucket_id,name) values('Mindset-Cirriculum','${kari}/unauthorized.pdf')`);
   assert.equal(await scalar('select is_app_administrator()'),false);
  });
 });
 await as(player,async()=>{
  await test('Direct player cannot escalate or access another team',async()=>{
   assert.deepEqual(await rows('select id from teams'),[{id:t13}]);
   assert.equal(await scalar('select count(*) from assignments'),1);
   assert.equal((await rows(`update profiles set role='coach' where id='${player}' returning id`)).length,0);
   await denied(`insert into submissions(assignment_id,player_id,status) values('${id(303)}','${player}','in_progress')`);
   await db.exec(`insert into submissions(assignment_id,player_id,status) values('${id(313)}','${player}','in_progress')`);
  });
 });
 await db.exec(`update profiles set active=false where id='${kari}'`);
 await as(kari,async()=>{
  await test('Inactive coach loses team and player access immediately',async()=>{
   assert.equal(await scalar('select count(*) from teams'),0);
   assert.equal(await scalar('select count(*) from parent_managed_players'),0);
   assert.equal(await scalar('select count(*) from assignments'),0);
  });
 });
 await db.exec(`update profiles set active=true where id='${kari}'`);
 await db.exec('set role anon');
 await test('Anonymous requests cannot read player data or call approval RPC',async()=>{
  await denied('select * from parent_managed_players');
  await denied('select * from assignment_tasks');
  await denied(`select public.review_player_request('${id(504)}','approved')`);
 });
 await db.exec('reset role');
 console.log(`\n${passed} security and data-preservation tests passed (local PostgreSQL simulation).`);
} catch (error) { console.error(error.message, error.detail || "", error.where || ""); process.exitCode=1; } finally { await db.close(); }
