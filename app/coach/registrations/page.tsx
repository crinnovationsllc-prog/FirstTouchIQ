 'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type Request = {
  id: string
  player_name: string
  team_id: string
  status: string
  created_at: string
}

export default function CoachRegistrations() {
  const [requests, setRequests] = useState<Request[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function loadRequests() {
    if (!supabase) return

    const { data, error } = await supabase
      .from('player_registration_requests')
      .select('id, player_name, team_id, status, created_at')
      .order('created_at', { ascending: false })

    if (error) setMessage(error.message)
    else setRequests(data || [])
  }

  useEffect(() => {
    void loadRequests()
  }, [])

  async function review(id: string, decision: 'approved' | 'rejected') {
    if (!supabase) return
    setBusy(id)
    setMessage('')

    const { error } = await supabase.rpc('review_player_request', {
      request_id: id,
      decision
    })

    if (error) setMessage(error.message)
    else {
      setMessage(`Request ${decision}.`)
      await loadRequests()
    }

    setBusy(null)
  }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: 20 }}>
      <h1>Player Registration Requests</h1>
      <p>Review parent requests before granting team access.</p>

      {message && <p role="status">{message}</p>}

      {requests.length === 0 && <p>No registration requests found.</p>}

      {requests.map(request => (
        <section key={request.id} style={{
          border: '1px solid #ccc',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16
        }}>
          <h2>{request.player_name}</h2>
          <p>Team ID: {request.team_id}</p>
          <p>Status: {request.status}</p>

          {request.status === 'pending' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                disabled={busy !== null}
                onClick={() => review(request.id, 'approved')}
              >
                Approve
              </button>
              <button
                disabled={busy !== null}
                onClick={() => review(request.id, 'rejected')}
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
