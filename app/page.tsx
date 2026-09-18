'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabase'

type Profile = { id: string; role: 'coach' | 'player'; display_name: string; username: string | null; active: boolean }
type Team = { id: string; name: string; created_by: string; active: boolean }
type Assignment = { id: string; team_id: string; created_by: string; title: string; instructions: string | null; video_url: string | null; due_at: string | null; status: 'draft' | 'published' | 'archived'; created_at: string }
type Submission = { id: string; assignment_id: string; player_id: string; status: 'not_started' | 'in_progress' | 'submitted' | 'reviewed'; submitted_at: string | null }
type Question = { id: string; assignment_id: string; position: number; prompt: string; type: string; required: boolean }
type Task = { id: string; assignment_id: string; position: number; description: string; required: boolean }

type Tab = 'dashboard' | 'create' | 'players'

const fmtDue = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date(value)) : 'No due date'

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [authMode, setAuthMode] = useState<'signin'|'signup'>('signin')
  const [tab, setTab] = useState<Tab>('dashboard')
  const [teams, setTeams] = useState<Team[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [managedPlayerCount, setManagedPlayerCount] = useState(0)
  const [managedCompletedCount, setManagedCompletedCount] = useState(0)
  const [questions, setQuestions] = useState<Question[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedAssignment, setSelectedAssignment] = useState<string | null>(null)

  const loadData = useCallback(async (userId: string) => {
    if (!supabase) return
    setLoading(true)
    setMessage('')
    const { data: p, error: pErr } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (pErr) setMessage(pErr.message)
    const current = p as Profile | null
    setProfile(current)
    if (!current) { setLoading(false); return }

    const [{data:t},{data:a},{data:s}] = await Promise.all([
      supabase.from('teams').select('*').eq('active', true).order('created_at'),
      supabase.from('assignments').select('*').order('created_at', {ascending:false}),
      supabase.from('submissions').select('*')
    ])
    setTeams((t || []) as Team[])
    setAssignments((a || []) as Assignment[])
    setSubmissions((s || []) as Submission[])
if (current.role === 'coach') {

  const { count: playersCount } = await supabase

    .from('parent_managed_players')

    .select('id', { count: 'exact', head: true })

  const { count: completedCount } = await supabase

    .from('parent_managed_submissions')

    .select('id', { count: 'exact', head: true })

    .eq('status', 'completed')

  setManagedPlayerCount(playersCount ?? 0)

  setManagedCompletedCount(completedCount ?? 0)

}
    if (current.role === 'coach') {
      const { data: people } = await supabase.from('profiles').select('*').eq('active', true).order('display_name')
      setProfiles((people || []) as Profile[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({data}) => {
      setSession(data.session)
      if (data.session) loadData(data.session.user.id); else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) setTimeout(() => loadData(next.user.id), 0)
      else { setProfile(null); setTeams([]); setAssignments([]); setLoading(false) }
    })
    return () => listener.subscription.unsubscribe()
  }, [loadData])

  const openAssignment = async (id: string) => {
    if (!supabase) return
    setSelectedAssignment(id)
    const [{data:q},{data:t}] = await Promise.all([
      supabase.from('questions').select('*').eq('assignment_id', id).order('position'),
      supabase.from('training_tasks').select('*').eq('assignment_id', id).order('position')
    ])
    setQuestions((q || []) as Question[]); setTasks((t || []) as Task[])
  }

  if (!supabaseConfigured) return <SetupScreen />
  if (loading) return <div className="center"><div className="spinner"/><p>Loading FirstTouchIQ…</p></div>
  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} message={message} setMessage={setMessage} />
  if (!profile) return <ProfileMissing email={session.user.email || ''} onRetry={() => loadData(session.user.id)} />

  const isCoach = profile.role === 'coach'
  const playerCount = profiles.filter(p => p.role === 'player').length + managedPlayerCount
  const submittedCount = submissions.filter(s => s.status === 'submitted' || s.status === 'reviewed').length

  return <>
    <header className="topbar">
      <div><div className="brand">FirstTouch<span>IQ</span></div><div className="tag">Watch. Think. Train. Develop.</div></div>
      <div className="userbox"><div><strong>{profile.display_name}</strong><small>{isCoach ? 'Coach' : 'Player'}</small></div><button className="ghost" onClick={() => supabase?.auth.signOut()}>Sign out</button></div>
    </header>
    <main className="wrap">
      {message && <div className="notice">{message}</div>}
      {isCoach ? <>
       <a href="/coach/progress" className="btn">Player Progress</a> <nav className="tabs"><button className={tab==='dashboard'?'active':''} onClick={()=>setTab('dashboard')}>Dashboard</button><button className={tab==='create'?'active':''} onClick={()=>setTab('create')}>Create Assignment</button><button className={tab==='players'?'active':''} onClick={()=>setTab('players')}>Players</button></nav>
        {tab === 'dashboard' && <CoachDashboard teams={teams} assignments={assignments} submissions={submissions} playerCount={playerCount} submittedCount={submittedCount} onOpen={openAssignment} selected={selectedAssignment} questions={questions} tasks={tasks} />}
        {tab === 'create' && <CreateAssignment userId={profile.id} teams={teams} onCreated={() => { loadData(profile.id); setTab('dashboard') }} setMessage={setMessage} />}
        {tab === 'players' && <Players teams={teams} profiles={profiles} submissions={submissions} />}
      </> : <PlayerDashboard profile={profile} assignments={assignments.filter(a=>a.status==='published')} submissions={submissions} onRefresh={()=>loadData(profile.id)} setMessage={setMessage} />}
    </main>
  </>
}

