import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function ShareScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { session } = useAuth()

  const [scrapbook, setScrapbook] = useState(null)
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [addStatus, setAddStatus] = useState('idle') // 'idle' | 'sending' | 'not_found' | 'already_shared' | 'self' | 'error'

  async function loadShares() {
    const { data } = await supabase.rpc('get_scrapbook_shares', { p_scrapbook_id: id })
    if (data) setShares(data)
  }

  useEffect(() => {
    async function load() {
      const [{ data: sb }] = await Promise.all([
        supabase.from('scrapbooks').select('id, name').eq('id', id).single(),
        loadShares(),
      ])
      if (sb) setScrapbook(sb)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleAdd() {
    const lookup = email.trim().toLowerCase()
    if (!lookup) return
    setAddStatus('sending')
    try {
      const { data: recipientId, error: rpcErr } = await supabase.rpc('get_user_id_by_email', { lookup_email: lookup })
      if (rpcErr || !recipientId) { setAddStatus('not_found'); return }
      if (recipientId === session.user.id) { setAddStatus('self'); return }
      if (shares.some(s => s.shared_with_id === recipientId)) { setAddStatus('already_shared'); return }
      const { error: insertErr } = await supabase.from('scrapbook_shares').insert({
        scrapbook_id: id,
        owner_id: session.user.id,
        shared_with_id: recipientId,
      })
      if (insertErr) { setAddStatus(insertErr.code === '23505' ? 'already_shared' : 'error'); return }
      await loadShares()
      setEmail('')
      setAddStatus('idle')
    } catch {
      setAddStatus('error')
    }
  }

  async function handleRemove(shareId) {
    setShares(prev => prev.filter(s => s.share_id !== shareId))
    await supabase.from('scrapbook_shares').delete().eq('id', shareId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-walnut">
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-walnut overflow-hidden">

      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-12 pb-4 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-walnut-mid active:opacity-80 transition-opacity"
        >
          <ArrowLeft size={20} strokeWidth={2} className="text-wheat" />
        </button>
        <div>
          <h1 className="font-display font-semibold text-[19px] text-wheat leading-tight">Sharing</h1>
          <p className="text-rust text-[12px] leading-none mt-0.5">{scrapbook?.name}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-10">

        {/* Who has access */}
        <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase mb-3 mt-2">
          Who has access
        </p>

        {shares.length === 0 ? (
          <div
            className="flex items-center justify-center py-10 rounded-2xl border border-walnut-light"
            style={{ background: '#3D2410' }}
          >
            <p className="text-wheat/30 font-sans text-sm">Not shared with anyone</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden border border-walnut-light" style={{ background: '#3D2410' }}>
            {shares.map((share, i) => (
              <div
                key={share.share_id}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderTop: i > 0 ? '1px solid #4A2E18' : 'none' }}
              >
                {/* Initial avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(242,162,74,0.15)' }}
                >
                  <span className="text-amber font-bold text-[13px]">
                    {share.email[0].toUpperCase()}
                  </span>
                </div>
                <span className="flex-1 text-wheat text-[14px] font-sans truncate">{share.email}</span>
                <button
                  onClick={() => handleRemove(share.share_id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60 flex-shrink-0"
                  style={{ background: 'rgba(232,133,90,0.12)' }}
                >
                  <X size={14} strokeWidth={2.5} className="text-sienna" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add someone */}
        <p className="text-rust text-[10px] font-bold tracking-[0.18em] uppercase mb-3 mt-8">
          Add someone
        </p>

        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setAddStatus('idle') }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="family@example.com"
          className="w-full rounded-xl px-4 py-3.5 font-sans text-base text-wheat placeholder:text-rust/50 outline-none border-[1.5px] border-walnut-light focus:border-amber transition-colors mb-3 caret-amber"
          style={{ background: '#3D2410' }}
        />

        {addStatus === 'not_found' && (
          <p className="text-sienna text-xs mb-3">No Cassette account found for that email.</p>
        )}
        {addStatus === 'already_shared' && (
          <p className="text-amber text-xs mb-3">Already shared with this person.</p>
        )}
        {addStatus === 'self' && (
          <p className="text-sienna text-xs mb-3">That's you!</p>
        )}
        {addStatus === 'error' && (
          <p className="text-sienna text-xs mb-3">Something went wrong. Try again.</p>
        )}

        <button
          onClick={handleAdd}
          disabled={!email.trim() || addStatus === 'sending'}
          className="w-full bg-amber text-walnut font-sans font-bold text-[15px] rounded-2xl py-4 active:opacity-85 transition-opacity disabled:opacity-40"
        >
          {addStatus === 'sending' ? 'Adding…' : 'Share with this person'}
        </button>

      </div>
    </div>
  )
}
