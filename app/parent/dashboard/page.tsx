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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [assignmentMessage, setAssignmentMessage] = useState("");
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
        .select("role,active")
        .eq("id", auth.user.id)
        .single();

      if (profileError || profile?.role !== "parent" || !profile.active) {
        setMessage("An active parent account is required.");
        return;
      }

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
async function saveProgress(assignmentId: string, status: "in_progress" | "completed") {


  if (!supabase || !selected) return;
const assignmentAnswers = draftAnswers[assignmentId] ??
  submissions.find((item) => item.assignment_id === assignmentId)?.answers ??
  {};
  setAssignmentMessage("Saving progress...");

  const { error } = await supabase

    .from("parent_managed_submissions")

    .update({

      status,

      answers: assignmentAnswers,

      training_completed: trainingCompleted,

    })

    .eq("assignment_id", assignmentId)

    .eq("managed_player_id", selected.id)

    ;

  if (error) {

    setAssignmentMessage(`Save failed: ${error.message}`);

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
setAssignmentMessage("Progress saved.");
}
  
  return (
    <main style={{ maxWidth: 700, margin: "40px auto", padding: 20 }}>
      <h1>Parent Dashboard</h1>
      <button onClick={signOut}>Sign out</button>
      <p>Manage your children's FirstTouchIQ profiles.</p>

      {message && <p role="status">{message}</p>}

      {players.length > 0 ? (
        <>
          <label htmlFor="child">Select player</label>

          <select
            id="child"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            style={{ display: "block", margin: "12px 0", padding: 10 }}
          >
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.display_name}
              </option>
            ))}
          </select>

          {selected && (
            <section style={{ border: "1px solid #888", padding: 20 }}>
              <h2>{selected.display_name}</h2>
              <p>Team: {team?.name || "Team unavailable"}</p>

              <h3>Assignments</h3>

              {assignmentMessage && (
                <p role="status">{assignmentMessage}</p>
              )}

              {!assignmentMessage && assignments.length === 0 && (
                <p>No published assignments yet.</p>
              )}

              {assignments.map((assignment) => {
                const submission = submissions.find(
                  (item) => item.assignment_id === assignment.id
                );

                return (
                  <article
                    key={assignment.id}
                    style={{
                      border: "1px solid #888",
                      padding: 15,
                      marginBottom: 15,
                    }}
                  >
                    <h4>{assignment.title}</h4>

                    {assignment.instructions && (
                      <p>{assignment.instructions}</p>
                    )}

                    {assignment.due_at && (
                      <p>
                        Due:{" "}
                        {new Date(assignment.due_at).toLocaleString()}
                      </p>
                    )}

                    {assignment.video_url && (
                      <p>
                        <a
                          href={assignment.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Watch training video
                        </a>
                      </p>
                    )}
{questions
  .filter((question) => question.assignment_id === assignment.id)
  .map((question) => (
    <div key={question.id} style={{ marginBottom: 15 }}>
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
        rows={3}
        style={{ display: "block", width: "100%", marginTop: 6 }}
      />
    </div>
  ))}
                    <p>
                      Status:{" "}
                      {submission?.status
                        ? submission.status.replace(/_/g, " ")
                        : "Not started"}
                    </p>
              <button type="button" onClick={() => saveProgress(assignment.id, "in_progress")}>

  Save progress

</button> 
                  <button

  type="button"

  onClick={() => saveProgress(assignment.id, "completed")}

>

  Mark Complete

</button>
                  </article>
                );
              })}
            </section>
          )}
        </>
      ) : (
        !message && <p>No approved players yet.</p>
      )}

      <p>
        <a href="/parent/request">Register another player</a>
      </p>

      <p>
        <a href="/">Back to FirstTouchIQ</a>
      </p>
    </main>
  );
}