function SetupScreen(){ return <div className="authShell"><div className="authCard"><Logo/><h1>One setup step remains</h1><p>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to the Vercel project environment, then redeploy.</p></div></div> }

function Logo(){ return <div><div className="brand dark">FirstTouch<span>IQ</span></div><div className="tag darkTag">Watch. Think. Train. Develop.</div></div> }

function AuthScreen({mode,setMode,message,setMessage}:{mode:'signin'|'signup';setMode:(m:'signin'|'signup')=>void;message:string;setMessage:(m:string)=>void}){
  const [busy,setBusy]=useState(false)
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); if(!supabase) return; setBusy(true); setMessage('')
    const fd=new FormData(e.currentTarget); const email=String(fd.get('email')||''); const password=String(fd.get('password')||'')
    if(mode==='signin'){
      const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)setMessage(error.message)
    } else {
      const display_name=String(fd.get('name')||''); const role=String(fd.get('role')||'player')
      const {error}=await supabase.auth.signUp({email,password,options:{data:{display_name,role}}});
      if(error)setMessage(error.message); else setMessage('Account created. If email confirmation is enabled, check your email, then sign in.')
    }
    setBusy(false)
  }
  return <div className="authShell"><div className="authCard"><Logo/><h1>{mode==='signin'?'Welcome back':'Create your account'}</h1><p className="muted">{mode==='signin'?'Sign in to your FirstTouchIQ dashboard.':'Coaches manage teams and assignments. Players complete assigned work.'}</p>{message&&<div className="notice">{message}</div>}<form className="form" onSubmit={submit}>{mode==='signup'&&<><label>Full name<input name="name" required placeholder="Your name"/></label><label>Account type<select name="role" defaultValue="player"><option value="player">Player</option><option value="coach">Coach</option></select></label></>}<label>Email<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" minLength={6} required autoComplete={mode==='signin'?'current-password':'new-password'}/></label><button className="primary" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button></form><button className="linkButton" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('')}}>{mode==='signin'?'Need an account? Create one':'Already have an account? Sign in'}</button></div></div>
}

function ProfileMissing({email,onRetry}:{email:string;onRetry:()=>void}){ return <div className="authShell"><div className="authCard"><Logo/><h1>Finishing account setup</h1><p>Your login for <strong>{email}</strong> exists, but the FirstTouchIQ profile has not appeared yet.</p><button className="primary" onClick={onRetry}>Try again</button><p className="muted small">If this continues, the Supabase new-user profile trigger needs to be checked.</p></div></div> }

