'use client'

import { useState } from 'react'

type Team = { id: string; name: string }
type Profile = { id: string; role: string; display_name: string; username: string | null }
type Player = { id: string; display_name: string; team_ids: string[] }
type Assignment = { id: string; team_id: string; title: string; status: string; due_at: string | null; created_at: string }
type ManagedSubmission = { id: string; assignment_id: string; managed_player_id: string; status: string; answers: Record<string, string> | null; training_completed?: boolean | null }
type DirectSubmission = { id: string; assignment_id: string; player_id: string; status: string }
type Question = { id: string; assignment_id: string; position: number; prompt: string }
type Task = { id: string; assignment_id: string; position: number; description: string }
type DirectAnswer = { submission_id: string; question_id: string; answer_text: string }
type TeamMember = { player_id: string; team_id: string }
type ReviewPlayer = { key: string; id: string; kind: 'managed' | 'direct'; display_name: string; team_ids: string[]; username?: string | null }

type Props = {
  teams: Team[]
  profiles: Profile[]
  submissions: DirectSubmission[]
  managedPlayers: Player[]
  assignments: Assignment[]
  managedSubmissions: ManagedSubmission[]
  allQuestions: Question[]
  allTasks: Task[]
  directAnswers: DirectAnswer[]
  directMemberships: TeamMember[]
  onMarkManagedReviewed: (id: string) => Promise<boolean>
  onMarkDirectReviewed: (id: string) => Promise<boolean>
}

const pending = (status?: string) => status === 'completed' || status === 'submitted'
const completed = (status?: string) => pending(status) || status === 'reviewed'
const displayStatus = (status?: string) => (status || 'not_started').replace(/_/g, ' ')
const dateValue = (date: string | null) => date ? new Date(date).getTime() || 0 : 0

