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
-- Only the administrator may approve or reject player registrations.
CREATE OR REPLACE FUNCTION public.review_player_request(
  request_id uuid,
  decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  approved_request public.player_registration_requests%ROWTYPE;
  managed_id uuid;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF decision IS NULL
     OR decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  UPDATE public.player_registration_requests
     SET status = decision,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = request_id
     AND status = 'pending'
   RETURNING * INTO approved_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending request not found';
  END IF;

  IF decision = 'approved' THEN
    INSERT INTO public.parent_managed_players (
      registration_request_id,
      parent_id,
      team_id,
      display_name
    )
    VALUES (
      approved_request.id,
      approved_request.parent_id,
      approved_request.team_id,
      approved_request.player_name
    )
    ON CONFLICT (registration_request_id) DO NOTHING;

    SELECT id INTO STRICT managed_id
    FROM public.parent_managed_players
    WHERE registration_request_id = approved_request.id;

    INSERT INTO public.parent_managed_submissions (
      assignment_id,
      managed_player_id,
      status
    )
    SELECT a.id, managed_id, 'not_started'
    FROM public.assignments a
    WHERE a.team_id = approved_request.team_id
      AND a.status = 'published'
    ON CONFLICT (assignment_id, managed_player_id) DO NOTHING;
  END IF;
END;
$$;
-- Only administrators can view all registration requests.
ALTER POLICY coach_view_registration_requests
ON public.player_registration_requests
USING (public.is_app_admin());

-- Only administrators can approve or reject requests.
ALTER POLICY coach_review_registration_requests
ON public.player_registration_requests
USING (
  public.is_app_admin()
  AND status = 'pending'
)
WITH CHECK (
  public.is_app_admin()
  AND status IN ('approved', 'rejected')
  AND reviewed_by = (SELECT auth.uid())
  AND reviewed_at IS NOT NULL
);

-- Prevent assistant coaches from changing user profiles,
-- including roles and active status.
ALTER POLICY profiles_coach_manage
ON public.profiles
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());
COMMIT;