function CoachDashboard({teams,assignments,submissions,playerCount,submittedCount,onOpen,selected,questions,tasks}:{teams:Team[];assignments:Assignment[];submissions:Submission[];playerCount:number;submittedCount:number;onOpen:(id:string)=>void;selected:string|null;questions:Question[];tasks:Task[]}){
 return <><div className="metrics"><Metric label="Players" value={playerCount}/><Metric label="Teams" value={teams.length}/><Metric label="Assignments" value={assignments.length}/><Metric label="Submitted" value={submittedCount}/></div><section className="card section"><div className="sectionHead"><div><h2>Assignments</h2><p className="muted">Track what your players are working on.</p></div></div>{assignments.length===0?<Empty text="No assignments yet. Create your first Watch → Think → Train assignment."/>:assignments.map(a=>{const team=teams.find(t=>t.id===a.team_id);const subs=submissions.filter(s=>s.assignment_id===a.id);const done=subs.filter(s=>['submitted','reviewed'].includes(s.status)).length;return <div className="assignmentRow" key={a.id}><div className="grow"><div className="eyebrow">{team?.name||'Team'} · {a.status}</div><h3>{a.title}</h3><div className="muted">Due {fmtDue(a.due_at)} · {done} submitted</div><div className="progress"><i style={{width:`${subs.length?Math.round(done/subs.length*100):0}%`}}/></div></div><button className="secondary" onClick={()=>onOpen(a.id)}>{selected===a.id?'Refresh':'View'}</button></div>})}</section>{selected&&<section className="card section"><h2>Assignment content</h2>{questions.map((q,i)=><div className="contentLine" key={q.id}><b>Question {i+1}</b><span>{q.prompt}</span></div>)}{tasks.map((t,i)=><div className="contentLine" key={t.id}><b>Training {i+1}</b><span>{t.description}</span></div>)}</section>}</>
}
function Metric({label,value}:{label:string;value:number}){return <div className="card metric"><span className="muted">{label}</span><b>{value}</b></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}

function CreateAssignment({userId,teams,onCreated,setMessage}:{userId:string;teams:Team[];onCreated:()=>void;setMessage:(m:string)=>void}){
 const [busy,setBusy]=useState(false)
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!supabase)return;setBusy(true);setMessage('');const fd=new FormData(e.currentTarget);const teamId=String(fd.get('team_id')||'');if(!teamId){setMessage('Create a team before publishing an assignment.');setBusy(false);return}const due=String(fd.get('due_at')||'');const {data:a,error}=await supabase.from('assignments').insert({team_id:teamId,created_by:userId,title:String(fd.get('title')),instructions:String(fd.get('instructions')||''),video_url:String(fd.get('video_url')||''),due_at:due?new Date(due).toISOString():null,status:'published',published_at:new Date().toISOString()}).select().single();if(error||!a){setMessage(error?.message||'Could not create assignment.');setBusy(false);return}const qs=[String(fd.get('q1')||''),String(fd.get('q2')||'')].filter(Boolean);if(qs.length){const {error:qErr}=await supabase.from('questions').insert(qs.map((prompt,i)=>({assignment_id:a.id,position:i,prompt,type:'short_answer',required:true})));if(qErr)setMessage(qErr.message)}const task=String(fd.get('task')||'');if(task){const {error:tErr}=await supabase.from('training_tasks').insert({assignment_id:a.id,position:0,description:task,required:true});if(tErr)setMessage(tErr.message)}setBusy(false);onCreated()}
 return <section className="card"><h2>Create Assignment</h2><p className="muted">Build a Watch → Think → Train activity for one team.</p>{teams.length===0&&<TeamCreator userId={userId} onCreated={onCreated} setMessage={setMessage}/>}<form className="form twoCol" onSubmit={submit}><label className="full">Title<input name="title" required placeholder="Scanning Before Receiving"/></label><label>Team<select name="team_id" required defaultValue=""><option value="" disabled>Select team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Due date & time<input name="due_at" type="datetime-local"/></label><label className="full">Coach video link<input name="video_url" type="url" placeholder="YouTube or Vimeo URL"/></label><label className="full">Instructions<textarea name="instructions" placeholder="Watch the video, answer the questions, then complete the training task."/></label><label className="full">Question 1<input name="q1" placeholder="What should you do before receiving the ball?"/></label><label className="full">Question 2<input name="q2" placeholder="What information are you looking for when you scan?"/></label><label className="full">Training task<textarea name="task" placeholder="100 wall passes — 50 right foot / 50 left foot."/></label><button className="primary full" disabled={busy||teams.length===0}>{busy?'Publishing…':'Publish Assignment'}</button></form></section>
}
function TeamCreator({userId,onCreated,setMessage}:{userId:string;onCreated:()=>void;setMessage:(m:string)=>void}){const [name,setName]=useState('');async function add(){if(!supabase||!name.trim())return;const {error}=await supabase.from('teams').insert({name:name.trim(),created_by:userId});if(error)setMessage(error.message);else onCreated()}return <div className="callout"><b>No teams yet</b><p>Create your first team before publishing assignments.</p><div className="inline"><input value={name} onChange={e=>setName(e.target.value)} placeholder="12U Girls"/><button className="secondary" type="button" onClick={add}>Create team</button></div></div>}

