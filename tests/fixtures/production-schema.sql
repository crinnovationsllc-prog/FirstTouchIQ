-- Sanitized replica of the inspected production schema; no real player data.
create role anon; create role authenticated; create schema auth; create schema storage; create schema private;
CREATE OR REPLACE FUNCTION private.check_player_registration_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.parent_id is distinct from old.parent_id
    or new.team_id is distinct from old.team_id
    or new.player_name is distinct from old.player_name
    or new.id is distinct from old.id
    or new.created_at is distinct from old.created_at then
    raise exception 'Player request details cannot be changed during review';
  end if;
  return new;
end;
$function$;

create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
create type public.user_role as enum ('coach','player','parent');
create type public.assignment_status as enum ('draft','published','archived');
create type public.question_type as enum ('short_answer','multiple_choice','checkbox');
create type public.submission_status as enum ('not_started','in_progress','submitted','reviewed');
create table public.parent_managed_players (id uuid default gen_random_uuid() not null,
registration_request_id uuid not null,
parent_id uuid not null,
team_id uuid not null,
display_name text not null,
created_at timestamp with time zone default now() not null);
create table public.profiles (id uuid not null,
role user_role default 'player'::user_role not null,
display_name text not null,
username text,
active boolean default true not null,
created_at timestamp with time zone default now() not null);
create table public.teams (id uuid default gen_random_uuid() not null,
name text not null,
created_by uuid not null,
active boolean default true not null,
created_at timestamp with time zone default now() not null);
create table public.team_members (team_id uuid not null,
player_id uuid not null,
joined_at timestamp with time zone default now() not null);
create table public.assignments (id uuid default gen_random_uuid() not null,
team_id uuid not null,
created_by uuid not null,
title text not null,
instructions text,
video_url text,
due_at timestamp with time zone,
status assignment_status default 'draft'::assignment_status not null,
created_at timestamp with time zone default now() not null,
published_at timestamp with time zone);
create table public.questions (id uuid default gen_random_uuid() not null,
assignment_id uuid not null,
position integer default 0 not null,
prompt text not null,
type question_type default 'short_answer'::question_type not null,
options jsonb,
required boolean default true not null);
create table public.training_tasks (id uuid default gen_random_uuid() not null,
assignment_id uuid not null,
position integer default 0 not null,
description text not null,
required boolean default true not null);
create table public.submissions (id uuid default gen_random_uuid() not null,
assignment_id uuid not null,
player_id uuid not null,
status submission_status default 'not_started'::submission_status not null,
started_at timestamp with time zone,
submitted_at timestamp with time zone,
reviewed_at timestamp with time zone,
coach_feedback text);
create table public.answers (id uuid default gen_random_uuid() not null,
submission_id uuid not null,
question_id uuid not null,
answer_text text,
answer_json jsonb);
create table public.task_completions (submission_id uuid not null,
task_id uuid not null,
completed boolean default false not null);
create table public.player_registration_requests (id uuid default gen_random_uuid() not null,
parent_id uuid not null,
team_id uuid not null,
player_name text not null,
status text default 'pending'::text not null,
reviewed_by uuid,
reviewed_at timestamp with time zone,
created_at timestamp with time zone default now() not null);
create table public.player_team_memberships (managed_player_id uuid not null,
team_id uuid not null,
joined_at timestamp with time zone default now() not null);
create table public.parent_managed_answers (id uuid default gen_random_uuid() not null,
submission_id uuid not null,
question_id uuid not null,
answer_text text);
create table public.parent_managed_task_completions (submission_id uuid not null,
task_id uuid not null,
completed boolean default false not null);
create table public.mindset_resources (id uuid default gen_random_uuid() not null,
title text not null,
description text default ''::text not null,
resource_type text not null,
file_path text,
video_url text,
created_by uuid not null,
created_at timestamp with time zone default now() not null);
create table public.assignment_tasks (id uuid default gen_random_uuid() not null,
assignment_id uuid not null,
position integer default 1 not null,
description text not null,
created_at timestamp with time zone default now() not null);
create table public.parent_managed_submissions (id uuid default gen_random_uuid() not null,
assignment_id uuid not null,
managed_player_id uuid not null,
status text default 'not_started'::text not null,
started_at timestamp with time zone,
submitted_at timestamp with time zone,
created_at timestamp with time zone default now() not null,
answers jsonb default '{}'::jsonb not null,
training_completed boolean default false not null);
create table public.coach_team_access (coach_id uuid not null,
team_id uuid not null,
assigned_by uuid,
created_at timestamp with time zone default now() not null);
alter table public.profiles add PRIMARY KEY (id);
alter table public.profiles add UNIQUE (username);
alter table public.teams add PRIMARY KEY (id);
alter table public.team_members add PRIMARY KEY (team_id, player_id);
alter table public.assignments add PRIMARY KEY (id);
alter table public.questions add PRIMARY KEY (id);
alter table public.training_tasks add PRIMARY KEY (id);
alter table public.submissions add PRIMARY KEY (id);
alter table public.submissions add UNIQUE (assignment_id, player_id);
alter table public.answers add PRIMARY KEY (id);
alter table public.answers add UNIQUE (submission_id, question_id);
alter table public.task_completions add PRIMARY KEY (submission_id, task_id);
alter table public.player_registration_requests add CHECK ((length(TRIM(BOTH FROM player_name)) > 0));
alter table public.player_registration_requests add CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.player_registration_requests add PRIMARY KEY (id);
alter table public.parent_managed_players add CHECK ((length(btrim(display_name)) > 0));
alter table public.parent_managed_players add PRIMARY KEY (id);
alter table public.parent_managed_players add UNIQUE (registration_request_id);
alter table public.parent_managed_submissions add PRIMARY KEY (id);
alter table public.parent_managed_submissions add UNIQUE (assignment_id, managed_player_id);
alter table public.parent_managed_answers add PRIMARY KEY (id);
alter table public.parent_managed_answers add UNIQUE (submission_id, question_id);
alter table public.parent_managed_task_completions add PRIMARY KEY (submission_id, task_id);
alter table public.parent_managed_submissions add CHECK ((jsonb_typeof(answers) = 'object'::text));
alter table public.assignment_tasks add PRIMARY KEY (id);
alter table public.parent_managed_submissions add CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'submitted'::text, 'completed'::text, 'reviewed'::text])));
alter table public.mindset_resources add CHECK ((length(TRIM(BOTH FROM title)) > 0));
alter table public.mindset_resources add CHECK ((resource_type = ANY (ARRAY['pdf'::text, 'video'::text, 'link'::text])));
alter table public.mindset_resources add CHECK ((((resource_type = ANY (ARRAY['pdf'::text, 'video'::text])) AND (file_path IS NOT NULL) AND (length(TRIM(BOTH FROM file_path)) > 0) AND (video_url IS NULL)) OR ((resource_type = 'link'::text) AND (file_path IS NULL) AND (video_url IS NOT NULL) AND (video_url ~ '^https://'::text))));
alter table public.mindset_resources add PRIMARY KEY (id);
alter table public.mindset_resources add UNIQUE (file_path);
alter table public.coach_team_access add PRIMARY KEY (coach_id, team_id);
alter table public.player_team_memberships add PRIMARY KEY (managed_player_id, team_id);
alter table public.profiles add FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.teams add FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.team_members add FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
alter table public.team_members add FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.assignments add FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
alter table public.assignments add FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.questions add FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.training_tasks add FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.submissions add FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.submissions add FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.answers add FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
alter table public.answers add FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
alter table public.task_completions add FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
alter table public.task_completions add FOREIGN KEY (task_id) REFERENCES training_tasks(id) ON DELETE CASCADE;
alter table public.player_registration_requests add FOREIGN KEY (parent_id) REFERENCES profiles(id);
alter table public.player_registration_requests add FOREIGN KEY (team_id) REFERENCES teams(id);
alter table public.player_registration_requests add FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
alter table public.parent_managed_players add FOREIGN KEY (registration_request_id) REFERENCES player_registration_requests(id);
alter table public.parent_managed_players add FOREIGN KEY (parent_id) REFERENCES profiles(id);
alter table public.parent_managed_players add FOREIGN KEY (team_id) REFERENCES teams(id);
alter table public.parent_managed_submissions add FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.parent_managed_submissions add FOREIGN KEY (managed_player_id) REFERENCES parent_managed_players(id) ON DELETE CASCADE;
alter table public.parent_managed_answers add FOREIGN KEY (submission_id) REFERENCES parent_managed_submissions(id) ON DELETE CASCADE;
alter table public.parent_managed_answers add FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
alter table public.parent_managed_task_completions add FOREIGN KEY (submission_id) REFERENCES parent_managed_submissions(id) ON DELETE CASCADE;
alter table public.parent_managed_task_completions add FOREIGN KEY (task_id) REFERENCES training_tasks(id) ON DELETE CASCADE;
alter table public.assignment_tasks add FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
alter table public.mindset_resources add FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.coach_team_access add FOREIGN KEY (coach_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.coach_team_access add FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
alter table public.coach_team_access add FOREIGN KEY (assigned_by) REFERENCES profiles(id);
alter table public.player_team_memberships add FOREIGN KEY (managed_player_id) REFERENCES parent_managed_players(id) ON DELETE CASCADE;
alter table public.player_team_memberships add FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.is_team_member(team_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = team_uuid
      and tm.player_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_team_owner(team_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.teams t
    where t.id = team_uuid
      and t.created_by = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, role, display_name, username, active)
  VALUES (
    NEW.id,
    CASE
      WHEN lower(coalesce(NEW.email, '')) = 'crinnovationsllc@gmail.com' THEN 'coach'::public.user_role
      WHEN NEW.raw_user_meta_data ->> 'role' = 'parent' THEN 'parent'::public.user_role
      ELSE 'player'::public.user_role
    END,
    CASE
      WHEN lower(coalesce(NEW.email, '')) = 'crinnovationsllc@gmail.com' THEN 'Coach Christian'
      ELSE coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''), 'Player')
    END,
    NULL,
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_coach()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'coach'
      AND p.active = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.initialize_parent_managed_submissions_on_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published' OR OLD.team_id IS DISTINCT FROM NEW.team_id) THEN
    INSERT INTO public.parent_managed_submissions (assignment_id, managed_player_id, status)
    SELECT NEW.id, p.id, 'not_started'
    FROM public.parent_managed_players p
    WHERE p.team_id = NEW.team_id
    ON CONFLICT (assignment_id, managed_player_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.review_player_request(request_id uuid, decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  approved_request public.player_registration_requests%rowtype;
  managed_id uuid;
begin
  if auth.uid() is null or not public.is_coach() then
    raise exception 'Coach access required';
  end if;
  if decision is null or decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;
  update public.player_registration_requests r
     set status = decision, reviewed_by = auth.uid(), reviewed_at = now()
   where r.id = request_id and r.status = 'pending'
     and exists (
       select 1 from public.teams t
       where t.id = r.team_id and t.created_by = auth.uid()
     )
   returning * into approved_request;
  if not found then
    raise exception 'Pending request not found for your team';
  end if;
  if decision = 'approved' then
    insert into public.parent_managed_players
      (registration_request_id, parent_id, team_id, display_name)
    values
      (approved_request.id, approved_request.parent_id, approved_request.team_id, approved_request.player_name)
    on conflict (registration_request_id) do nothing;
    select id into strict managed_id from public.parent_managed_players
    where registration_request_id = approved_request.id;
    insert into public.parent_managed_submissions
      (assignment_id, managed_player_id, status)
    select a.id, managed_id, 'not_started'
    from public.assignments a
    where a.team_id = approved_request.team_id and a.status = 'published'
    on conflict (assignment_id, managed_player_id) do nothing;
  end if;
end;
$function$
;
CREATE TRIGGER initialize_parent_managed_submissions_on_publish AFTER INSERT OR UPDATE OF status, team_id ON public.assignments FOR EACH ROW EXECUTE FUNCTION initialize_parent_managed_submissions_on_publish();
CREATE TRIGGER check_player_registration_review BEFORE UPDATE ON public.player_registration_requests FOR EACH ROW EXECUTE FUNCTION private.check_player_registration_review();
create policy "profiles_self_select" on public.profiles for SELECT to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR is_coach()));
create policy "profiles_coach_manage" on public.profiles for ALL to authenticated using (is_coach()) with check (is_coach());
create policy "teams_coach_manage" on public.teams for ALL to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) AND is_coach())) with check (((created_by = ( SELECT auth.uid() AS uid)) AND is_coach()));
create policy "managed_submissions_parent_update" on public.parent_managed_submissions for UPDATE to authenticated using (((status = ANY (ARRAY['not_started'::text, 'in_progress'::text])) AND (EXISTS ( SELECT 1
   FROM (parent_managed_players mp
     JOIN profiles p ON ((p.id = mp.parent_id)))
  WHERE ((mp.id = parent_managed_submissions.managed_player_id) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))))) with check (((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'submitted'::text, 'completed'::text])) AND (EXISTS ( SELECT 1
   FROM ((parent_managed_players mp
     JOIN profiles p ON ((p.id = mp.parent_id)))
     JOIN assignments a ON ((a.team_id = mp.team_id)))
  WHERE ((mp.id = parent_managed_submissions.managed_player_id) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active AND (a.id = parent_managed_submissions.assignment_id) AND (a.status = 'published'::assignment_status))))));
