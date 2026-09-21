
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
};

type Submission = {
  assignment_id: string;
  managed_player_id: string;
  status: string;
  answers: Record<string, string> | null;
};

export default function CoachProgress() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [questions, setQuestions] = useState<{ id: string; assignment_id: string; prompt: string; position: number }[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [openAnswers, setOpenAnswers] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setMessage("Supabase is not configured.");
        return;
      }

      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError || !auth.user) {
        setMessage("Please sign in to your coach account.");
        return;
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role,active")
          .eq("id", auth.user.id)
          .single();

      if (
        profileError ||
        profile?.role !== "coach" ||
        !profile.active
      ) {
        setMessage("An active coach account is required.");
        return;
      }

      const { data: teamData, error: teamError } =
        await supabase
          .from("teams")
.select("id,name")
.eq("active", true);

      if (teamError) {
        setMessage(`Team error: ${teamError.message}`);
        return;
      }

      const { data: playerData, error: playerError } =
        await supabase
          .from("parent_managed_players")
          .select("id,display_name,team_id");

      if (playerError) {
        setMessage(`Player error: ${playerError.message}`);
        return;
      }

      const { data: assignmentData, error: assignmentError } =
        await supabase
          .from("assignments")
.select("id,team_id,title")
.eq("status", "published");

      if (assignmentError) {
        setMessage(`Assignment error: ${assignmentError.message}`);
        return;
      }

      const { data: submissionData, error: submissionError } =
        await supabase
          .from("parent_managed_submissions")
          .select("assignment_id,managed_player_id,status,answers");

      if (submissionError) {
        setMessage(`Progress error: ${submissionError.message}`);
        return;
      }

      setTeams(teamData || []);
      setPlayers(playerData || []);
      const { data: questionData, error: questionError } =
  await supabase
    .from("questions")
    .select("id,assignment_id,prompt,position")
    .order("position");

if (questionError) {
  setMessage(`Question error: ${questionError.message}`);
  return;
}

setQuestions(questionData || []);
      setAssignments(assignmentData || []);
      setSubmissions(submissionData || []);
      setMessage("");
    }

    load();
  }, []);

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: 20 }}>
      <h1>Coach Progress Dashboard</h1>
      <p>Review player assignment progress.</p>

      {message && <p role="status">{message}</p>}

      {!message && players.length === 0 && (
        <p>No approved parent-managed players yet.</p>
      )}

      {!message &&
        teams.map((team) => {
          const teamPlayers = players.filter(
            (player) => player.team_id === team.id
          );

          const teamAssignments = assignments.filter(
            (assignment) => assignment.team_id === team.id
          );

          return (
            <section key={team.id}>
              <h2>{team.name}</h2>

              {teamPlayers.length === 0 && (
                <p>No parent-managed players yet.</p>
              )}

              {teamPlayers.map((player) => (
                <article
                  key={player.id}
                  style={{
                    border: "1px solid #888",
                    padding: 15,
                    marginBottom: 15,
                  }}
                >
                  <h3>{player.display_name}</h3>

                  {teamAssignments.length === 0 && (
                    <p>No published assignments yet.</p>
                  )}

                  {teamAssignments.map((assignment) => {
                    const submission = submissions.find(
                      (item) =>
                        item.assignment_id === assignment.id &&
                        item.managed_player_id === player.id
                    );

                    return (
                      <div key={assignment.id}>
                        <strong>{assignment.title}</strong>
                        <p>
                          Status:{" "}
                          {submission
                            ? submission.status.replace(/_/g, " ")
                            : "Not started"}
                        </p>
                        {submission && (
  <>
    <button
      type="button"
      onClick={() =>
        setOpenAnswers(
          openAnswers === `${player.id}-${assignment.id}`
            ? null
            : `${player.id}-${assignment.id}`
        )
      }
    >
      View Answers
    </button>
    {openAnswers === `${player.id}-${assignment.id}` && (
      <div>
        {Object.entries(submission.answers || {}).length === 0 ? (
          <p>No answers submitted yet.</p>
        ) : (
          Object.entries(submission.answers || {})
  .sort(([a], [b]) =>
    (questions.find(q => q.id === a)?.position ?? 999) -
    (questions.find(q => q.id === b)?.position ?? 999)
  )
  .map(([questionId, answer]) => (
            <p key={questionId}>
              <strong>Question:</strong>{" "}
{questions.find(q => q.id === questionId)?.prompt ?? "Question unavailable"}
<br />
<strong>Answer:</strong> {answer}
            </p>
          ))
        )}
      </div>
    )}
  </>
)}
                      </div>
                    );
                  })}
                </article>
              ))}
            </section>
          );
        })}

      <p>
        <a href="/">Back to FirstTouchIQ</a>
      </p>
    </main>
  );
}
