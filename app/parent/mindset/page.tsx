"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

const BUCKET = "Mindset-Cirriculum";

type Resource = {
  id: string;
  title: string;
  description: string;
  resource_type: "pdf" | "video" | "link";
  file_path: string | null;
  video_url: string | null;
};

export default function MindsetPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [dashboardUrl, setDashboardUrl] =
    useState("/parent/dashboard");

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

        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("role,active")
            .eq("id", auth.user.id)
            .single();

        if (profileError) {
          throw new Error(profileError.message);
        }

        if (
          !profile?.active ||
          !["parent", "player", "coach"].includes(profile.role)
        ) {
          throw new Error("An active account is required.");
        }

        const { data, error } = await supabase
          .from("mindset_resources")
          .select(
            "id,title,description,resource_type,file_path,video_url"
          )
          .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        if (!cancelled) {
          setDashboardUrl(
            profile.role === "parent" ? "/parent/dashboard" : "/"
          );
          setResources((data || []) as Resource[]);
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load curriculum."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function openResource(resource: Resource) {
    if (!supabase || openingId) return;

    setOpeningId(resource.id);
    setMessage("");

    try {
      let destination: string;

      if (resource.resource_type === "link") {
        const url = new URL(resource.video_url || "");

        if (url.protocol !== "https:") {
          throw new Error("This video link is invalid.");
        }

        destination = url.href;
      } else {
        if (!resource.file_path) {
          throw new Error("This resource is missing its file.");
        }

        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(resource.file_path, 3600);

        if (error) throw new Error(error.message);
        if (!data?.signedUrl) {
          throw new Error("Could not open this file.");
        }

        destination = data.signedUrl;
      }

      // Open in this tab so Safari does not block a new window.
      window.location.assign(destination);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not open this resource."
      );
    } finally {
      setOpeningId("");
    }
  }

  async function signOut() {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
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
          <div className="tag">
            Watch. Think. Train. Develop.
          </div>
        </div>

        <button className="ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="wrap">
        <nav className="tabs" aria-label="Dashboard navigation">
          <a href={dashboardUrl}>Assignments</a>
          <a href="/parent/mindset" aria-current="page">
            Mindset &amp; Confidence
          </a>
        </nav>

        <div className="welcome">
          <div className="eyebrow">BEYOND THE BALL</div>
          <h1>Mindset &amp; Confidence</h1>
          <p className="muted">
            Coach Christian&apos;s curriculum for building
            confidence and a positive mindset on and off the field.
          </p>
        </div>

        {loading && <p role="status">Loading curriculum...</p>}

        {message && (
          <p className="notice" role="alert">
            {message}
          </p>
        )}

        {!loading && (
          <button
            type="button"
            className="secondary"
            onClick={() => window.location.reload()}
            style={{ marginBottom: 16 }}
          >
            Refresh resources
          </button>
        )}

        {ready && (
          <section className="card section">
            <h2>Your mindset reference</h2>
            <p className="muted">
              Return here before training, before games, or
              whenever you need a confidence reset.
            </p>

            {resources.length === 0 ? (
              <div className="empty">
                No curriculum resources have been published yet.
              </div>
            ) : (
              resources.map((resource) => (
                <article
                  key={resource.id}
                  style={{
                    padding: "20px 0",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <div className="eyebrow">
                    {resource.resource_type === "pdf"
                      ? "PDF GUIDE"
                      : "VIDEO RESOURCE"}
                  </div>

                  <h3>{resource.title}</h3>

                  {resource.description && (
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {resource.description}
                    </p>
                  )}

                  <button
                    type="button"
                    className="primary"
                    disabled={Boolean(openingId)}
                    onClick={() => openResource(resource)}
                  >
                    {openingId === resource.id
                      ? "Opening..."
                      : resource.resource_type === "pdf"
                        ? "Open PDF"
                        : "Watch video"}
                  </button>
                </article>
              ))
            )}

            <p className="muted small">
              After viewing a resource, use your browser&apos;s
              Back button to return here.
            </p>
          </section>
        )}
      </main>
    </>
  );
}