create policy "assignments_select" on public.assignments for SELECT to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR ((status = 'published'::assignment_status) AND (EXISTS ( SELECT 1
   FROM team_members tm
  WHERE ((tm.team_id = assignments.team_id) AND (tm.player_id = ( SELECT auth.uid() AS uid))))))));
create policy "assignments_coach_manage" on public.assignments for ALL to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) AND is_coach())) with check (((created_by = ( SELECT auth.uid() AS uid)) AND is_coach()));
create policy "questions_select" on public.questions for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = questions.assignment_id) AND ((a.created_by = ( SELECT auth.uid() AS uid)) OR ((a.status = 'published'::assignment_status) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = a.team_id) AND (tm.player_id = ( SELECT auth.uid() AS uid)))))))))));
create policy "questions_coach_manage" on public.questions for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = questions.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)) AND is_coach())))) with check ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = questions.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)) AND is_coach()))));
create policy "tasks_select" on public.training_tasks for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = training_tasks.assignment_id) AND ((a.created_by = ( SELECT auth.uid() AS uid)) OR ((a.status = 'published'::assignment_status) AND (EXISTS ( SELECT 1
           FROM team_members tm
          WHERE ((tm.team_id = a.team_id) AND (tm.player_id = ( SELECT auth.uid() AS uid)))))))))));
