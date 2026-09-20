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
-- Approved coaches can view their assigned teams.
CREATE POLICY team_coaches_read_assigned
ON public.teams
FOR SELECT
TO authenticated
USING (public.is_team_coach(id));
-- Approved coaches can view assignments for their teams.
CREATE POLICY assignments_team_coaches_read
ON public.assignments
FOR SELECT
TO authenticated
USING (public.is_team_coach(team_id));
-- Approved coaches can create assignments for their teams.
CREATE POLICY assignments_team_coaches_insert
ON public.assignments
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND public.is_team_coach(team_id)
);
-- Assistants may edit their own assignments.
-- Administrators may edit any assignment.
ALTER POLICY assignments_coach_manage
ON public.assignments
USING (
  public.is_app_admin()
  OR (
    created_by = (SELECT auth.uid())
    AND public.is_team_coach(team_id)
  )
)
WITH CHECK (
  public.is_app_admin()
  OR (
    created_by = (SELECT auth.uid())
    AND public.is_team_coach(team_id)
  )
);
-- Prevent assignment ownership from being changed.
CREATE OR REPLACE FUNCTION public.protect_assignment_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Assignment ownership cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_assignment_owner
BEFORE UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.protect_assignment_owner();
-- Only the administrator can update player submissions.
ALTER POLICY submissions_coach_update
ON public.submissions
USING (
  public.is_app_admin()
  AND EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = submissions.assignment_id
  )
)
WITH CHECK (
  public.is_app_admin()
  AND EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = submissions.assignment_id
  )
);
-- Approved coaches can view player submissions.
CREATE POLICY submissions_team_coaches_read
ON public.submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = submissions.assignment_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view parent-managed submissions.
CREATE POLICY managed_submissions_team_coaches_read
ON public.parent_managed_submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = parent_managed_submissions.assignment_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view parent-managed answers.
CREATE POLICY managed_answers_team_coaches_read
ON public.parent_managed_answers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.parent_managed_submissions s
    JOIN public.assignments a
      ON a.id = s.assignment_id
    WHERE s.id = parent_managed_answers.submission_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view training-task completion records.
CREATE POLICY managed_tasks_team_coaches_read
ON public.parent_managed_task_completions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.parent_managed_submissions s
    JOIN public.assignments a
      ON a.id = s.assignment_id
    WHERE s.id = parent_managed_task_completions.submission_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view players on their assigned teams.
CREATE POLICY managed_players_team_coaches_read
ON public.parent_managed_players
FOR SELECT
TO authenticated
USING (public.is_team_coach(team_id));
-- Approved coaches can view questions for their teams.
CREATE POLICY questions_team_coaches_read
ON public.questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = questions.assignment_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view training tasks for their teams.
CREATE POLICY training_tasks_team_coaches_read
ON public.training_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = training_tasks.assignment_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view player answers for their teams.
CREATE POLICY answers_team_coaches_read
ON public.answers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.assignments a
      ON a.id = s.assignment_id
    WHERE s.id = answers.submission_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view player training-task completions.
CREATE POLICY task_completions_team_coaches_read
ON public.task_completions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.submissions s
    JOIN public.assignments a
      ON a.id = s.assignment_id
    WHERE s.id = task_completions.submission_id
      AND public.is_team_coach(a.team_id)
  )
);
-- Approved coaches can view player rosters for their teams.
CREATE POLICY team_members_team_coaches_read
ON public.team_members
FOR SELECT
TO authenticated
USING (public.is_team_coach(team_id));
-- Administrator can manage questions on any assignment.
ALTER POLICY questions_coach_manage
ON public.questions
USING (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = questions.assignment_id
      AND (
        public.is_app_admin()
        OR (
          a.created_by = auth.uid()
          AND public.is_team_coach(a.team_id)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.assignments a
    WHERE a.id = questions.assignment_id
      AND (
        public.is_app_admin()
        OR (
          a.created_by = auth.uid()
          AND public.is_team_coach(a.team_id)
        )
      )
  )
);
COMMIT;
