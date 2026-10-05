"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Player = {
  id: string;
  display_name: string;
  team_id: string;
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
const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftAnswers, setDraftAnswers] = useState<Record<string, Record<string, string>>>({});
  const [trainingCompleted, setTrainingCompleted] = useState(false);

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

      setPlayers(children || []);
      setTeams(teamData || []);
      setSelectedId(children?.[0]?.id || "");
      setMessage("");
    }

    load();
  }, []);

  useEffect(() => {
    async function loadAssignments() {
      setAssignments([]);
      setQuestions([]);
      setSubmissions([]);
      setDraftAnswers({});
      setAssignmentMessage("");

      const selected = players.find((player) => player.id === selectedId);

      if (!supabase || !selected) return;

      const { data: assignmentData, error: assignmentError } = await supabase
        .from("assignments")
        .select("id,team_id,title,instructions,video_url,due_at")
        .eq("team_id", selected.team_id)
        .eq("status", "published")
        .order("due_at", { ascending: true, nullsFirst: false });

      if (assignmentError) {
        setAssignmentMessage(`Assignment error: ${assignmentError.message}`);
        return;
      }
      if (assignmentData && assignmentData.length > 0) {
  const { data: questionData, error: questionError } = await supabase
    .from("questions")
    .select("id,assignment_id,position,prompt,required")
    .in("assignment_id", assignmentData.map((assignment) => assignment.id))
    .order("position");

  if (questionError) {
    setAssignmentMessage(`Question error: ${questionError.message}`);
    return;
  }

  setQuestions(questionData || []);
  const { data: taskData, error: taskError } = await supabase
  .from("assignment_tasks")
  .select("id,assignment_id,position,description")
  .in("assignment_id", assignmentData.map((assignment) => assignment.id))
  .order("position");

if (taskError) {
  setAssignmentMessage(`Task error: ${taskError.message}`);
  return;
}

setTasks(taskData || []);      
}
      const { data: submissionData, error: submissionError } = await supabase
        .from("parent_managed_submissions")
        .select("assignment_id,status,answers,training_completed")
        .eq("managed_player_id", selected.id);

      if (submissionError) {
        setAssignmentMessage(`Progress error: ${submissionError.message}`);
        return;
      }

      setAssignments(assignmentData || []);
      setSubmissions(submissionData || []);
      setAnswers({});
      setTrainingCompleted(false);
    }
    loadAssignments();
  }, [players, selectedId]);

  const selected = players.find((player) => player.id === selectedId);
  const team = teams.find((item) => item.id === selected?.team_id);
  const completedCount = submissions.filter((item) =>
  ["completed", "submitted", "reviewed"].includes(item.status)
).length;

const dueCount = Math.max(assignments.length - completedCount, 0);

const progressPercent = assignments.length
  ? Math.round((completedCount / assignments.length) * 100)
  : 0;
async function saveProgress(assignmentId: string, status: "in_progress" | "completed") {
  if (!supabase || !selected || savingAssignmentId) return;
  const existing = submissions.find((item) => item.assignment_id === assignmentId);
  if (existing?.status === "completed" || existing?.status === "submitted") {
    setAssignmentMessage("This assignment is already complete.");
    return;
  }
const assignmentAnswers = draftAnswers[assignmentId] ??
  existing?.answers ??
  {};
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
  onChange={(event) => setSelectedId(event.target.value)}
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
          {team?.name || "Team unavailable"}
        </span>
      </div>

      <div className="parentCompletion">
  {assignments.length > 0 ? (
    <>
      <strong>{completedCount}/{assignments.length}</strong>
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

    {assignments.length > 0 && (
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
              {assignmentMessage && (
                <p role="status">{assignmentMessage}</p>
              )}

              {!assignmentMessage && assignments.length === 0 && (
  <div className="empty parentEmpty">
    <div className="parentEmptyIcon">⚽</div>
    <h3>You&apos;re all caught up!</h3>
    <p>No new assignments this week.</p>
  </div>
)}

              {assignments.map((assignment) => {
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
      <div className="eyebrow">FIRSTTOUCHIQ ASSIGNMENT</div>
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