create policy "tasks_coach_manage" on public.training_tasks for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = training_tasks.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)) AND is_coach())))) with check ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = training_tasks.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)) AND is_coach()))));
create policy "submissions_select" on public.submissions for SELECT to authenticated using (((player_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = submissions.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "submissions_player_insert" on public.submissions for INSERT to authenticated with check (((player_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (assignments a
     JOIN team_members tm ON ((tm.team_id = a.team_id)))
  WHERE ((a.id = submissions.assignment_id) AND (a.status = 'published'::assignment_status) AND (tm.player_id = ( SELECT auth.uid() AS uid)))))));
create policy "submissions_player_update" on public.submissions for UPDATE to authenticated using ((player_id = ( SELECT auth.uid() AS uid))) with check ((player_id = ( SELECT auth.uid() AS uid)));
create policy "team_members_coach_manage" on public.team_members for ALL to authenticated using ((is_team_owner(team_id) AND is_coach())) with check ((is_team_owner(team_id) AND is_coach()));
create policy "submissions_coach_update" on public.submissions for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = submissions.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)) AND is_coach())))) with check ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = submissions.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)) AND is_coach()))));
create policy "answers_select" on public.answers for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (submissions s
     JOIN assignments a ON ((a.id = s.assignment_id)))
  WHERE ((s.id = answers.submission_id) AND ((s.player_id = ( SELECT auth.uid() AS uid)) OR (a.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "answers_player_manage" on public.answers for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = answers.submission_id) AND (s.player_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = answers.submission_id) AND (s.player_id = ( SELECT auth.uid() AS uid))))));
