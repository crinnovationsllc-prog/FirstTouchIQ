-- FirstTouchIQ: assistant-coach permissions
-- STAGE 2: Draft only. Do not apply to Supabase yet.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_administrators a
    JOIN public.profiles p ON p.id = a.user_id
    WHERE a.user_id = (SELECT auth.uid())
      AND p.role = 'coach'
      AND p.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_coach(
  requested_team_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.team_coaches tc
      JOIN public.profiles p ON p.id = tc.coach_id
      WHERE tc.team_id = requested_team_id
        AND tc.coach_id = (SELECT auth.uid())
        AND p.role = 'coach'
        AND p.active = true
    );
$$;
COMMIT;
