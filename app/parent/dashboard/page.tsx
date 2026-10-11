"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../../lib/supabase";

import { playerTeamIds, type TeamMembership } from "../../../lib/team-memberships";

type Player = {
  id: string;
  display_name: string;
  team_id: string;
  team_ids: string[];
};

type Team = {
  id: string;
  name: string;
};

type Assignment = {
  id: string;
  team_id: string;
  title: string;
  instructions: string | null;
  video_url: string | null;
  due_at: string | null;
};
type Question = {
  id: string;
  assignment_id: string;
  position: number;
  prompt: string;
  required: boolean;
};
type Task = {
  id: string;
  assignment_id: string;
  position: number;
  description: string;
};
type Submission = {

  assignment_id: string;

  status: string;

  answers: Record<string, string> | null;

  training_completed: boolean;

};

export default function ParentDashboard() {
  async function signOut() {

  await supabase?.auth.signOut()

  window.location.href = '/'

}
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [parentName, setParentName] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [savingAssignmentId, setSavingAssignmentId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const loadVersion = useRef(0);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const [draftAnswers, setDraftAnswers] = useState<Record<string, Record<string, string>>>({});
  const [trainingDrafts, setTrainingDrafts] = useState<Record<string, boolean>>({});

useEffect(() => {
    async function load() {
      if (!supabase) {
        setMessage("Supabase is not configured.");
        return;
      }

      const { data: auth } = await supabase.auth.getUser();

      if (!auth.user) {
        setMessage("Please sign in to your parent account.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,active,display_name")
        .eq("id", auth.user.id)
        .single();

      if (profileError || profile?.role !== "parent" || !profile.active) {
        setMessage("An active parent account is required.");
        return;
      }
      setParentName(profile.display_name || "Parent");
      const { data: children, error: playerError } = await supabase
        .from("parent_managed_players")
        .select("id,display_name,team_id")
        .eq("parent_id", auth.user.id)
        .order("display_name");

      if (playerError) {
        setMessage(playerError.message);
        return;
      }

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id,name")
        .eq("active", true);

      if (teamError) {
        setMessage(teamError.message);
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from("player_team_memberships").select("managed_player_id,team_id");
      if (membershipError) { setMessage(membershipError.message); return; }
      setPlayers((children || []).map(player => ({ ...player,
        team_ids: playerTeamIds(player, (memberships || []) as TeamMembership[]),
      })));
      setTeams(teamData || []);
      setSelectedId(children?.[0]?.id || "");
      setMessage("");
    }

    load();
  }, []);

  useEffect(() => {
    const version = ++loadVersion.current;
    let cancelled = false;
    setAssignments([]); setQuestions([]); setTasks([]); setSubmissions([]);
    setDraftAnswers({}); setTrainingDrafts({}); setAssignmentMessage("");
    const selected = players.find(player => player.id === selectedId);
    if (!supabase || !selected) { setAssignmentsLoading(false); return; }
    const client = supabase;
    setAssignmentsLoading(true);
    async function loadAssignments() {
      try {
        const { data: assignmentData, error } = await client.from("assignments")
          .select("id,team_id,title,instructions,video_url,due_at")
          .in("team_id", selected!.team_ids).eq("status", "published")
          .order("due_at", { ascending: true, nullsFirst: false });
        if (error) throw error;
        const ids = (assignmentData || []).map(a => a.id);
        const results = ids.length ? await Promise.all([
          client.from("questions").select("id,assignment_id,position,prompt,required").in("assignment_id", ids).order("position"),
          client.from("assignment_tasks").select("id,assignment_id,position,description").in("assignment_id", ids).order("position"),
          client.from("parent_managed_submissions").select("assignment_id,status,answers,training_completed")
            .eq("managed_player_id", selected!.id).in("assignment_id", ids),
        ]) : [];
        const failure = results.find(r => r.error)?.error;
        if (failure) throw failure;
        if (cancelled || version !== loadVersion.current) return;
        setAssignments(assignmentData || []);
        setQuestions((results[0]?.data || []) as Question[]);
        setTasks((results[1]?.data || []) as Task[]);
        setSubmissions((results[2]?.data || []) as Submission[]);
      } catch (error) {
        if (!cancelled) setAssignmentMessage(error instanceof Error ? error.message : "Could not load assignments. Refresh and try again.");
      } finally { if (!cancelled) setAssignmentsLoading(false); }
    }
    void loadAssignments();
    return () => { cancelled = true; };
  }, [players, selectedId]);

  const selected = players.find((player) => player.id === selectedId);
  const playerTeams = teams.filter(team => selected?.team_ids.includes(team.id));
  const visibleAssignments = assignments.filter(a => !teamFilter || a.team_id === teamFilter);
  const completedCount = submissions.filter((item) =>
  ["completed", "submitted", "reviewed"].includes(item.status) && visibleAssignments.some(a => a.id === item.assignment_id)
).length;

const dueCount = Math.max(visibleAssignments.length - completedCount, 0);

const progressPercent = visibleAssignments.length
  ? Math.round((completedCount / visibleAssignments.length) * 100)
  : 0;
async function saveProgress(assignmentId: string, status: "in_progress" | "completed") {
  if (!supabase || !selected || savingAssignmentId) return;
  const existing = submissions.find((item) => item.assignment_id === assignmentId);
  if (existing && ["completed", "submitted", "reviewed"].includes(existing.status)) {
    setAssignmentMessage("This assignment is already complete.");
    return;
  }
const assignmentAnswers = draftAnswers[assignmentId] ??
  existing?.answers ??
  {};
  const trainingCompleted = trainingDrafts[assignmentId] ?? existing?.training_completed ?? false;
  const version = loadVersion.current;
  if (status === "completed" && questions.some(q => q.assignment_id === assignmentId && q.required && !assignmentAnswers[q.id]?.trim())) {
    setAssignmentMessage("Please answer each required question before completing."); return;
  }
  if (status === "completed" && tasks.some(t => t.assignment_id === assignmentId) && !trainingCompleted) {
    setAssignmentMessage("Confirm the training tasks are complete first."); return;
  }
  setSavingAssignmentId(assignmentId);
  setAssignmentMessage("Saving progress...");

  const { data, error } = await supabase

    .from("parent_managed_submissions")

    .update({

      status,

      answers: assignmentAnswers,

      training_completed: trainingCompleted,

    })

    .eq("assignment_id", assignmentId)

    .eq("managed_player_id", selected.id)
.select("assignment_id");
if (version !== loadVersion.current) { setSavingAssignmentId(""); return; }
if (!error && (!data || data.length === 0)) {
  setAssignmentMessage("Save failed. Refresh the page and check the assignment status before trying again.");
  setSavingAssignmentId("");
  return;
}
  if (error) {

    setAssignmentMessage(`Save failed: ${error.message}`);
    setSavingAssignmentId("");

    return;

  }

  setSubmissions((previous) => [

  ...previous.filter((item) => item.assignment_id !== assignmentId),

  {

    assignment_id: assignmentId,

    status,

    answers: assignmentAnswers,

    training_completed: trainingCompleted,

  },

]);
setAssignmentMessage(status === "completed" ? "Assignment completed." : "Progress saved.");
setSavingAssignmentId("");
}
  
  return (
  <>
    <header className="topbar">
      <div>
        <div className="brand">
          FirstTouch<span>IQ</span>
        </div>
        <div className="tag">Watch. Think. Train. Develop.</div>
      </div>

      <div className="userbox">
        <div>
          <strong>Parent Dashboard</strong>
          <small>Parent</small>
        </div>

        <button className="ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
    </header>

    <main className="wrap">
      <nav className="tabs" aria-label="Parent dashboard navigation">
  <a href="/parent/dashboard" aria-current="page">
    Assignments
  </a>
  <a href="/parent/request">Add player or team</a>
  <a href="/parent/mindset">
    Mindset &amp; Confidence
  </a>
</nav>
      <div className="welcome parentWelcome">
  <div className="eyebrow">PARENT DASHBOARD</div>
  <h1>Welcome, {parentName || "Parent"}</h1>
  <p className="muted">
    Manage your players and weekly development below.
  </p>
</div>

<div className="developmentBanner">
  <span>WATCH</span>
  <i>→</i>
  <span>THINK</span>
  <i>→</i>
  <span>TRAIN</span>
  <i>→</i>
  <span>DEVELOP</span>
</div>
<div className="metrics parentMetrics">
  <div className="card metric">
    <span className="muted">Players</span>
    <b>{players.length}</b>
  </div>

  <div className="card metric">
    <span className="muted">Assignments Due</span>
    <b>{dueCount}</b>
  </div>

  <div className="card metric">
    <span className="muted">Completed</span>
    <b>{completedCount}</b>
  </div>
</div>
      {message && <p role="status">{message}</p>}

      {players.length > 0 ? (
        <>
          <label htmlFor="child">Select player</label>

          <select
  id="child"
  className="parentSelect"
  value={selectedId}
  disabled={Boolean(savingAssignmentId)}
  onChange={(event) => { ++loadVersion.current; setAssignments([]); setSubmissions([]); setSelectedId(event.target.value); setTeamFilter(""); }}
>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.display_name}
              </option>
            ))}
          </select>

          {selected && (
  <section className="card section parentPlayerCard">
    <div className="parentPlayerSummary">
      <div className="parentPlayerAvatar">
        {selected.display_name.slice(0, 1).toUpperCase()}
      </div>

      <div className="grow">
        <div className="eyebrow">PLAYER PROFILE</div>
        <h2>{selected.display_name}</h2>
        <span className="teamBadge">
          {playerTeams.map(team => team.name).join(" · ") || "Team unavailable"}
        </span>
      </div>

      <div className="parentCompletion">
  {visibleAssignments.length > 0 ? (
    <>
      <strong>{completedCount}/{visibleAssignments.length}</strong>
      <span>completed</span>
    </>
  ) : (
    <>
      <strong>No assignments</strong>
      <span>this week</span>
    </>
  )}
</div>
    </div>

    {visibleAssignments.length > 0 && (
  <>
    <div className="progress parentProgress">
      <i style={{ width: `${progressPercent}%` }} />
    </div>

    <div className="parentProgressCaption">
      <span>Weekly progress</span>
      <strong>{progressPercent}%</strong>
    </div>
  </>
)}

    <div className="parentAssignmentHeader">
      <div>
        <div className="eyebrow">WEEKLY HOMEWORK</div>
        <h3>Assignments</h3>
      </div>

      {dueCount > 0 && (
        <span className="pill">{dueCount} remaining</span>
      )}
    </div>
              <label htmlFor="assignment-team">Assignments for</label>
              <select id="assignment-team" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
                <option value="">All my teams</option>
                {playerTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              {assignmentsLoading && <p role="status">Loading assignments…</p>}
              {assignmentMessage && (
                <p role="status">{assignmentMessage}</p>
              )}

              {!assignmentsLoading && !assignmentMessage && visibleAssignments.length === 0 && (
  <div className="empty parentEmpty">
    <div className="parentEmptyIcon">⚽</div>
    <h3>You&apos;re all caught up!</h3>
    <p>No new assignments this week.</p>
  </div>
)}

              {visibleAssignments.map((assignment) => {
                const submission = submissions.find(
                  (item) => item.assignment_id === assignment.id
                );
                const isComplete =
  submission?.status === "completed" ||
  submission?.status === "submitted" ||
  submission?.status === "reviewed";

const assignmentProgress = isComplete
  ? 100
  : submission?.status === "in_progress"
    ? 50
    : 0;
                return (
                  <article
  key={assignment.id}
  className={`parentAssignmentCard${isComplete ? " complete" : ""}`}
>
  <div className="parentAssignmentTop">
    <div>
      <div className="eyebrow">{teams.find(team => team.id === assignment.team_id)?.name || "FIRSTTOUCHIQ ASSIGNMENT"}</div>
      <h4>{assignment.title}</h4>
    </div>

    <span className={`pill${isComplete ? " success" : ""}`}>
      {submission?.status
        ? submission.status.replace(/_/g, " ")
        : "Not started"}
    </span>
  </div>

                    {assignment.instructions && (
  <p className="parentInstructions">
    {assignment.instructions}
  </p>
)}

<div className="progress parentAssignmentProgress">
  <i style={{ width: `${assignmentProgress}%` }} />
</div>

                    {assignment.due_at && (
  <div className="dueBadge">
    Due {new Date(assignment.due_at).toLocaleString()}
  </div>
)}

                    {assignment.video_url && (
  <a
    className="secondary parentVideoLink"
    href={assignment.video_url}
    target="_blank"
    rel="noopener noreferrer"
  >
    ▶ Watch training video
  </a>
)}
{questions
  .filter((question) => question.assignment_id === assignment.id)
  .map((question) => (
    <div key={question.id} className="parentQuestion">
      <label htmlFor={`answer-${assignment.id}-${question.id}`}>
        {question.prompt}
      </label>

      <textarea
        id={`answer-${assignment.id}-${question.id}`}
        value={
          draftAnswers[assignment.id]?.[question.id] ??
          submission?.answers?.[question.id] ??
          ""
        }
        onChange={(event) =>
          setDraftAnswers((previous) => ({
            ...previous,
            [assignment.id]: {
              ...(previous[assignment.id] ??
                submission?.answers ??
                {}),
              [question.id]: event.target.value,
            },
          }))
        }
        disabled={isComplete}
        rows={3}
      />
    </div>
  ))}
{tasks
  .filter((task) => task.assignment_id === assignment.id)
  .map((task) => (
    <div key={task.id} className="parentTask">
      <div className="parentTaskIcon">⚽</div>

      <div>
        <strong>Training Task</strong>
        <p>{task.description}</p>
      </div>
    </div>
  ))}
                    {tasks.some(task => task.assignment_id === assignment.id) && <label>
                      <input type="checkbox" disabled={isComplete || Boolean(savingAssignmentId)}
                        checked={trainingDrafts[assignment.id] ?? submission?.training_completed ?? false}
                        onChange={event => setTrainingDrafts(previous => ({...previous, [assignment.id]: event.target.checked}))} />
                      I completed the training tasks.
                    </label>}
              <button
  type="button"
  className="secondary"
  disabled={isComplete || Boolean(savingAssignmentId)}
  onClick={() => saveProgress(assignment.id, "in_progress")}
>

  Save progress

</button> 
                    <div className="parentAssignmentActions">
                  <button

  type="button"
  className="primary"
  disabled={isComplete || Boolean(savingAssignmentId)}
  onClick={() => saveProgress(assignment.id, "completed")}

>

  Mark Complete

</button>
                      </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      ) : (
  !message && (
    <div className="empty parentEmpty">
      <div className="parentEmptyIcon">⚽</div>
      <h3>No approved players yet</h3>
      <p>Register a player to begin receiving weekly assignments.</p>
    </div>
  )
)}

      <div className="parentActions">
  <a className="primary parentAction" href="/parent/request">
    + Register another player
  </a>

</div>
       </main>
  </>
  );
}
