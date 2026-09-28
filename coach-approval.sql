-- Run once in the production Supabase SQL editor before deploying the coach page.
-- Parent and team details cannot be changed during a review.
create schema if not exists private;

create or replace function private.check_player_registration_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

drop trigger if exists check_player_registration_review on public.player_registration_requests;
create trigger check_player_registration_review
before update on public.player_registration_requests
for each row execute function private.check_player_registration_review();

-- Approval, player creation, and initial assignment rows stay in one transaction.
-- Check the coach's team explicitly: SECURITY DEFINER bypasses table RLS.
create or replace function public.review_player_request(request_id uuid, decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.review_player_request(uuid,text) from public, anon;
grant execute on function public.review_player_request(uuid,text) to authenticated;

-- A coach may review only requests for teams they created.
drop policy if exists coach_view_registration_requests on public.player_registration_requests;
create policy coach_view_registration_requests
on public.player_registration_requests
for select to authenticated
using (
  (select public.is_coach())
  and exists (
    select 1 from public.teams t
    where t.id = team_id and t.created_by = (select auth.uid())
  )
);

drop policy if exists coach_review_registration_requests on public.player_registration_requests;
create policy coach_review_registration_requests
on public.player_registration_requests
for update to authenticated
using (
  (select public.is_coach())
  and status = 'pending'
  and exists (
    select 1 from public.teams t
    where t.id = team_id and t.created_by = (select auth.uid())
  )
)
with check (
  (select public.is_coach())
  and status in ('approved', 'rejected')
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
  and exists (
    select 1 from public.teams t
    where t.id = team_id and t.created_by = (select auth.uid())
  )
);
