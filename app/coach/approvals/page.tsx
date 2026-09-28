"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type RegistrationRequest = {
  id: string;
  player_name: string;
  team_id: string;
  created_at: string;
};

export default function CoachApprovalsPage() {
  const [coachId, setCoachId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Loading requests...");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setMessage("Sign in with your coach account to review player requests.");
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,active")
      .eq("id", auth.user.id)
      .single();
    if (profileError || profile?.role !== "coach" || !profile.active) {
      setMessage("An active coach account is required.");
      return;
    }
    setCoachId(auth.user.id);

    const { data: teams, error: teamError } = await supabase
      .from("teams")
      .select("id,name")
      .eq("created_by", auth.user.id);
    if (teamError) {
      setMessage(teamError.message);
      return;
    }
    const teamIds = (teams || []).map((team) => team.id);
    setTeamNames(Object.fromEntries((teams || []).map((team) => [team.id, team.name])));
    if (teamIds.length === 0) {
      setRequests([]);
      setMessage("No teams are assigned to this coach.");
      return;
    }
    const { data, error } = await supabase
      .from("player_registration_requests")
      .select("id,player_name,team_id,created_at")
      .eq("status", "pending")
      .in("team_id", teamIds)
      .order("created_at", { ascending: true });
    if (error) {
      setMessage(error.message);
      return;
    }
    setRequests(data || []);
    setMessage("");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, status: "approved" | "rejected") {
    if (!supabase || !coachId || busyId) return;
    setBusyId(id);
    setMessage("");
    const { error } = await supabase.rpc("review_player_request", {
      request_id: id,
      decision: status,
    });
    if (error) {
      setMessage(`Review failed: ${error.message}`);
    } else {
      await load();
      setMessage(status === "approved" ? "Player approved." : "Request rejected.");
    }
    setBusyId(null);
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 20 }}>
      <h1>Player Registration Requests</h1>
      <p>Review requests from parents on your teams.</p>
      {message && <p role="status">{message}</p>}
      {!message && requests.length === 0 && <p>No pending requests.</p>}
      {requests.map((request) => (
        <article key={request.id} style={{ border: "1px solid #aaa", padding: 16, marginBottom: 12 }}>
          <h2>{request.player_name}</h2>
          <p>Team: {teamNames[request.team_id] || request.team_id}</p>
          <button disabled={busyId !== null} onClick={() => review(request.id, "approved")}>
            {busyId === request.id ? "Saving..." : "Approve player"}
          </button>{" "}
          <button disabled={busyId !== null} onClick={() => review(request.id, "rejected")}>
            Reject
          </button>
        </article>
      ))}
      <p><a href="/">Back to coach dashboard</a></p>
    </main>
  );
}
