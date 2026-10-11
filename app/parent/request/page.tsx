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
  const [players, setPlayers] = useState<{id: string; display_name: string}[]>([]);
  const [existingPlayerId, setExistingPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
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
    const { data: children, error: playerError } = await supabase.from("parent_managed_players").select("id,display_name").order("display_name");
    if (playerError) setMessage(playerError.message);
    setPlayers(children || []);
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
    if (!supabase || busy) return;

    if (!playerName.trim() || !teamId || !consent) {
      setMessage("Complete all fields and confirm consent.");
      return;
    }

    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      setMessage("Please sign in first.");
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from("player_registration_requests")
      .insert({
        parent_id: data.user.id,
        team_id: teamId,
        player_name: playerName.trim(),
        managed_player_id: existingPlayerId || null,
      });

    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }

    setBusy(false);
    setExistingPlayerId("");
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

          <label htmlFor="existing-player">Player</label>
          <select id="existing-player" value={existingPlayerId} onChange={e => {
            setExistingPlayerId(e.target.value);
            setPlayerName(players.find(p => p.id === e.target.value)?.display_name || "");
          }}>
            <option value="">Register a new player</option>
            {players.map(player => <option key={player.id} value={player.id}>{player.display_name} — add another team</option>)}
          </select>
          <p>For a player already registered, select their existing profile to keep all assignments and progress.</p>
          <input
            disabled={Boolean(existingPlayerId)}
            aria-label="Player name"
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

          <button disabled={busy} onClick={submitRequest}>
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

      <p role="status">{message}</p>
      <a href="/parent/dashboard">Back to parent dashboard</a>
    </main>
  );
}

