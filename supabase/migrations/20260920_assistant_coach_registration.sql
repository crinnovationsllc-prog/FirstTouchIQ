-- FirstTouchIQ assistant-coach registration
-- DRAFT ONLY: do not execute against Supabase.
-- Requires the foundation and permissions migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_role text;
  is_existing_admin boolean;
BEGIN
  requested_role := NEW.raw_user_meta_data ->> 'role';

  is_existing_admin :=
    lower(coalesce(NEW.email, '')) =
    'crinnovationsllc@gmail.com';

  INSERT INTO public.profiles (
    id, role, display_name, username, active
  )
  VALUES (
    NEW.id,
    CASE
      WHEN is_existing_admin THEN 'coach'::public.user_role
      WHEN requested_role = 'coach' THEN 'coach'::public.user_role
      WHEN requested_role = 'parent' THEN 'parent'::public.user_role
      ELSE 'player'::public.user_role
    END,
    CASE
      WHEN is_existing_admin THEN 'Coach Christian'
      ELSE coalesce(
        nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
        'Player'
      )
    END,
    NULL,
    CASE
      WHEN requested_role = 'coach'
           AND NOT is_existing_admin THEN FALSE
      ELSE TRUE
    END
  )
  ON CONFLICT (id) DO NOTHING;

  IF requested_role = 'coach'
     AND NOT is_existing_admin THEN
    INSERT INTO public.coach_registration_requests (
      applicant_id, status
    )
    VALUES (NEW.id, 'pending')
    ON CONFLICT (applicant_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
-- Only the administrator can approve or reject coaches.
CREATE OR REPLACE FUNCTION public.review_coach_request(
  request_id uuid,
  decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  applicant uuid;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF decision IS NULL
     OR decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT applicant_id
  INTO applicant
  FROM public.coach_registration_requests
  WHERE id = request_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending coach request not found';
  END IF;

  IF decision = 'approved' THEN
    IF (
      SELECT count(*)
      FROM public.teams
      WHERE id IN (
        '68d64915-1049-4a3d-9877-63849532d221',
        '5a4a42a7-99a0-4bc0-9128-afdf6c619e1e'
      )
      AND active = true
    ) <> 2 THEN
      RAISE EXCEPTION 'Both teams must exist and be active';
    END IF;

    INSERT INTO public.team_coaches (team_id, coach_id)
    SELECT id, applicant
    FROM public.teams
    WHERE id IN (
      '68d64915-1049-4a3d-9877-63849532d221',
      '5a4a42a7-99a0-4bc0-9128-afdf6c619e1e'
    )
    ON CONFLICT (team_id, coach_id) DO NOTHING;

    UPDATE public.profiles
    SET role = 'coach',
        active = true
    WHERE id = applicant;
  END IF;

  UPDATE public.coach_registration_requests
  SET status = decision,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_coach_request(uuid, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.review_coach_request(uuid, text)
TO authenticated;
-- Allow administrators to view all coach applications.
-- Applicants can view only their own applications.
GRANT SELECT ON public.coach_registration_requests
TO authenticated;

CREATE POLICY coach_requests_admin_read
ON public.coach_registration_requests
FOR SELECT TO authenticated
USING (public.is_app_admin());

CREATE POLICY coach_requests_applicant_read
ON public.coach_registration_requests
FOR SELECT TO authenticated
USING (applicant_id = (SELECT auth.uid()));

COMMIT;