function Players({teams,profiles,submissions}:{teams:Team[];profiles:Profile[];submissions:Submission[]}){const players=profiles.filter(p=>p.role==='player');return <section className="card"><h2>Players</h2><p className="muted">Player accounts appear here after they create an account.</p>{players.length===0?<Empty text="No player accounts yet."/>:players.map(p=><div className="playerRow" key={p.id}><div className="avatar">{p.display_name.slice(0,1).toUpperCase()}</div><div className="grow"><b>{p.display_name}</b><div className="muted">{p.username||'Player'}</div></div><span className="pill">{submissions.filter(s=>s.player_id===p.id&&['submitted','reviewed'].includes(s.status)).length} submitted</span></div>)}{teams.length>0&&<p className="muted small">Team membership is managed in the database-backed roster; assignment access follows team membership.</p>}</section>}

function PlayerDashboard({profile,assignments,submissions,onRefresh,setMessage}:{profile:Profile;assignments:Assignment[];submissions:Submission[];onRefresh:()=>void;setMessage:(m:string)=>void}){
 const [open,setOpen]=useState<Assignment|null>(null);const [qs,setQs]=useState<Question[]>([]);const [ts,setTs]=useState<Task[]>([]);const [answers,setAnswers]=useState<Record<string,string>>({});const [done,setDone]=useState<Record<string,boolean>>({});const [busy,setBusy]=useState(false)
 async function openA(a:Assignment){if(!supabase)return;setOpen(a);const [{data:q},{data:t}]=await Promise.all([supabase.from('questions').select('*').eq('assignment_id',a.id).order('position'),supabase.from('training_tasks').select('*').eq('assignment_id',a.id).order('position')]);setQs((q||[]) as Question[]);setTs((t||[]) as Task[])}
 async function submit(){if(!supabase||!open)return;setBusy(true);let sub=submissions.find(s=>s.assignment_id===open.id&&s.player_id===profile.id);if(!sub){const {data,error}=await supabase.from('submissions').insert({assignment_id:open.id,player_id:profile.id,status:'in_progress',started_at:new Date().toISOString()}).select().single();if(error||!data){setMessage(error?.message||'Could not start submission.');setBusy(false);return}sub=data as Submission}for(const q of qs){await supabase.from('answers').delete().eq('submission_id',sub.id).eq('question_id',q.id);await supabase.from('answers').insert({submission_id:sub.id,question_id:q.id,answer_text:answers[q.id]||''})}for(const t of ts){await supabase.from('task_completions').upsert({submission_id:sub.id,task_id:t.id,completed:Boolean(done[t.id])})}const {error}=await supabase.from('submissions').update({status:'submitted',submitted_at:new Date().toISOString()}).eq('id',sub.id);if(error)setMessage(error.message);else{setMessage('Assignment submitted. Nice work!');setOpen(null);onRefresh()}setBusy(false)}
 if(open)return <section className="card playerAssignment"><button className="linkButton left" onClick={()=>setOpen(null)}>← Back to assignments</button><div className="eyebrow">WATCH · THINK · TRAIN · SUBMIT</div><h1>{open.title}</h1><p>{open.instructions}</p>{open.video_url&&<a className="video" href={open.video_url} target="_blank" rel="noreferrer">▶ Open Coach Video</a>}<div className="steps"><span>1 WATCH</span><span>2 THINK</span><span>3 TRAIN</span><span>4 SUBMIT</span></div>{qs.map((q,i)=><label className="question" key={q.id}><b>Question {i+1}</b><span>{q.prompt}</span><textarea value={answers[q.id]||''} onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}/></label>)}{ts.map(t=><label className="task" key={t.id}><input type="checkbox" checked={Boolean(done[t.id])} onChange={e=>setDone({...done,[t.id]:e.target.checked})}/><span><b>Training Task</b><br/>{t.description}</span></label>)}<button className="primary" onClick={submit} disabled={busy}>{busy?'Submitting…':'Submit Assignment'}</button></section>
 return <><div className="welcome"><div className="eyebrow">PLAYER DASHBOARD</div><h1>Welcome, {profile.display_name}</h1><p className="muted">Watch. Think. Train. Develop.</p></div><section className="card"><h2>Your assignments</h2>{assignments.length===0?<Empty text="No published assignments are assigned to your team yet."/>:assignments.map(a=>{const s=submissions.find(x=>x.assignment_id===a.id&&x.player_id===profile.id);return <button className="assignmentButton" key={a.id} onClick={()=>openA(a)}><div><b>{a.title}</b><small>Due {fmtDue(a.due_at)}</small></div><span className={`pill ${s?.status==='submitted'||s?.status==='reviewed'?'success':''}`}>{s?.status?.replace('_',' ')||'Not started'}</span></button>})}</section></>
}
