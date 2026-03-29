import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [defaults, setDefaults] = useState([])
  const [loading, setLoading] = useState(true)

  // Add flow
  const [username, setUsername] = useState('')
  const [addStatus, setAddStatus] = useState('idle') // 'idle'|'sending'|'not_found'|'already_added'|'self'|'error'
  const [pendingRecipient, setPendingRecipient] = useState(null) // { id, displayName, scrapbookCount }
  const [retroactive, setRetroactive] = useState(true)
  const [confirming, setConfirming] = useState(false)

  // Remove flow
  const [pendingRemove, setPendingRemove] = useState(null) // { id, recipient_id, displayName, scrapbookCount }
  const [removeMode, setRemoveMode] = useState('all') // 'future'|'all'

  async function loadDefaults() {
    const { data } = await supabase
      .from('sharing_defaults')
      .select('id, recipient_id')
      .eq('user_id', session.user.id)
    if (!data) { setLoading(false); return }
    if (data.length === 0) { setDefaults([]); setLoading(false); return }
    const ids = data.map(d => d.recipient_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, username')
      .in('user_id', ids)
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]))
    setDefaults(data.map(d => ({ ...d, ...profileMap[d.recipient_id] })))
    setLoading(false)
  }

  useEffect(() => { loadDefaults() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add flow ──────────────────────────────────────────────────────────────

  async function handleAdd() {
    const lookup = username.trim().toLowerCase()
    if (!lookup) return
    setAddStatus('sending')
    try {
      const { data: recipientId, error: rpcErr } = await supabase.rpc('get_user_id_by_username', { p_username: lookup })
      if (rpcErr || !recipientId) { setAddStatus('not_found'); return }
      if (recipientId === session.user.id) { setAddStatus('self'); return }
      if (defaults.some(d => d.recipient_id === recipientId)) { setAddStatus('already_added'); return }

      // Fetch display name + existing scrapbook count in parallel
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from('profiles').select('display_name, username').eq('user_id', recipientId).single(),
        supabase.from('scrapbooks').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
      ])
      const displayName = profile?.display_name || profile?.username || lookup
      setPendingRecipient({ id: recipientId, displayName, scrapbookCount: count || 0 })
      setRetroactive(true)
      setAddStatus('idle')
    } catch {
      setAddStatus('error')
    }
  }

  async function handleConfirmAdd() {
    if (!pendingRecipient || confirming) return
    setConfirming(true)
    try {
      const { error: insertErr } = await supabase.from('sharing_defaults').insert({
        user_id: session.user.id,
        recipient_id: pendingRecipient.id,
      })
      if (insertErr) {
        if (insertErr.code === '23505') setAddStatus('already_added')
        else setAddStatus('error')
        setPendingRecipient(null)
        setConfirming(false)
        return
      }

      if (retroactive && pendingRecipient.scrapbookCount > 0) {
        const { data: scrapbooks } = await supabase
          .from('scrapbooks')
          .select('id')
          .eq('user_id', session.user.id)
        if (scrapbooks && scrapbooks.length > 0) {
          const { error: upsertErr } = await supabase.from('scrapbook_shares').upsert(
            scrapbooks.map(sb => ({
              scrapbook_id: sb.id,
              owner_id: session.user.id,
              shared_with_id: pendingRecipient.id,
            })),
            { onConflict: 'scrapbook_id,shared_with_id', ignoreDuplicates: true }
          )
          if (upsertErr) {
            // Roll back the sharing_defaults row we just inserted
            await supabase.from('sharing_defaults')
              .delete()
              .eq('user_id', session.user.id)
              .eq('recipient_id', pendingRecipient.id)
            setAddStatus('error')
            setPendingRecipient(null)
            setConfirming(false)
            return
          }
        }
      }

      await loadDefaults()
      setPendingRecipient(null)
      setUsername('')
    } catch {
      setAddStatus('error')
      setPendingRecipient(null)
    }
    setConfirming(false)
  }

  // ── Remove flow ───────────────────────────────────────────────────────────

  async function handleRemovePress(def) {
    const { count } = await supabase
      .from('scrapbook_shares')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', session.user.id)
      .eq('shared_with_id', def.recipient_id)
    const displayName = def.display_name || def.username || 'this person'
    setPendingRemove({ id: def.id, recipient_id: def.recipient_id, displayName, scrapbookCount: count || 0 })
    setRemoveMode('all')
  }

  async function handleConfirmRemove() {
    if (!pendingRemove) return
    // Optimistic
    setDefaults(prev => prev.filter(d => d.id !== pendingRemove.id))
    const snapshot = pendingRemove
    setPendingRemove(null)

    await supabase.from('sharing_defaults').delete().eq('id', snapshot.id)
    if (removeMode === 'all') {
      await supabase.from('scrapbook_shares')
        .delete()
        .eq('owner_id', session.user.id)
        .eq('shared_with_id', snapshot.recipient_id)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-walnut overflow-hidden">

      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-12 pb-4 flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-walnut-mid active:opacity-80 transition-opacity"
        >
          <ArrowLeft size={20} strokeWidth={2} className="text-wheat" />
        </button>
        <h1 className="font-display font-semibold text-[19px] text-wheat leading-tight">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-10">

        {/* Section label */}
        <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase mb-2 mt-2">
          Auto-share new scrapbooks
        </p>
        <p className="text-wheat/50 font-sans text-[13px] leading-relaxed mb-4">
          Anyone listed here will automatically receive access when you create a new scrapbook.
        </p>

        {/* Defaults list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-amber border-t-transparent animate-spin" />
          </div>
        ) : defaults.length === 0 ? (
          <div
            className="flex items-center justify-center py-10 rounded-2xl border border-walnut-light mb-4"
            style={{ background: '#3D2410' }}
          >
            <p className="text-wheat/30 font-sans text-sm">No auto-share defaults yet</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden border border-walnut-light mb-3" style={{ background: '#3D2410' }}>
            {defaults.map((def, i) => (
              <div
                key={def.id}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderTop: i > 0 ? '1px solid #4A2E18' : 'none' }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(242,162,74,0.15)' }}
                >
                  <span className="text-amber font-bold text-[13px]">
                    {(def.display_name || def.username || '?')[0].toUpperCase()}
                  </span>
                </div>
                <span className="flex-1 text-wheat text-[14px] font-sans truncate">
                  {def.display_name || def.username}
                </span>
                <button
                  onClick={() => handleRemovePress(def)}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60 flex-shrink-0"
                  style={{ background: 'rgba(232,133,90,0.12)' }}
                >
                  <X size={14} strokeWidth={2.5} className="text-sienna" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footnote */}
        <p className="text-rust font-sans text-[12px] leading-relaxed mb-8">
          To share a single scrapbook, use the ⋯ menu inside that scrapbook.
        </p>

        {/* Add section */}
        <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase mb-3">
          Add a default
        </p>

        {pendingRecipient ? (
          /* Retroactive toggle confirmation */
          <div className="rounded-2xl border border-walnut-light overflow-hidden" style={{ background: '#3D2410' }}>
            <div className="px-4 pt-4 pb-3">
              <p className="text-wheat font-semibold text-[14px] mb-4">
                Add <span className="text-amber">{pendingRecipient.displayName}</span> to auto-share?
              </p>

              {/* Future only option */}
              <button
                onClick={() => setRetroactive(false)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-2 active:opacity-75 text-left"
                style={{ background: !retroactive ? 'rgba(242,162,74,0.1)' : 'rgba(44,26,14,0.6)', border: `1px solid ${!retroactive ? 'rgba(242,162,74,0.3)' : 'transparent'}` }}
              >
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: !retroactive ? '#F2A24A' : '#4A2E18' }}>
                  {!retroactive && <div className="w-2.5 h-2.5 rounded-full bg-amber" />}
                </div>
                <div>
                  <p className="text-wheat text-[13px] font-semibold leading-none mb-0.5">New scrapbooks only</p>
                  <p className="text-rust text-[11px]">Existing scrapbooks stay private</p>
                </div>
              </button>

              {/* All scrapbooks option */}
              <button
                onClick={() => setRetroactive(true)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:opacity-75 text-left"
                style={{ background: retroactive ? 'rgba(242,162,74,0.1)' : 'rgba(44,26,14,0.6)', border: `1px solid ${retroactive ? 'rgba(242,162,74,0.3)' : 'transparent'}` }}
              >
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: retroactive ? '#F2A24A' : '#4A2E18' }}>
                  {retroactive && <div className="w-2.5 h-2.5 rounded-full bg-amber" />}
                </div>
                <div>
                  <p className="text-wheat text-[13px] font-semibold leading-none mb-0.5">
                    All scrapbooks
                    {pendingRecipient.scrapbookCount > 0 && (
                      <span className="text-amber"> · {pendingRecipient.scrapbookCount}</span>
                    )}
                  </p>
                  <p className="text-rust text-[11px]">Share everything, past and future</p>
                </div>
              </button>
            </div>

            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={() => { setPendingRecipient(null); setUsername('') }}
                className="flex-1 py-3 rounded-xl font-sans font-semibold text-[14px] active:opacity-70"
                style={{ background: '#2C1A0E', color: '#7A3B1E' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={confirming}
                className="flex-1 py-3 rounded-xl font-sans font-bold text-[14px] active:opacity-80 disabled:opacity-40"
                style={{ background: '#F2A24A', color: '#2C1A0E' }}
              >
                {confirming ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          /* Username input */
          <>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setAddStatus('idle') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. joelle"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-xl px-4 py-3.5 font-sans text-base text-wheat placeholder:text-rust/50 outline-none border-[1.5px] border-walnut-light focus:border-amber transition-colors mb-3 caret-amber"
              style={{ background: '#3D2410' }}
            />
            {addStatus === 'not_found' && <p className="text-sienna text-xs mb-3">No Cassette user found with that name.</p>}
            {addStatus === 'already_added' && <p className="text-amber text-xs mb-3">Already in your auto-share list.</p>}
            {addStatus === 'self' && <p className="text-sienna text-xs mb-3">That's you!</p>}
            {addStatus === 'error' && <p className="text-sienna text-xs mb-3">Something went wrong. Try again.</p>}
            <button
              onClick={handleAdd}
              disabled={!username.trim() || addStatus === 'sending'}
              className="w-full bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl py-4 active:opacity-85 disabled:opacity-40"
            >
              {addStatus === 'sending' ? 'Looking up…' : 'Add to auto-share'}
            </button>
          </>
        )}
      </div>

      {/* Remove confirmation sheet */}
      {pendingRemove && (
        <>
          <div
            className="absolute inset-0 bg-black/50 z-10"
            onClick={() => setPendingRemove(null)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl border-t border-walnut-light px-5 pb-10 pt-1"
            style={{ background: '#3D2410' }}
          >
            <div className="w-10 h-1 rounded-full bg-walnut-light mx-auto mt-3 mb-5" />
            <p className="font-display font-semibold text-lg text-wheat mb-5">
              Remove <span className="text-sienna">{pendingRemove.displayName}</span>?
            </p>

            {/* Future only */}
            <button
              onClick={() => setRemoveMode('future')}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-2 active:opacity-75 text-left"
              style={{ background: removeMode === 'future' ? 'rgba(242,162,74,0.08)' : '#2C1A0E', border: `1px solid ${removeMode === 'future' ? 'rgba(242,162,74,0.25)' : 'transparent'}` }}
            >
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{ borderColor: removeMode === 'future' ? '#F2A24A' : '#4A2E18' }}>
                {removeMode === 'future' && <div className="w-2.5 h-2.5 rounded-full bg-amber" />}
              </div>
              <div>
                <p className="text-wheat text-[14px] font-semibold leading-none mb-0.5">Stop future shares only</p>
                <p className="text-rust text-[11px]">They keep access to scrapbooks already shared</p>
              </div>
            </button>

            {/* Remove all */}
            <button
              onClick={() => setRemoveMode('all')}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-5 active:opacity-75 text-left"
              style={{ background: removeMode === 'all' ? 'rgba(232,133,90,0.08)' : '#2C1A0E', border: `1px solid ${removeMode === 'all' ? 'rgba(232,133,90,0.25)' : 'transparent'}` }}
            >
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{ borderColor: removeMode === 'all' ? '#E8855A' : '#4A2E18' }}>
                {removeMode === 'all' && <div className="w-2.5 h-2.5 rounded-full bg-sienna" />}
              </div>
              <div>
                <p className="text-sienna text-[14px] font-semibold leading-none mb-0.5">
                  Remove all access
                  {pendingRemove.scrapbookCount > 0 && (
                    <span className="text-sienna/70"> · {pendingRemove.scrapbookCount} scrapbooks</span>
                  )}
                </p>
                <p className="text-rust text-[11px]">They lose access to everything shared with them</p>
              </div>
            </button>

            <button
              onClick={handleConfirmRemove}
              className="w-full py-3.5 rounded-2xl font-sans font-bold text-[15px] mb-2 active:opacity-80"
              style={{ background: removeMode === 'all' ? 'rgba(232,133,90,0.15)' : 'rgba(242,162,74,0.15)', color: removeMode === 'all' ? '#E8855A' : '#F2A24A' }}
            >
              Remove
            </button>
            <button
              onClick={() => setPendingRemove(null)}
              className="w-full py-3 text-center text-rust font-semibold text-[15px] active:opacity-70"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
