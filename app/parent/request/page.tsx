"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Team = { id: string; name: string };
type Request = {
  id: string;
  player_name: string;
  status: string;
};

export default function ParentRequestPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [consent, setConsent] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [message, setMessage] = useState("");

  async function loadData() {
    if (!supabase) return;

    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("id,name")
      .eq("active", true);
if (teamError) setMessage(`Team loading error: ${teamError.message}`);
    setTeams(teamData || []);

    const { data: requestData } = await supabase
      .from("player_registration_requests")
      .select("id,player_name,status")
      .order("created_at", { ascending: false });

    setRequests(requestData || []);
  }

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setSignedIn(true);
        loadData();
      }
    });
  }, []);

  async function signIn() {
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setSignedIn(true);
    setMessage("");
    await loadData();
  }

  async function submitRequest() {
    if (!supabase) return;

    if (!playerName.trim() || !teamId || !consent) {
      setMessage("Complete all fields and confirm consent.");
      return;
    }

    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      setMessage("Please sign in first.");
      return;
    }

    const { error } = await supabase
      .from("player_registration_requests")
      .insert({
        parent_id: data.user.id,
        team_id: teamId,
        player_name: playerName.trim(),
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Registration request submitted for coach approval.");
    setPlayerName("");
    setTeamId("");
    setConsent(false);
    await loadData();
  }

  if (!supabase) return <p>Supabase is not configured.</p>;

  return (
    <main style={{ maxWidth: 500, margin: "40px auto", padding: 20 }}>
      <h1>Parent Player Registration</h1>

      {!signedIn ? (
        <>
          <p>Sign in with your confirmed parent account.</p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={signIn}>Sign In</button>
        </>
      ) : (
        <>
          <h2>Request Player Registration</h2>

          <input
            placeholder="Player name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />

          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            <option value="">Select team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>

          <label style={{ display: "block", marginTop: 16 }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I am the player's parent or legal guardian and consent
            to submitting this registration request.
          </label>

          <button onClick={submitRequest}>
            Submit Registration Request
          </button>

          <h2>My Requests</h2>
          {requests.map((request) => (
            <p key={request.id}>
              {request.player_name}: {request.status}
            </p>
          ))}
        </>
      )}

      <p>{message}</p>
    </main>
  );
}