create policy "task_completions_select" on public.task_completions for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (submissions s
     JOIN assignments a ON ((a.id = s.assignment_id)))
  WHERE ((s.id = task_completions.submission_id) AND ((s.player_id = ( SELECT auth.uid() AS uid)) OR (a.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "task_completions_player_manage" on public.task_completions for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = task_completions.submission_id) AND (s.player_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = task_completions.submission_id) AND (s.player_id = ( SELECT auth.uid() AS uid))))));
create policy "parents_create_own_requests" on public.player_registration_requests for INSERT to authenticated with check (((parent_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND (p.active = true))))));
create policy "parents_view_own_requests" on public.player_registration_requests for SELECT to authenticated using ((parent_id = ( SELECT auth.uid() AS uid)));
create policy "teams_active_parent_select" on public.teams for SELECT to authenticated using (((active = true) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND (p.active = true))))));
create policy "teams_member_select" on public.teams for SELECT to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR is_team_member(id)));
create policy "team_members_select" on public.team_members for SELECT to authenticated using (((player_id = ( SELECT auth.uid() AS uid)) OR is_team_owner(team_id)));
create policy "managed_tasks_parent_update" on public.parent_managed_task_completions for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM ((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
  WHERE ((s.id = parent_managed_task_completions.submission_id) AND (s.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active)))) with check ((EXISTS ( SELECT 1
   FROM (((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
     JOIN training_tasks t ON ((t.assignment_id = s.assignment_id)))
  WHERE ((s.id = parent_managed_task_completions.submission_id) AND (t.id = parent_managed_task_completions.task_id) AND (s.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))));
create policy "parent_managed_players_parent_read" on public.parent_managed_players for SELECT to authenticated using (((parent_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND (p.active = true))))));
create policy "parent_managed_players_coach_read" on public.parent_managed_players for SELECT to authenticated using ((( SELECT is_coach() AS is_coach) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = parent_managed_players.team_id) AND (t.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "parent_managed_assignments_read" on public.assignments for SELECT to authenticated using (((status = 'published'::assignment_status) AND (EXISTS ( SELECT 1
   FROM parent_managed_players mp
  WHERE ((mp.team_id = assignments.team_id) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))))))));
