"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { playerTeamIds, type TeamMembership } from "../../../lib/team-memberships";

type Player = { id: string; display_name: string; team_id: string; team_ids: string[] };
type Team = { id: string; name: string };
type Assignment = { id: string; team_id: string; title: string };
type Submission = { id: string; assignment_id: string; managed_player_id: string; status: string; training_completed: boolean; answers: Record<string, string> | null };
type Question = { id: string; prompt: string };

export default function CoachProgress() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [message, setMessage] = useState("Loading…");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    if (!supabase) { setMessage("Supabase is not configured."); return; }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setMessage("Please sign in to your coach account."); return; }
    const { data: profile, error } = await supabase.from("profiles").select("role,active").eq("id", auth.user.id).single();
    if (error || profile?.role !== "coach" || !profile.active) { setMessage("An active coach account is required."); return; }
    // RLS returns only this coach's teams, regardless of who created assignments.
    const results = await Promise.all([
      supabase.from("teams").select("id,name").eq("active", true),
      supabase.from("parent_managed_players").select("id,display_name,team_id"),
      supabase.from("player_team_memberships").select("managed_player_id,team_id"),
      supabase.from("assignments").select("id,team_id,title").eq("status", "published"),
      supabase.from("parent_managed_submissions").select("id,assignment_id,managed_player_id,status,training_completed,answers"),
      supabase.from("questions").select("id,prompt"),
    ]);
    const failure = results.find(result => result.error)?.error;
    if (failure) { setMessage(failure.message); return; }
    const [teamData, playerData, memberships, assignmentData, submissionData, questionData] = results;
    setTeams(teamData.data || []);
    setPlayers((playerData.data || []).map(player => ({ ...player, team_ids: playerTeamIds(player, (memberships.data || []) as TeamMembership[]) })));
    setAssignments(assignmentData.data || []);
    setSubmissions((submissionData.data || []) as Submission[]);
    setQuestions(questionData.data || []);
    setMessage("");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function markReviewed(id: string) {
    if (!supabase || busyId) return;
    setBusyId(id);
    const { data, error } = await supabase.from("parent_managed_submissions")
      .update({ status: "reviewed" }).eq("id", id).select("id").single();
    if (error || !data) setMessage(error?.message || "No submission was updated.");
    else { setSubmissions(current => current.map(s => s.id === id ? { ...s, status: "reviewed" } : s)); setMessage("Marked reviewed."); }
    setBusyId("");
  }
  const completed = submissions.filter(s => ["completed", "submitted", "reviewed"].includes(s.status));
  return <main className="wrap">
    <h1>Coach Progress Dashboard</h1>
    <p>Review assignment progress for your teams. Players keep one account across teams.</p>
    {message && <p role="status">{message}</p>}
    <div className="metrics">
      {[['Players', players.length], ['Teams', teams.length], ['Assignments', assignments.length], ['Submitted', completed.length], ['Reviewed', completed.filter(s => s.status === 'reviewed').length]].map(([label, count]) => <div className="card metric" key={label}><span>{label}</span><b>{count}</b></div>)}
    </div>
    {teams.map(team => <section className="card section" key={team.id}>
      <h2>{team.name}</h2>
      {players.filter(player => player.team_ids.includes(team.id)).map(player => <article key={player.id}>
        <h3>{player.display_name}</h3>
        {assignments.filter(a => a.team_id === team.id).map(assignment => {
          const submission = submissions.find(s => s.assignment_id === assignment.id && s.managed_player_id === player.id);
          return <div className="contentLine" key={assignment.id}><strong>{assignment.title}</strong>
            <p>Status: {submission?.status.replace(/_/g, ' ') || 'Not started'}</p>
            {Object.entries(submission?.answers || {}).map(([id, answer]) => <p key={id}><b>{questions.find(q => q.id === id)?.prompt || 'Answer'}: </b>{answer}</p>)}
            {submission && ['completed', 'submitted'].includes(submission.status) && <button type="button" disabled={Boolean(busyId)} onClick={() => markReviewed(submission.id)}>{busyId === submission.id ? 'Saving…' : 'Mark Reviewed'}</button>}
          </div>;
        })}
        {!assignments.some(a => a.team_id === team.id) && <p>No published assignments yet.</p>}
      </article>)}
      {!players.some(p => p.team_ids.includes(team.id)) && <p>No approved parent-managed players yet.</p>}
    </section>)}
    <p><a href="/">Back to FirstTouchIQ</a></p>
  </main>;
}
