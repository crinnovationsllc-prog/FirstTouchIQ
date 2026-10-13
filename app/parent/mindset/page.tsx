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
          <>
            <section className="card section" id="video-library">
              <div className="sectionHead">
                <div>
                  <div className="eyebrow">WATCH · LEARN · GROW</div>
                  <h2>Mindset &amp; Confidence Video Library</h2>
                  <p className="muted">Videos from Coach Christian to help build self-belief, composure, and a strong mindset.</p>
                </div>
                <span className="pill">{resources.filter(r => r.resource_type !== "pdf").length} videos</span>
              </div>
              {resources.filter(r => r.resource_type !== "pdf").length === 0 ? (
                <div className="empty">No mindset videos have been added yet. Check back after Coach Christian publishes one.</div>
              ) : (
                <div className="mindsetVideoGrid">
                  {resources.filter(r => r.resource_type !== "pdf").map(resource => (
                    <article className="mindsetVideoCard" key={resource.id}>
                      <div className="mindsetVideoArt" aria-hidden="true"><span>▶</span></div>
                      <div className="mindsetVideoBody">
                        <span className="eyebrow">{resource.resource_type === "link" ? "VIDEO LINK" : "VIDEO"}</span>
                        <h3>{resource.title}</h3>
                        {resource.description && <p>{resource.description}</p>}
                        <button type="button" className="primary" disabled={Boolean(openingId)} onClick={() => openResource(resource)}>
                          {openingId === resource.id ? "Opening..." : "▶ Watch video"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="card section" id="pdf-guides">
              <div className="sectionHead">
                <div>
                  <h2>PDF Guides &amp; Exercises</h2>
                  <p className="muted">Written exercises and confidence-building resources you can revisit anytime.</p>
                </div>
                <span className="pill">{resources.filter(r => r.resource_type === "pdf").length} guides</span>
              </div>
              {resources.filter(r => r.resource_type === "pdf").length === 0 ? (
                <div className="empty">No PDF guides have been published yet.</div>
              ) : resources.filter(r => r.resource_type === "pdf").map(resource => (
                <article key={resource.id} className="mindsetGuideRow">
                  <div className="mindsetResourceIcon" aria-hidden="true">▤</div>
                  <div className="grow">
                    <h3>{resource.title}</h3>
                    {resource.description && <p>{resource.description}</p>}
                    <button type="button" className="secondary" disabled={Boolean(openingId)} onClick={() => openResource(resource)}>
                      {openingId === resource.id ? "Opening..." : "Open PDF"}
                    </button>
                  </div>
                </article>
              ))}
              <p className="muted small">After opening a resource, use your browser&apos;s Back button to return to the library.</p>
            </section>
          </>
        )}

      </main>
    </>
  );
}