export default function PlayersReview({
  teams, profiles, submissions, managedPlayers, assignments, managedSubmissions,
  allQuestions, allTasks, directAnswers, directMemberships,
  onMarkManagedReviewed, onMarkDirectReviewed
}: Props) {
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const players: ReviewPlayer[] = [
    ...managedPlayers.map(player => ({
      key: 'managed:' + player.id, id: player.id, kind: 'managed' as const,
      display_name: player.display_name, team_ids: player.team_ids
    })),
    ...profiles.filter(profile => profile.role === 'player').map(profile => ({
      key: 'direct:' + profile.id, id: profile.id, kind: 'direct' as const,
      display_name: profile.display_name,
      username: profile.username,
      team_ids: directMemberships.filter(m => m.player_id === profile.id).map(m => m.team_id)
    }))
  ].sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }) || a.key.localeCompare(b.key))

  const submissionFor = (player: ReviewPlayer, assignmentId: string) =>
    player.kind === 'managed'
      ? managedSubmissions.find(s => s.managed_player_id === player.id && s.assignment_id === assignmentId)
      : submissions.find(s => s.player_id === player.id && s.assignment_id === assignmentId)

  const playerAssignments = (player: ReviewPlayer) =>
    assignments
      .filter(a => player.team_ids.includes(a.team_id) && (a.status !== 'draft' || Boolean(submissionFor(player, a.id))))
      .sort((a, b) => sortOrder === 'newest'
        ? dateValue(b.created_at) - dateValue(a.created_at) || a.title.localeCompare(b.title)
        : dateValue(a.created_at) - dateValue(b.created_at) || a.title.localeCompare(b.title))

  const reviewCount = (player: ReviewPlayer) => playerAssignments(player)
    .filter(a => pending(submissionFor(player, a.id)?.status)).length

  const reviewedCount = (player: ReviewPlayer) => playerAssignments(player)
    .filter(a => submissionFor(player, a.id)?.status === 'reviewed').length

  const visiblePlayers = players.filter(player => {
    if (teamFilter !== 'all' && !player.team_ids.includes(teamFilter)) return false
    if (!player.display_name.toLowerCase().includes(query.trim().toLowerCase())) return false
    if (statusFilter === 'pending' && reviewCount(player) === 0) return false
    if (statusFilter === 'reviewed' && reviewedCount(player) === 0) return false
    return true
  })

  const selectedPlayer = players.find(p => p.key === selectedPlayerKey)
  const history = selectedPlayer
    ? playerAssignments(selectedPlayer).filter(a => teamFilter === 'all' || a.team_id === teamFilter)
    : []
  const selectedAssignment = history.find(a => a.id === selectedAssignmentId)
  const selectedSubmission = selectedPlayer && selectedAssignment
    ? submissionFor(selectedPlayer, selectedAssignment.id) : undefined
  const nextPendingAssignment = selectedPlayer
    ? history.find(a => a.id !== selectedAssignmentId && pending(submissionFor(selectedPlayer, a.id)?.status))
    : undefined
  const nextPlayer = selectedPlayer
    ? players.find(p => p.key !== selectedPlayer.key &&
      (teamFilter === 'all' || p.team_ids.includes(teamFilter)) && reviewCount(p) > 0)
    : undefined

  async function markReviewed() {
    if (!selectedPlayer || !selectedSubmission || busyId || !pending(selectedSubmission.status)) return
    setError('')
    setNotice('')
    setBusyId(selectedSubmission.id)
    try {
      const success = selectedPlayer.kind === 'managed'
        ? await onMarkManagedReviewed(selectedSubmission.id)
        : await onMarkDirectReviewed(selectedSubmission.id)
      if (success) setNotice('Assignment marked reviewed.')
      else setError('Could not mark this assignment reviewed. Check your coach permissions and try again.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this submission.')
    } finally {
      setBusyId('')
    }
  }

  const backToPlayers = () => {
    setSelectedPlayerKey(null)
    setSelectedAssignmentId(null)
    setError('')
    setNotice('')
  }

  return <section className="card">
    <div className="sectionHead">
      <div>
        <h2>Players</h2>
        <p className="muted">Find a player, read their assignments, and mark completed work reviewed.</p>
      </div>
      <span className="pill">{players.length} players</span>
    </div>

    <div className="reviewToolbar">
      <label>Team
        <select value={teamFilter} onChange={e => { setTeamFilter(e.target.value); setSelectedAssignmentId(null); setSelectedPlayerKey(null) }}>
          <option value="all">All my teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>Show
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All players</option>
          <option value="pending">Needs review</option>
          <option value="reviewed">Has reviewed work</option>
        </select>
      </label>
      <label>Assignment order
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest')}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </label>
      {!selectedPlayer && <label className="reviewSearch">Search by name
        <input type="search" value={query} placeholder="Enter player name" onChange={e => setQuery(e.target.value)} />
      </label>}
    </div>

    {error && <p className="notice" role="alert">{error}</p>}
    {notice && <p className="reviewSuccess" role="status">{notice}</p>}

    {selectedPlayer && selectedAssignment ? <>
      <button type="button" className="linkButton left" onClick={() => { setSelectedAssignmentId(null); setNotice(''); setError('') }}>← Back to {selectedPlayer.display_name}&apos;s assignments</button>
      <div className="reviewDetailHeader">
        <div>
          <div className="eyebrow">{selectedPlayer.display_name} · {teams.find(t => t.id === selectedAssignment.team_id)?.name || 'Team'}</div>
          <h2>{selectedAssignment.title}</h2>
          <p className="muted">Due {selectedAssignment.due_at ? new Date(selectedAssignment.due_at).toLocaleDateString() : 'not set'}</p>
        </div>
        <span className={'pill ' + (selectedSubmission?.status === 'reviewed' ? 'success' : '')}>{displayStatus(selectedSubmission?.status)}</span>
      </div>
      <h3>Player answers</h3>
      {(() => {
        const qs = allQuestions.filter(q => q.assignment_id === selectedAssignment.id).sort((a, b) => a.position - b.position)
        if (!qs.length) return <p className="muted">This assignment has no questions.</p>
        return qs.map((q, index) => {
          const answer = selectedPlayer.kind === 'managed'
            ? (selectedSubmission as ManagedSubmission | undefined)?.answers?.[q.id]
            : directAnswers.find(a => a.submission_id === selectedSubmission?.id && a.question_id === q.id)?.answer_text
          return <div className="reviewAnswer" key={q.id}>
            <strong>{index + 1}. {q.prompt}</strong>
            <p>{answer?.trim() || 'No answer submitted.'}</p>
          </div>
        })
      })()}
      {allTasks.filter(t => t.assignment_id === selectedAssignment.id).length > 0 && <div className="reviewTasks">
        <h3>Training tasks</h3>
        {allTasks.filter(t => t.assignment_id === selectedAssignment.id).sort((a, b) => a.position - b.position)
          .map(task => <div className="reviewAnswer" key={task.id}>{task.description}</div>)}
        {selectedPlayer.kind === 'managed' && (selectedSubmission as ManagedSubmission | undefined)?.training_completed != null &&
          <p className="muted small">Player training: {(selectedSubmission as ManagedSubmission).training_completed ? 'Completed' : 'Not yet marked complete'}</p>}
      </div>}
      <div className="reviewActions">
        {pending(selectedSubmission?.status) &&
          <button type="button" className="primary" onClick={() => void markReviewed()} disabled={Boolean(busyId)}>
            {busyId ? 'Saving…' : '✓ Mark Reviewed'}
          </button>}
        {selectedSubmission?.status === 'reviewed' && <span className="pill success">✓ Reviewed</span>}
        {nextPendingAssignment && <button type="button" className="secondary" disabled={Boolean(busyId)} onClick={() => { setSelectedAssignmentId(nextPendingAssignment.id); setError(''); setNotice('') }}>Next assignment needing review →</button>}
      </div>
    </> : selectedPlayer ? <>
      <button type="button" className="linkButton left" onClick={backToPlayers}>← Back to players</button>
      <div className="reviewDetailHeader">
        <div>
          <h2>{selectedPlayer.display_name}</h2>
          <p className="muted">{teams.filter(t => selectedPlayer.team_ids.includes(t.id)).map(t => t.name).join(' · ') || 'Player account'}</p>
        </div>
        <span className="pill">{reviewCount(selectedPlayer)} need review</span>
      </div>
      <h3>Assignment history</h3>
      {history.length === 0 && <p className="muted">No assignments for this player in the selected team.</p>}
      {history.map(assignment => {
        const s = submissionFor(selectedPlayer, assignment.id)
        return <button type="button" className="reviewAssignmentRow" key={assignment.id} onClick={() => { setSelectedAssignmentId(assignment.id); setError(''); setNotice('') }}>
          <span className="grow">
            <strong>{assignment.title}</strong>
            <small>{teams.find(t => t.id === assignment.team_id)?.name || 'Team'} · Due {assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'not set'}</small>
          </span>
          <span className={'pill ' + (s?.status === 'reviewed' ? 'success' : '')}>{displayStatus(s?.status)}</span>
          <span aria-hidden="true">›</span>
        </button>
      })}
      {nextPlayer && <button type="button" className="secondary reviewNextPlayer" onClick={() => { setSelectedPlayerKey(nextPlayer.key); setSelectedAssignmentId(null); setError(''); setNotice('') }}>Next player needing review → {nextPlayer.display_name}</button>}
    </> : <>
      <p className="muted small">{visiblePlayers.length} of {players.length} players · Alphabetical by name</p>
      {visiblePlayers.map(player => {
        const count = reviewCount(player)
        return <button type="button" className="reviewPlayerRow" key={player.key} onClick={() => { setSelectedPlayerKey(player.key); setSelectedAssignmentId(null); setError(''); setNotice('') }}>
          <span className="avatar" aria-hidden="true">{player.display_name.slice(0, 1).toUpperCase()}</span>
          <span className="grow">
            <strong>{player.display_name}</strong>
            <small>{teams.filter(t => player.team_ids.includes(t.id)).map(t => t.name).join(' · ') || player.username || 'Player account'}</small>
          </span>
          <span className={'pill ' + (count === 0 && reviewedCount(player) > 0 ? 'success' : '')}>{count ? count + ' need review' : reviewedCount(player) + ' reviewed'}</span>
          <span aria-hidden="true">›</span>
        </button>
      })}
      {!visiblePlayers.length && <p className="muted">No players match these filters.</p>}
    </>}
  </section>
}
