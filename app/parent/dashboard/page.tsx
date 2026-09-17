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

export default function ParentDashboard() {

  const [players, setPlayers] = useState<Player[]>([]);

  const [teams, setTeams] = useState<Team[]>([]);

  const [message, setMessage] = useState("Loading...");

  const [selectedId, setSelectedId] = useState("");

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

  const selected = players.find((player) => player.id === selectedId);

  const team = teams.find((item) => item.id === selected?.team_id);

  return (

    <main style={{ maxWidth: 700, margin: "40px auto", padding: 20 }}>

      <h1>Parent Dashboard</h1>

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

              <p>Assignments and progress tracking are coming next.</p>

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
