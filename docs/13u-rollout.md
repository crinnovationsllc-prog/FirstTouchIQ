# FirstTouchIQ 13U rollout checkpoint

Prepared October 11, 2026. **Not deployed; Kari is not activated.**

## Verified production targets

- GitHub: `crinnovationsllc-prog/FirstTouchIQ`; base main `734585191f74a1c06d7f591b19c77c92b7137acc`.
- Vercel: `firsttouchiq`, project `prj_JF570w3dqm0NkhHCznVkkFort0vf`; custom domain `firsttouchiq.com`.
- Production Supabase: `pdlmtckcptykjypawxwq`. Do not use the inactive development project.
- Existing verified Coach Kari account: `mamakariadams3@gmail.com`; role remains `player` until release gates pass.
- Coach Christian remains a coach, with administrator rights in a private trusted table after migration.
- Baseline: 3 teams, 27 managed player records, 33 memberships (including 6 secondary 13U memberships), 54 managed submissions, 1 existing coach-team assignment.

## Blocker

GitHub `create_branch` returned `403 Resource not accessible by integration` even though repository metadata reports push permission. The GitHub App connection needs repository contents write access. No alternative write path was used. No remote branch, commit, PR, migration, or role change was made.

## Prepared changes

- Team-scoped policies for profiles, assignments, content, approvals, rosters and progress. `assignment_tasks` RLS enabled; legacy global profile-management policy removed.
- Private authorization helpers use verified database roles and team assignments, not user-editable Auth metadata.
- Christian administers every team and assignments authored by another coach. Kari can only manage assigned 13U work and approvals; cannot change roles or grant access.
- Shared curriculum remains readable by coaches; global curriculum management stays with Christian.
- Existing managed players keep their original IDs and primary team. Membership rows add teams. Dashboard queries combine membership IDs without duplicating players.
- Parent registration offers an existing-player selector. Atomic approvals serialize by parent, reuse the requested player (or an unambiguous matching existing name), add membership once, and initialize only missing progress.
- Publishing starts as a draft; questions and tasks must save before it is published. Membership/publish triggers insert only missing submission rows.
- Assignment/submission identity guards prevent reassignment. Assignments with submission records must be archived instead of deleted.

## Local validation completed

- `npm run test:security`: **18 passed**, using PGlite PostgreSQL with a sanitized reconstruction of the inspected production schema, constraints, policies, functions and triggers.
- Fixtures contain fake user/player data, model 27 players, 33 memberships and 54 submissions. Existing submission values are compared before/after migration.
- Tests cover Kari's allow/deny access, profile escalation, membership grants, other-team content, 13U publication fanout, dual-team parents, review isolation, administrator access, duplicate approvals, global curriculum, direct players, inactive coaches and anonymous access.
- `npm run build`: passed including TypeScript and all route generation.
- `git diff --check`: passed.

**These are local database and build checks, not live Auth/PostgREST, browser, deployment, or production RLS verification.**

## Required release sequence

1. Repair GitHub write access. Refresh main and compare changes before publishing local branch `fix/13u-team-access` and opening a PR. Rebase if main changed, rerun checks.
2. Capture fresh production schema/policies and per-record snapshots or hashes of memberships, assignments, questions, tasks and submissions (do not publish private player data). Reconcile any schema changes since this inspection.
3. Review and apply `supabase/migrations/20261011182237_team_scoped_coaches_and_multi_team_players.sql` to the confirmed production project. This migration does not create 13U, duplicate the coach assignment, or activate Kari. It preserves original data and only fills missing membership/submission rows.
4. Re-run live Supabase security advisors. Confirm task RLS and public function findings are resolved. The existing leaked-password-protection warning is separate from this change.
5. Exercise actual RLS as `authenticated` with representative JWT subjects inside a transaction that always rolls back. Simulate Kari's coach role only within that uncommitted transaction, test 13U allow and 11U/12U deny for reads and writes, cross-team approvals, role escalation, parent isolation, and Christian admin access. Do not commit temporary test data or Kari's role.
6. Check the exact preview build/commit and production Supabase environment. Test browser flows with dedicated test accounts/fixtures; do not obtain or change Kari's password. Do not treat mocked sessions or a READY build as end-to-end verification.
7. Publish the tested application; verify the production deployment matches the intended commit and domain. Check logged-out, Christian and parent flows below while Kari remains a Player.
8. Only after all checks pass, update the existing verified Kari profile to `role='coach', active=true`, rechecking her one 13U assignment and Christian administrator membership in the same transaction. Do not create an Auth account or resend an invite. Confirm the post-activation access boundaries and retained progress. Kari may need to sign out and back in.

## Browser checklist

- Christian signs in: all three teams; one row per player; both team badges for dual-team players; team-specific assignment history; edits/reviews Kari-created 13U work.
- Parent of a dual-team player: one player entry; All my teams, 12U and 13U filters; old answers/status retained; training tasks load; save and complete write to the selected child's existing ID. Reload retains values. Rapid child switches must not display or save stale work.
- Existing-player team request: same player ID after approval; no extra profile, primary-team replacement or duplicated submissions. A new dual-team player's two approvals create one player.
- Kari: only 13U in dashboard/create/approvals/progress; six existing dual-team players visible, but their 12U submissions and answers inaccessible even by direct requests with known IDs; no profile role changes or access grants.
- Completed/reviewed work stays complete in counts; review buttons work only on submitted/completed work; Back to FirstTouchIQ returns to `/`.
- Unrelated parent, direct player, inactive account and anonymous sessions cannot obtain another team's private records.
- Browser console/network has no RLS errors, missing configuration screen, hydration failures or unexpected sign-in redirects.

Supabase remediation references:
- [Missing table RLS](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)
- [Public SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Signed-in SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
