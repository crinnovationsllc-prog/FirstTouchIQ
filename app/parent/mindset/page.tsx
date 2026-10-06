"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export default function MindsetPage() {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Loading curriculum…");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!supabase) {
          throw new Error("Database connection unavailable.");
        }

        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw new Error(authError.message);

        if (!auth.user) {
          window.location.replace("/parent");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role,active")
          .eq("id", auth.user.id)
          .single();

        if (profileError) throw new Error(profileError.message);

        if (
          !profile?.active ||
          !["parent", "player", "coach"].includes(profile.role)
        ) {
          throw new Error("An active FirstTouchIQ account is required.");
        }

        if (!cancelled) {
          setReady(true);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not open curriculum."
          );
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    const result = await supabase?.auth.signOut();

    if (result?.error) {
      setMessage(result.error.message);
      return;
    }

    window.location.assign("/");
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

        <button className="ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="wrap">
        <nav className="tabs" aria-label="Parent dashboard navigation">
          <a href="/parent/dashboard">Assignments</a>
          <a href="/parent/mindset" aria-current="page">
            Mindset &amp; Confidence
          </a>
        </nav>

        {message && <p role="status">{message}</p>}

        {ready && (
          <>
            <div className="welcome parentWelcome">
              <div className="eyebrow">BEYOND THE BALL</div>
              <h1>Mindset &amp; Confidence</h1>
              <p className="muted">
                Coach Christian&apos;s curriculum for building confidence
                and a strong mindset on and off the field.
              </p>
            </div>

            <section className="card section">
              <h2>Your mindset reference</h2>
              <p>
                Return here before training, before games, or whenever
                you need a confidence reset.
              </p>

              <div className="empty">
                <h3>Lessons coming soon</h3>
                <p>
                  Your mindset and confidence curriculum will appear here.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
