"use client";

import { useEffect, useRef, useState } from "react";

import type { FormEvent } from "react";

import { supabase } from "../../../lib/supabase";

const BUCKET = "Mindset-Cirriculum";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type ResourceType = "pdf" | "video" | "link";

type Resource = {

  id: string;

  title: string;

  description: string;

  resource_type: ResourceType;

};

export default function CoachMindsetPage() {

  const [ready, setReady] = useState(false);

  const [busy, setBusy] = useState(false);

  const [message, setMessage] = useState("Loading...");

  const [resourceType, setResourceType] =

    useState<ResourceType>("pdf");

  const [resources, setResources] = useState<Resource[]>([]);

  const publishing = useRef(false);

  useEffect(() => {

    let cancelled = false;

    async function load() {

      if (!supabase) {

        setMessage("Database connection unavailable.");

        return;

      }

      try {

        const { data: auth, error: authError } =

          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!auth.user) {

          window.location.replace("/");

          return;

        }

        const { data: profile, error: profileError } =

          await supabase

            .from("profiles")

            .select("role,active")

            .eq("id", auth.user.id)

            .single();

        if (profileError) throw profileError;

        if (profile?.role !== "coach" || !profile.active) {

          throw new Error("An active coach account is required.");

        }

        const { data, error } = await supabase

          .from("mindset_resources")

          .select("id,title,description,resource_type")

          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!cancelled) {

          setResources((data || []) as Resource[]);

          setReady(true);

          setMessage("");

        }

      } catch (error) {

        if (!cancelled) {

          setMessage(

            error instanceof Error

              ? error.message

              : "Could not load curriculum."

          );

        }

      }

    }

    void load();

    return () => {

      cancelled = true;

    };

  }, []);

  async function publish(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    if (!supabase || publishing.current || !ready) return;

    const form = event.currentTarget;

    const fields = new FormData(form);

    const title = String(fields.get("title") || "").trim();

    const description =

      String(fields.get("description") || "").trim();

    if (!title) {

      setMessage("Enter a resource title.");

      return;

    }

    publishing.current = true;

    setBusy(true);

    setMessage("Publishing...");

    let uploadedPath: string | null = null;

    try {

      const { data: auth, error: authError } =

        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!auth.user) throw new Error("Please sign in again.");

      const resourceId = crypto.randomUUID();

      let videoUrl: string | null = null;

      if (resourceType === "link") {

        const enteredUrl =

          String(fields.get("video_url") || "").trim();

        const url = new URL(enteredUrl);

        if (url.protocol !== "https:") {

          throw new Error("Use a video link starting with https://.");

        }

        videoUrl = url.href;

      } else {

        const file = fields.get("file");

        if (!(file instanceof File) || file.size === 0) {

          throw new Error("Choose a file first.");

        }

        if (file.size > MAX_FILE_SIZE) {

          throw new Error(

            "Choose a file under 50 MB, or use a video link."

          );

        }

        const extension =

          file.name.split(".").pop()?.toLowerCase() || "";

        const contentTypes: Record<string, string> = {

          pdf: "application/pdf",

          mp4: "video/mp4",

          mov: "video/quicktime",

          webm: "video/webm",

        };

        const validFile =

          resourceType === "pdf"

            ? extension === "pdf"

            : ["mp4", "mov", "webm"].includes(extension);

        if (!validFile) {

          throw new Error(

            resourceType === "pdf"

              ? "Choose a PDF file."

              : "Choose an MP4, MOV, or WebM video."

          );

        }

        const path =

          `${auth.user.id}/${resourceId}.${extension}`;

        setMessage("Uploading file. Keep this page open...");

        const { error: uploadError } = await supabase.storage

          .from(BUCKET)

          .upload(path, file, {

            contentType: contentTypes[extension],

            upsert: false,

          });

        if (uploadError) throw uploadError;

        uploadedPath = path;

      }

      setMessage("Saving curriculum resource...");

      const { data, error } = await supabase

        .from("mindset_resources")

        .insert({

          id: resourceId,

          title,

          description,

          resource_type: resourceType,

          file_path: uploadedPath,

          video_url: videoUrl,

          created_by: auth.user.id,

        })

        .select("id,title,description,resource_type")

        .single();

      let saved = data as Resource | null;

      // Check whether it saved if the response was interrupted.

      if (error || !saved) {

        const { data: confirmed } = await supabase

          .from("mindset_resources")

          .select("id,title,description,resource_type")

          .eq("id", resourceId)

          .maybeSingle();

        saved = confirmed as Resource | null;

        if (!saved) {

          throw new Error(

            error?.message || "Could not confirm publication."

          );

        }

      }

      setResources((current) => [saved!, ...current]);

      form.reset();

      setMessage("Curriculum published successfully.");

    } catch (error) {

      const detail =

        error instanceof Error

          ? error.message

          : "Could not publish curriculum.";

      setMessage(

        uploadedPath

          ? `${detail} The file uploaded, but publication could not be confirmed. Refresh this page before trying again.`

          : detail

      );

    } finally {

      publishing.current = false;

      setBusy(false);

    }

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

        <a className="ghost" href="/">

          Coach dashboard

        </a>

      </header>

      <main className="wrap">

        <nav className="tabs" aria-label="Coach navigation">

          <a href="/">Dashboard</a>

          <a href="/coach/mindset" aria-current="page">

            Mindset &amp; Confidence

          </a>

        </nav>

        <div className="welcome">

          <div className="eyebrow">COACH CURRICULUM</div>

          <h1>Mindset &amp; Confidence</h1>

          <p className="muted">

            Publish resources for parents and players to reference.

          </p>

        </div>

        {message && (

          <p className="notice" role="status">

            {message}

          </p>

        )}

        {ready && (

          <>

            <section className="card section">

              <h2>Upload curriculum</h2>

              <form className="form" onSubmit={publish}>

                <fieldset

                  disabled={busy}

                  className="form"

                  style={{ border: 0, padding: 0, margin: 0 }}

                >

                  <label>

                    Title

                    <input

                      name="title"

                      required

                      placeholder="Confidence Building Exercises"

                    />

                  </label>

                  <label>

                    Description

                    <textarea

                      name="description"

                      rows={3}

                      placeholder="What will players and parents learn?"

                    />

                  </label>

                  <label>

                    Resource type

                    <select

                      value={resourceType}

                      onChange={(event) =>

                        setResourceType(

                          event.target.value as ResourceType

                        )

                      }

                    >

                      <option value="pdf">PDF document</option>

                      <option value="video">Video file</option>

                      <option value="link">Video link</option>

                    </select>

                  </label>

                  {resourceType === "link" ? (

                    <label>

                      Video link

                      <input

                        name="video_url"

                        type="url"

                        required

                        placeholder="https://..."

                      />

                    </label>

                  ) : (

                    <label>

                      Choose {resourceType === "pdf" ? "PDF" : "video"}

                      <input

                        key={resourceType}

                        name="file"

                        type="file"

                        required

                        accept={

                          resourceType === "pdf"

                            ? ".pdf,application/pdf"

                            : ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"

                        }

                      />

                    </label>

                  )}

                  <p className="muted small">

                    Files must be under 50 MB. MP4 is best for

                    video playback. Use a video link for larger videos.

                  </p>

                  <button className="primary" type="submit">

                    {busy ? "Publishing..." : "Publish curriculum"}

                  </button>

                </fieldset>

              </form>

            </section>

            <section className="card section">

              <h2>Published curriculum</h2>

              {resources.length === 0 ? (

                <p className="muted">No resources published yet.</p>

              ) : (

                resources.map((resource) => (

                  <div className="contentLine" key={resource.id}>

                    <b>{resource.title}</b>

                    <span>

                      {resource.resource_type.toUpperCase()}

                      {resource.description

                        ? ` · ${resource.description}`

                        : ""}

                    </span>

                  </div>

                ))

              )}

            </section>

          </>

        )}

      </main>

    </>

  );

}
