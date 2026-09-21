
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type PlayerRequest = {
  id: string
  player_name: string
  team_id: string
  status: string
  created_at: string
}

type CoachRequest = {
  id: string
  applicant_id: string
  status: string
  created_at: string
}

type CoachProfile = {
  id: string
  display_name: string | null
}

export default function CoachRegistrations() {
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [players, setPlayers] = useState<PlayerRequest[]>([])
  const [coaches, setCoaches] = useState<CoachRequest[]>([])
  const [coachNames, setCoachNames] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function loadRequests() {
    if (!supabase) return

    const [playerResult, coachResult] = await Promise.all([
      supabase
        .from('player_registration_requests')
        .select('id, player_name, team_id, status, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('coach_registration_requests')
        .select('id, applicant_id, status, created_at')
        .order('created_at', { ascending: false })
    ])

    if (playerResult.error || coachResult.error) {
      setMessage(
        playerResult.error?.message ||
        coachResult.error?.message ||
        'Unable to load registrations.'
      )
      return
    }

    setPlayers(playerResult.data || [])
    const coachData = coachResult.data || []
    setCoaches(coachData)

    if (coachData.length === 0) {
      setCoachNames({})
      return
    }

    const ids = coachData.map(request => request.applicant_id)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids)

    if (error) {
      setMessage(error.message)
      return
    }

    const names: Record<string, string> = {}

    ;((data || []) as CoachProfile[]).forEach(profile => {
      names[profile.id] = profile.display_name || 'Unnamed coach'
    })

    setCoachNames(names)
  }

  useEffect(() => {
    async function initialize() {
      if (!supabase) {
        setMessage('Supabase is not configured.')
        setChecking(false)
        return
      }

      const { data: authData, error: authError } =
        await supabase.auth.getUser()

      if (authError || !authData.user) {
        setMessage('Please sign in as the administrator.')
        setChecking(false)
        return
      }

      const { data: isAdmin, error } =
        await supabase.rpc('is_app_admin')

      if (error || isAdmin !== true) {
        setMessage('Administrator access required.')
        setChecking(false)
        return
      }

      setAuthorized(true)
      await loadRequests()
      setChecking(false)
    }

    void initialize()
  }, [])

  async function review(
    type: 'player' | 'coach',
    id: string,
    decision: 'approved' | 'rejected'
  ) {
    if (!supabase || !authorized || busy !== null) return

    setBusy(id)
    setMessage('')

    const functionName =
      type === 'player'
        ? 'review_player_request'
        : 'review_coach_request'

    const { error } = await supabase.rpc(functionName, {
      request_id: id,
      decision
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage(
        `${type === 'player' ? 'Player' : 'Coach'} request ${decision}.`
      )
      await loadRequests()
    }

    setBusy(null)
  }

  if (checking) {
    return <main style={{ padding: 24 }}>Checking administrator access...</main>
  }

  if (!authorized) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Registration Management</h1>
        <p role="status">{message}</p>
      </main>
    )
  }

  return (
    <main style={{
      maxWidth: 850,
      margin: '40px auto',
      padding: 20
    }}>
      <h1>Registration Management</h1>
      <p>Administrator approval is required before granting access.</p>

      {message && <p role="status">{message}</p>}

      <h2>Assistant Coach Applications</h2>

      {coaches.length === 0 && <p>No coach applications found.</p>}

      {coaches.map(request => (
        <section
          key={request.id}
          style={{
            border: '1px solid #ccc',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16
          }}
        >
          <h3>
            {coachNames[request.applicant_id] || 'Coach applicant'}
          </h3>
          <p>Status: {request.status}</p>

          {request.status === 'pending' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                disabled={busy !== null}
                onClick={() =>
                  review('coach', request.id, 'approved')
                }
              >
                Approve Coach
              </button>

              <button
                disabled={busy !== null}
                onClick={() =>
                  review('coach', request.id, 'rejected')
                }
              >
                Reject
              </button>
            </div>
          )}
        </section>
      ))}

      <h2>Player Registration Requests</h2>

      {players.length === 0 && <p>No player requests found.</p>}

      {players.map(request => (
        <section
          key={request.id}
          style={{
            border: '1px solid #ccc',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16
          }}
        >
          <h3>{request.player_name}</h3>
          <p>Team ID: {request.team_id}</p>
          <p>Status: {request.status}</p>

          {request.status === 'pending' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                disabled={busy !== null}
                onClick={() =>
                  review('player', request.id, 'approved')
                }
              >
                Approve Player
              </button>

              <button
                disabled={busy !== null}
                onClick={() =>
                  review('player', request.id, 'rejected')
                }
              >
                Reject
              </button>
            </div>
          )}
        </section>
      ))}
    </main>
  )
}