create policy "parent_managed_questions_read" on public.questions for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN parent_managed_players mp ON ((mp.team_id = a.team_id)))
  WHERE ((a.id = questions.assignment_id) AND (a.status = 'published'::assignment_status) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active)))))));
create policy "parent_managed_tasks_read" on public.training_tasks for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (assignments a
     JOIN parent_managed_players mp ON ((mp.team_id = a.team_id)))
  WHERE ((a.id = training_tasks.assignment_id) AND (a.status = 'published'::assignment_status) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active)))))));
create policy "managed_submissions_parent_read" on public.parent_managed_submissions for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (parent_managed_players mp
     JOIN profiles p ON ((p.id = mp.parent_id)))
  WHERE ((mp.id = parent_managed_submissions.managed_player_id) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))));
create policy "managed_submissions_coach_read" on public.parent_managed_submissions for SELECT to authenticated using ((( SELECT is_coach() AS is_coach) AND (EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = parent_managed_submissions.assignment_id) AND (a.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "managed_submissions_parent_insert" on public.parent_managed_submissions for INSERT to authenticated with check (((status = 'not_started'::text) AND (started_at IS NULL) AND (submitted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM ((parent_managed_players mp
     JOIN profiles p ON ((p.id = mp.parent_id)))
     JOIN assignments a ON ((a.team_id = mp.team_id)))
  WHERE ((mp.id = parent_managed_submissions.managed_player_id) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active AND (a.id = parent_managed_submissions.assignment_id) AND (a.status = 'published'::assignment_status))))));
create policy "managed_answers_parent_read" on public.parent_managed_answers for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM ((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
  WHERE ((s.id = parent_managed_answers.submission_id) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))));
create policy "managed_answers_coach_read" on public.parent_managed_answers for SELECT to authenticated using ((( SELECT is_coach() AS is_coach) AND (EXISTS ( SELECT 1
   FROM (parent_managed_submissions s
     JOIN assignments a ON ((a.id = s.assignment_id)))
  WHERE ((s.id = parent_managed_answers.submission_id) AND (a.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "managed_answers_parent_insert" on public.parent_managed_answers for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM (((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
     JOIN questions q ON ((q.assignment_id = s.assignment_id)))
  WHERE ((s.id = parent_managed_answers.submission_id) AND (q.id = parent_managed_answers.question_id) AND (s.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))));
create policy "managed_answers_parent_update" on public.parent_managed_answers for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM ((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
  WHERE ((s.id = parent_managed_answers.submission_id) AND (s.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active)))) with check ((EXISTS ( SELECT 1
   FROM (((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
     JOIN questions q ON ((q.assignment_id = s.assignment_id)))
  WHERE ((s.id = parent_managed_answers.submission_id) AND (q.id = parent_managed_answers.question_id) AND (s.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))));
create policy "managed_tasks_parent_read" on public.parent_managed_task_completions for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM ((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
  WHERE ((s.id = parent_managed_task_completions.submission_id) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))));
create policy "managed_tasks_coach_read" on public.parent_managed_task_completions for SELECT to authenticated using ((( SELECT is_coach() AS is_coach) AND (EXISTS ( SELECT 1
   FROM (parent_managed_submissions s
     JOIN assignments a ON ((a.id = s.assignment_id)))
  WHERE ((s.id = parent_managed_task_completions.submission_id) AND (a.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "managed_tasks_parent_insert" on public.parent_managed_task_completions for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM (((parent_managed_submissions s
     JOIN parent_managed_players mp ON ((mp.id = s.managed_player_id)))
     JOIN profiles p ON ((p.id = mp.parent_id)))
     JOIN training_tasks t ON ((t.assignment_id = s.assignment_id)))
  WHERE ((s.id = parent_managed_task_completions.submission_id) AND (t.id = parent_managed_task_completions.task_id) AND (s.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])) AND (mp.parent_id = ( SELECT auth.uid() AS uid)) AND (p.role = 'parent'::user_role) AND p.active))));
create policy "coach_view_registration_requests" on public.player_registration_requests for SELECT to authenticated using ((( SELECT is_coach() AS is_coach) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = player_registration_requests.team_id) AND (t.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "coach_review_registration_requests" on public.player_registration_requests for UPDATE to authenticated using ((( SELECT is_coach() AS is_coach) AND (status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = player_registration_requests.team_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))))) with check ((( SELECT is_coach() AS is_coach) AND (status = ANY (ARRAY['approved'::text, 'rejected'::text])) AND (reviewed_by = ( SELECT auth.uid() AS uid)) AND (reviewed_at IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = player_registration_requests.team_id) AND (t.created_by = ( SELECT auth.uid() AS uid)))))));
create policy "    managed_submissions_coach_update" on public.parent_managed_submissions for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = parent_managed_submissions.assignment_id) AND (a.created_by = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM assignments a
  WHERE ((a.id = parent_managed_submissions.assignment_id) AND (a.created_by = auth.uid())))));
create policy "ftiq_mindset_read" on storage.objects for SELECT to authenticated using (((bucket_id = 'Mindset-Cirriculum'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['coach'::user_role, 'parent'::user_role, 'player'::user_role])))))));
create policy "coach_team_access_self_read" on public.coach_team_access for SELECT to authenticated using ((coach_id = ( SELECT auth.uid() AS uid)));
create policy "ftiq_mindset_upload" on storage.objects for INSERT to authenticated with check (((bucket_id = 'Mindset-Cirriculum'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = 'coach'::user_role))))));
create policy "ftiq_mindset_delete" on storage.objects for DELETE to authenticated using (((bucket_id = 'Mindset-Cirriculum'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = 'coach'::user_role))))));
create policy "mindset_resources_read" on public.mindset_resources for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['coach'::user_role, 'parent'::user_role, 'player'::user_role]))))));
create policy "mindset_resources_coach_manage" on public.mindset_resources for ALL to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = 'coach'::user_role)))))) with check (((created_by = ( SELECT auth.uid() AS uid)) AND ((file_path IS NULL) OR (split_part(file_path, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = 'coach'::user_role))))));
create policy "coach_team_access_team_owner_read" on public.coach_team_access for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = coach_team_access.team_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))));
create policy "player_team_memberships_parent_read" on public.player_team_memberships for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM parent_managed_players p
  WHERE ((p.id = player_team_memberships.managed_player_id) AND (p.parent_id = ( SELECT auth.uid() AS uid))))));
create policy "player_team_memberships_team_owner_read" on public.player_team_memberships for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = player_team_memberships.team_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))));
create policy "player_team_memberships_assigned_coach_read" on public.player_team_memberships for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM (coach_team_access ca
     JOIN profiles pr ON ((pr.id = ca.coach_id)))
  WHERE ((ca.team_id = player_team_memberships.team_id) AND (ca.coach_id = ( SELECT auth.uid() AS uid)) AND (pr.role = 'coach'::user_role) AND (pr.active = true)))));


-- Existing RLS flags (assignment_tasks is the known production exception).
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.assignments enable row level security;
alter table public.questions enable row level security;
alter table public.training_tasks enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
alter table public.task_completions enable row level security;
alter table public.player_registration_requests enable row level security;
alter table public.parent_managed_players enable row level security;
alter table public.parent_managed_submissions enable row level security;
alter table public.parent_managed_answers enable row level security;
alter table public.parent_managed_task_completions enable row level security;
alter table public.mindset_resources enable row level security;
alter table public.coach_team_access enable row level security;
alter table public.player_team_memberships enable row level security;
