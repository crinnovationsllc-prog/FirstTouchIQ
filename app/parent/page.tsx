
"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

export default function ParentPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;

    setBusy(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    try {
      if (!name || !email || password.length < 12) {
        setMessage("Complete all fields. Use at least 12 password characters.");
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name,
            role: "parent",
          },
        },
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Account created. Check your email for a confirmation link, then sign in and register your player."
        );
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: "48px auto", padding: 24 }}>
      <h1>FirstTouchIQ</h1>
      <h2>Parent Registration</h2>

      <p>
        Create your parent account. Player registration and team access
        will require coach approval.
      </p>

      <form onSubmit={register}>
        <label htmlFor="name">Parent full name</label>
        <input id="name" name="name" required autoComplete="name" />

        <br /><br />

        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />

        <br /><br />

        <label htmlFor="password">Password (12 characters minimum)</label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={12}
          required
          autoComplete="new-password"
        />

        <br /><br />

        <button type="submit" disabled={busy || !supabase}>
          {busy ? "Please wait..." : "Register as Parent"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}

      <p>
        Already registered? <a href="/">Return to sign in</a>
      </p>
    </main>
  );
}

