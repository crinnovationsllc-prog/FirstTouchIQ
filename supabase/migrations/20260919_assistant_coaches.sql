-- FirstTouchIQ: assistant-coach foundation
-- STAGE 1 ONLY.
-- Do not apply to production until the complete feature is reviewed.
-- This migration does not activate assistant-coach registration.

BEGIN;

-- Administrator identities are controlled by the database,
-- not by editable user profile fields.
CREATE TABLE IF NOT EXISTS public.app_administrators (
  user_id uuid PRIMARY KEY
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Preserve Christian's existing administrator access.
-- Fail rather than silently creating a system with no administrator.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = '11f81720-42dc-4a31-8198-0dbfcfd57809'
      AND lower(u.email) = 'crinnovationsllc@gmail.com'
      AND p.role = 'coach'
      AND p.active = true
  ) THEN
    RAISE EXCEPTION 'Expected administrator account was not found';
  END IF;
END;
$$;

INSERT INTO public.app_administrators (user_id)
VALUES ('11f81720-42dc-4a31-8198-0dbfcfd57809')
ON CONFLICT (user_id) DO NOTHING;

-- An approved coach can belong to multiple teams.
CREATE TABLE IF NOT EXISTS public.team_coaches (
  team_id uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, coach_id)
);

-- Requests are separate from active coaching permissions.
CREATE TABLE IF NOT EXISTS public.coach_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL UNIQUE
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid
    REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No browser user can directly change administrator identities,
-- coach memberships, or approval requests.
ALTER TABLE public.app_administrators
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_coaches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coach_registration_requests
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_administrators
  FROM anon, authenticated;

REVOKE ALL ON public.team_coaches
  FROM anon, authenticated;

REVOKE ALL ON public.coach_registration_requests
  FROM anon, authenticated;

-- Membership and approval operations will be introduced in
-- a later, reviewed migration using restricted database functions.

COMMIT;
