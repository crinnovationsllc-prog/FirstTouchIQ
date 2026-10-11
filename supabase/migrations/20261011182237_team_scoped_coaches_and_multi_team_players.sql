-- Team access uses trusted tables, never editable Auth user_metadata.
-- Does not activate Kari, recreate teams, or replace player/submission IDs.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table if not exists private.app_administrators (
  user_id uuid primary key references public.profiles(id)
);
alter table private.app_administrators enable row level security;
revoke all on private.app_administrators from public, anon, authenticated;
insert into private.app_administrators(user_id)
select p.id from public.profiles p join auth.users u on u.id=p.id
where lower(u.email)='crinnovationsllc@gmail.com' and u.email_confirmed_at is not null
  and p.role='coach' and p.active
on conflict do nothing;
do $$ begin
  if not exists(select 1 from private.app_administrators) then
    raise exception 'Verified Coach Christian administrator not found';
  end if;
end $$;

create or replace function private.active_role(wanted text) returns boolean
language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and active and role::text=wanted); $$;
revoke all on function private.active_role(wanted text) from public, anon;
grant execute on function private.active_role(wanted text) to authenticated;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$ select private.active_role('coach') and exists(select 1 from private.app_administrators where user_id=auth.uid()); $$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function private.can_manage_team(tid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.active_role('coach') and (private.is_admin() or exists(select 1 from public.teams where id=tid and created_by=auth.uid()) or exists(select 1 from public.coach_team_access where team_id=tid and coach_id=auth.uid())); $$;
revoke all on function private.can_manage_team(tid uuid) from public, anon;
grant execute on function private.can_manage_team(tid uuid) to authenticated;

create or replace function private.owns_player(pid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.active_role('parent') and exists(select 1 from public.parent_managed_players where id=pid and parent_id=auth.uid()); $$;
revoke all on function private.owns_player(pid uuid) from public, anon;
grant execute on function private.owns_player(pid uuid) to authenticated;

create or replace function private.parent_on_team(tid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.active_role('parent') and exists(select 1 from public.player_team_memberships m join public.parent_managed_players p on p.id=m.managed_player_id where m.team_id=tid and p.parent_id=auth.uid()); $$;
revoke all on function private.parent_on_team(tid uuid) from public, anon;
grant execute on function private.parent_on_team(tid uuid) to authenticated;

create or replace function private.player_on_team(tid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.active_role('player') and exists(select 1 from public.team_members where team_id=tid and player_id=auth.uid()); $$;
revoke all on function private.player_on_team(tid uuid) from public, anon;
grant execute on function private.player_on_team(tid uuid) to authenticated;

create or replace function private.can_view_player(pid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.owns_player(pid) or (private.active_role('coach') and (private.is_admin() or exists(select 1 from public.player_team_memberships m where m.managed_player_id=pid and private.can_manage_team(m.team_id)))); $$;
revoke all on function private.can_view_player(pid uuid) from public, anon;
grant execute on function private.can_view_player(pid uuid) to authenticated;

create or replace function private.can_manage_assignment(aid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.assignments where id=aid and private.can_manage_team(team_id)); $$;
revoke all on function private.can_manage_assignment(aid uuid) from public, anon;
grant execute on function private.can_manage_assignment(aid uuid) to authenticated;

create or replace function private.can_view_assignment(aid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.assignments where id=aid and (private.can_manage_team(team_id) or (status='published' and (private.parent_on_team(team_id) or private.player_on_team(team_id))))); $$;
revoke all on function private.can_view_assignment(aid uuid) from public, anon;
grant execute on function private.can_view_assignment(aid uuid) to authenticated;

create or replace function private.can_submit_managed(aid uuid, pid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.owns_player(pid) and exists(select 1 from public.assignments a join public.player_team_memberships m on m.team_id=a.team_id where a.id=aid and a.status='published' and m.managed_player_id=pid); $$;
revoke all on function private.can_submit_managed(aid uuid, pid uuid) from public, anon;
grant execute on function private.can_submit_managed(aid uuid, pid uuid) to authenticated;

create or replace function private.can_view_profile(pid uuid) returns boolean
language sql stable security definer set search_path='' as $$ select auth.uid() is not null and (pid=auth.uid() or private.is_admin() or exists(select 1 from public.team_members m where m.player_id=pid and private.can_manage_team(m.team_id))); $$;
revoke all on function private.can_view_profile(pid uuid) from public, anon;
grant execute on function private.can_view_profile(pid uuid) to authenticated;

alter table public.player_registration_requests add column if not exists managed_player_id uuid references public.parent_managed_players(id);
create index if not exists player_memberships_team_idx on public.player_team_memberships(team_id, managed_player_id);
-- Ensure existing primary memberships without modifying or duplicating the six secondary ones.
insert into public.player_team_memberships(managed_player_id,team_id)
select id,team_id from public.parent_managed_players on conflict do nothing;

-- Replace legacy permissive policies so they cannot OR-bypass the new rules.
do $$ declare p record; begin
for p in select * from pg_policies where schemaname='public' and tablename=any(array['profiles','teams','coach_team_access','team_members','player_team_memberships','assignments','questions','assignment_tasks','training_tasks','parent_managed_players','parent_managed_submissions','parent_managed_answers','parent_managed_task_completions','player_registration_requests','submissions','answers','task_completions']) loop
execute format('drop policy %I on public.%I',p.policyname,p.tablename);
end loop; end $$;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select,insert,update,delete on public.profiles to authenticated;
alter table public.teams enable row level security;
revoke all on public.teams from anon;
grant select,insert,update,delete on public.teams to authenticated;
alter table public.coach_team_access enable row level security;
revoke all on public.coach_team_access from anon;
grant select,insert,update,delete on public.coach_team_access to authenticated;
alter table public.team_members enable row level security;
revoke all on public.team_members from anon;
grant select,insert,update,delete on public.team_members to authenticated;
alter table public.player_team_memberships enable row level security;
revoke all on public.player_team_memberships from anon;
grant select,insert,update,delete on public.player_team_memberships to authenticated;
alter table public.assignments enable row level security;
revoke all on public.assignments from anon;
grant select,insert,update,delete on public.assignments to authenticated;
alter table public.questions enable row level security;
revoke all on public.questions from anon;
grant select,insert,update,delete on public.questions to authenticated;
alter table public.assignment_tasks enable row level security;
revoke all on public.assignment_tasks from anon;
grant select,insert,update,delete on public.assignment_tasks to authenticated;
alter table public.training_tasks enable row level security;
revoke all on public.training_tasks from anon;
grant select,insert,update,delete on public.training_tasks to authenticated;
alter table public.parent_managed_players enable row level security;
revoke all on public.parent_managed_players from anon;
grant select,insert,update,delete on public.parent_managed_players to authenticated;
alter table public.parent_managed_submissions enable row level security;
revoke all on public.parent_managed_submissions from anon;
grant select,insert,update,delete on public.parent_managed_submissions to authenticated;
alter table public.parent_managed_answers enable row level security;
revoke all on public.parent_managed_answers from anon;
grant select,insert,update,delete on public.parent_managed_answers to authenticated;
alter table public.parent_managed_task_completions enable row level security;
revoke all on public.parent_managed_task_completions from anon;
grant select,insert,update,delete on public.parent_managed_task_completions to authenticated;
alter table public.player_registration_requests enable row level security;
revoke all on public.player_registration_requests from anon;
grant select,insert,update,delete on public.player_registration_requests to authenticated;
alter table public.submissions enable row level security;
revoke all on public.submissions from anon;
grant select,insert,update,delete on public.submissions to authenticated;
alter table public.answers enable row level security;
revoke all on public.answers from anon;
grant select,insert,update,delete on public.answers to authenticated;
alter table public.task_completions enable row level security;
revoke all on public.task_completions from anon;
grant select,insert,update,delete on public.task_completions to authenticated;
create policy profile_read on public.profiles for select to authenticated using (private.can_view_profile(id));
create policy profile_admin on public.profiles for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy team_read on public.teams for select to authenticated using (private.can_manage_team(id) or private.player_on_team(id) or (active and private.active_role('parent')));
create policy team_admin on public.teams for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy coach_access_read on public.coach_team_access for select to authenticated using (coach_id=auth.uid() or private.is_admin());
create policy coach_access_admin on public.coach_team_access for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy team_member_read on public.team_members for select to authenticated using (player_id=auth.uid() or private.can_manage_team(team_id));
create policy team_member_admin on public.team_members for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy membership_read on public.player_team_memberships for select to authenticated using (private.owns_player(managed_player_id) or private.can_manage_team(team_id));
create policy membership_admin on public.player_team_memberships for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy managed_player_read on public.parent_managed_players for select to authenticated using (private.can_view_player(id));
create policy assignment_read on public.assignments for select to authenticated using (private.can_manage_team(team_id) or (status='published' and (private.parent_on_team(team_id) or private.player_on_team(team_id))));
create policy assignment_insert on public.assignments for insert to authenticated with check (private.can_manage_team(team_id) and created_by=auth.uid());
create policy assignment_update on public.assignments for update to authenticated using (private.can_manage_team(team_id)) with check (private.can_manage_team(team_id));
create policy assignment_delete on public.assignments for delete to authenticated using (private.can_manage_team(team_id));
create policy content_read on public.questions for select to authenticated using (private.can_view_assignment(assignment_id));
create policy content_manage on public.questions for all to authenticated using (private.can_manage_assignment(assignment_id)) with check (private.can_manage_assignment(assignment_id));
create policy content_read on public.assignment_tasks for select to authenticated using (private.can_view_assignment(assignment_id));
create policy content_manage on public.assignment_tasks for all to authenticated using (private.can_manage_assignment(assignment_id)) with check (private.can_manage_assignment(assignment_id));
create policy content_read on public.training_tasks for select to authenticated using (private.can_view_assignment(assignment_id));
create policy content_manage on public.training_tasks for all to authenticated using (private.can_manage_assignment(assignment_id)) with check (private.can_manage_assignment(assignment_id));
create policy managed_progress_read on public.parent_managed_submissions for select to authenticated using (private.owns_player(managed_player_id) or private.can_manage_assignment(assignment_id));
create policy managed_progress_insert on public.parent_managed_submissions for insert to authenticated with check (status='not_started' and private.can_submit_managed(assignment_id,managed_player_id));
create policy managed_progress_parent_update on public.parent_managed_submissions for update to authenticated using (status in ('not_started','in_progress') and private.owns_player(managed_player_id)) with check (status in ('not_started','in_progress','submitted','completed') and private.can_submit_managed(assignment_id,managed_player_id));
create policy managed_progress_coach_update on public.parent_managed_submissions for update to authenticated using (private.can_manage_assignment(assignment_id)) with check (private.can_manage_assignment(assignment_id));
create policy managed_content_read on public.parent_managed_answers for select to authenticated using (exists(select 1 from public.parent_managed_submissions s where s.id=submission_id));
create policy managed_content_insert on public.parent_managed_answers for insert to authenticated with check (exists(select 1 from public.parent_managed_submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id)));
create policy managed_content_update on public.parent_managed_answers for update to authenticated using (exists(select 1 from public.parent_managed_submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id))) with check (exists(select 1 from public.parent_managed_submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id)));
create policy managed_content_delete on public.parent_managed_answers for delete to authenticated using (exists(select 1 from public.parent_managed_submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id)));
create policy managed_content_read on public.parent_managed_task_completions for select to authenticated using (exists(select 1 from public.parent_managed_submissions s where s.id=submission_id));
create policy managed_content_insert on public.parent_managed_task_completions for insert to authenticated with check (exists(select 1 from public.parent_managed_submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id)));
create policy managed_content_update on public.parent_managed_task_completions for update to authenticated using (exists(select 1 from public.parent_managed_submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id))) with check (exists(select 1 from public.parent_managed_submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id)));
create policy managed_content_delete on public.parent_managed_task_completions for delete to authenticated using (exists(select 1 from public.parent_managed_submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.status in ('not_started','in_progress') and private.can_submit_managed(s.assignment_id,s.managed_player_id)));
create policy request_read on public.player_registration_requests for select to authenticated using (parent_id=auth.uid() or private.can_manage_team(team_id));
create policy request_insert on public.player_registration_requests for insert to authenticated with check (private.active_role('parent') and parent_id=auth.uid() and status='pending' and reviewed_by is null and reviewed_at is null and (managed_player_id is null or private.owns_player(managed_player_id)) and exists(select 1 from public.teams t where t.id=team_id and t.active));
create policy submission_read on public.submissions for select to authenticated using ((player_id=auth.uid() and private.active_role('player')) or private.can_manage_assignment(assignment_id));
create policy submission_insert on public.submissions for insert to authenticated with check (player_id=auth.uid() and private.active_role('player') and exists(select 1 from public.assignments a where a.id=assignment_id and a.status='published' and private.player_on_team(a.team_id)) and status in ('not_started','in_progress'));
create policy submission_update on public.submissions for update to authenticated using (player_id=auth.uid() and private.active_role('player') and exists(select 1 from public.assignments a where a.id=assignment_id and a.status='published' and private.player_on_team(a.team_id)) and status in ('not_started','in_progress')) with check (player_id=auth.uid() and private.active_role('player') and exists(select 1 from public.assignments a where a.id=assignment_id and a.status='published' and private.player_on_team(a.team_id)) and status in ('not_started','in_progress','submitted'));
create policy submission_review on public.submissions for update to authenticated using (private.can_manage_assignment(assignment_id)) with check (private.can_manage_assignment(assignment_id));
create policy player_content_read on public.answers for select to authenticated using (exists(select 1 from public.submissions s where s.id=submission_id));
create policy player_content_insert on public.answers for insert to authenticated with check (exists(select 1 from public.submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player')));
create policy player_content_update on public.answers for update to authenticated using (exists(select 1 from public.submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player'))) with check (exists(select 1 from public.submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player')));
create policy player_content_delete on public.answers for delete to authenticated using (exists(select 1 from public.submissions s join public.questions c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=question_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player')));
create policy player_content_read on public.task_completions for select to authenticated using (exists(select 1 from public.submissions s where s.id=submission_id));
create policy player_content_insert on public.task_completions for insert to authenticated with check (exists(select 1 from public.submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player')));
create policy player_content_update on public.task_completions for update to authenticated using (exists(select 1 from public.submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player'))) with check (exists(select 1 from public.submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player')));
create policy player_content_delete on public.task_completions for delete to authenticated using (exists(select 1 from public.submissions s join public.training_tasks c on c.assignment_id=s.assignment_id where s.id=submission_id and c.id=task_id and s.player_id=auth.uid() and s.status in ('not_started','in_progress') and private.active_role('player')));

-- Global curriculum remains shared/readable; only the administrator manages it.
alter table public.mindset_resources enable row level security;
drop policy if exists mindset_resources_coach_manage on public.mindset_resources;
create policy mindset_resources_admin_manage on public.mindset_resources for all to authenticated
using (private.is_admin()) with check (private.is_admin() and (file_path is null or split_part(file_path,'/',1)=auth.uid()::text));
drop policy if exists ftiq_mindset_upload on storage.objects;
create policy ftiq_mindset_upload on storage.objects for insert to authenticated
with check(bucket_id='Mindset-Cirriculum' and (storage.foldername(name))[1]=auth.uid()::text and private.is_admin());
drop policy if exists ftiq_mindset_delete on storage.objects;
create policy ftiq_mindset_delete on storage.objects for delete to authenticated
using(bucket_id='Mindset-Cirriculum' and private.is_admin());

-- Definer triggers have no RPC entry point and preserve existing progress.
create or replace function public.initialize_parent_managed_submissions_on_publish()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='published' then
  insert into public.parent_managed_submissions(assignment_id,managed_player_id,status)
  select new.id,m.managed_player_id,'not_started' from public.player_team_memberships m
  where m.team_id=new.team_id on conflict(assignment_id,managed_player_id) do nothing;
 end if;
 return new;
end $$;
create or replace function private.initialize_membership_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.parent_managed_submissions(assignment_id,managed_player_id,status)
 select a.id,new.managed_player_id,'not_started' from public.assignments a
 where a.team_id=new.team_id and a.status='published'
 on conflict(assignment_id,managed_player_id) do nothing;
 return new;
end $$;
create trigger membership_initializes_progress after insert on public.player_team_memberships
for each row execute function private.initialize_membership_progress();
create or replace function private.initialize_primary_membership()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.player_team_memberships(managed_player_id,team_id) values(new.id,new.team_id) on conflict do nothing;
 return new;
end $$;
create trigger player_initializes_membership after insert on public.parent_managed_players
for each row execute function private.initialize_primary_membership();
-- Fill only missing submission rows; never overwrite answers/status/timestamps.
insert into public.parent_managed_submissions(assignment_id,managed_player_id,status)
select a.id,m.managed_player_id,'not_started' from public.assignments a
join public.player_team_memberships m on m.team_id=a.team_id where a.status='published'
on conflict(assignment_id,managed_player_id) do nothing;

create or replace function private.review_player_request(request_id uuid, decision text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.player_registration_requests%rowtype; pid uuid; matches integer;
begin
 if auth.uid() is null or not private.active_role('coach') then raise exception 'Coach access required'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
 select * into r from public.player_registration_requests where id=request_id for update;
 if not found or r.status<>'pending' or not private.can_manage_team(r.team_id) then
  raise exception 'Pending request not found for your team';
 end if;
 if decision='approved' then
  -- Serialize approvals per parent, including two pending team requests for a new child.
  perform 1 from public.profiles where id=r.parent_id for update;
  pid:=r.managed_player_id;
  if pid is not null then
   if not exists(select 1 from public.parent_managed_players where id=pid and parent_id=r.parent_id) then
    raise exception 'Player does not belong to this parent';
   end if;
  else
   select count(*),min(id::text)::uuid into matches,pid from public.parent_managed_players
   where parent_id=r.parent_id and lower(btrim(display_name))=lower(btrim(r.player_name));
   if matches>1 then raise exception 'Select the existing player explicitly'; end if;
   if pid is null then
    insert into public.parent_managed_players(registration_request_id,parent_id,team_id,display_name)
    values(r.id,r.parent_id,r.team_id,r.player_name) returning id into pid;
   end if;
  end if;
  insert into public.player_team_memberships(managed_player_id,team_id) values(pid,r.team_id) on conflict do nothing;
 end if;
 update public.player_registration_requests set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),
 managed_player_id=coalesce(pid,managed_player_id) where id=r.id;
end $$;
revoke all on function private.review_player_request(uuid,text) from public, anon;
grant execute on function private.review_player_request(uuid,text) to authenticated;
create or replace function public.review_player_request(request_id uuid, decision text)
returns void language sql security invoker set search_path='' as $$
 select private.review_player_request(request_id,decision);
$$;
revoke all on function public.review_player_request(uuid,text) from public, anon;
grant execute on function public.review_player_request(uuid,text) to authenticated;

-- RLS checks old and new rows, but cannot compare them: preserve identity in triggers.
create function private.guard_assignment() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.team_id<>old.team_id or new.created_by<>old.created_by or new.id<>old.id) then
  raise exception 'Assignment identity cannot be changed';
 end if;
 if tg_op='DELETE' then
  if exists(select 1 from public.parent_managed_submissions where assignment_id=old.id)
    or exists(select 1 from public.submissions where assignment_id=old.id) then
   raise exception 'Archive this assignment to preserve player progress';
  end if;
  return old;
 end if;
 return new;
end $$;
create trigger preserve_assignment_identity before update or delete on public.assignments
for each row execute function private.guard_assignment();
create function private.guard_submission() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.assignment_id<>old.assignment_id then raise exception 'Submission identity cannot be changed'; end if;
 if tg_table_name='parent_managed_submissions' then
  if new.managed_player_id<>old.managed_player_id then raise exception 'Player identity cannot be changed'; end if;
  if private.can_manage_assignment(old.assignment_id) then
   if old.status not in ('completed','submitted','reviewed') or new.status<>'reviewed'
      or (to_jsonb(new)-'status')<>(to_jsonb(old)-'status') then
    raise exception 'Coaches may only mark completed work reviewed';
   end if;
  end if;
 else
  if new.player_id<>old.player_id then raise exception 'Player identity cannot be changed'; end if;
  if private.can_manage_assignment(old.assignment_id) then
   if old.status::text not in ('submitted','reviewed') or new.status::text<>'reviewed'
      or (to_jsonb(new)-array['status','reviewed_at','coach_feedback'])<>(to_jsonb(old)-array['status','reviewed_at','coach_feedback']) then
    raise exception 'Coaches may only review submitted work';
   end if;
  elsif new.coach_feedback is distinct from old.coach_feedback or new.reviewed_at is distinct from old.reviewed_at then
   raise exception 'Only coaches can change review fields';
  end if;
 end if;
 return new;
end $$;
create trigger preserve_managed_submission before update on public.parent_managed_submissions
for each row execute function private.guard_submission();
create trigger preserve_direct_submission before update on public.submissions
for each row execute function private.guard_submission();
revoke all on function private.initialize_membership_progress(), private.initialize_primary_membership(),
 private.guard_assignment(), private.guard_submission() from public,anon,authenticated;
revoke all on function public.initialize_parent_managed_submissions_on_publish(), public.handle_new_user() from public,anon,authenticated;
revoke all on function public.is_coach(),public.is_team_owner(uuid),public.is_team_member(uuid) from public,anon;
-- Legacy helpers have no remaining policy callers; keep them off the public RPC surface.
revoke all on function public.is_coach(),public.is_team_owner(uuid),public.is_team_member(uuid) from authenticated;
create or replace function public.is_app_administrator() returns boolean
language sql stable security invoker set search_path='' as $$ select private.is_admin(); $$;
revoke all on function public.is_app_administrator() from public,anon;
grant execute on function public.is_app_administrator() to authenticated;
notify pgrst,'reload schema';
