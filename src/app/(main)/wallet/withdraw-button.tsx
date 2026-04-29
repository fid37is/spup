'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, X } from 'lucide-react'
import { formatNaira } from '@/lib/utils'

export default function WithdrawButton({ canWithdraw, balance, bvnVerified }: { canWithdraw: boolean; balance: number; bvnVerified: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleWithdraw() {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500)) // TODO: wire Paystack
    setLoading(false)
    setSuccess(true)
    setTimeout(() => { setOpen(false); setSuccess(false) }, 2500)
  }

  return (
    <>
      <button
        onClick={() => canWithdraw && setOpen(true)}
        disabled={!canWithdraw}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: canWithdraw ? '#22A861' : 'rgba(255,255,255,0.05)',
          color: canWithdraw ? 'white' : '#333',
          border: 'none', borderRadius: 10,
          padding: '11px 20px',
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14,
          cursor: canWithdraw ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
          letterSpacing: '0.01em',
        }}
      >
        <ArrowDownToLine size={16} />
        Withdraw to bank
      </button>
      {!canWithdraw && !bvnVerified && (
        <p style={{ fontSize: 12, color: '#555', marginTop: 8 }}>BVN verification required before withdrawal</p>
      )}
      {!canWithdraw && bvnVerified && balance < 100_000 && (
        <p style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
          Minimum withdrawal is ₦1,000. You have {formatNaira(balance)}.
        </p>
      )}

      {/* Modal */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          padding: '0 0 0 0',
        }} onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div style={{
            background: '#111', border: '1px solid #2A2A2A',
            borderRadius: '20px 20px 0 0', padding: '24px 24px 40px',
            width: '100%', maxWidth: 480,
            animation: 'slideUp 0.25s ease',
          }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 20, color: '#F5F5F0' }}>Withdraw funds</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555' }}><X size={20} /></button>
            </div>

            {success ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#22A861', marginBottom: 8 }}>Withdrawal initiated!</div>
                <div style={{ fontSize: 14, color: '#555' }}>Funds arrive in 3–5 business days</div>
              </div>
            ) : (
              <>
                <div style={{ background: '#181818', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>Amount</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 28, color: '#F5F5F0' }}>{formatNaira(balance)}</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Full balance · Arrives in 3–5 business days</div>
                </div>

                <div style={{ background: '#181818', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Destination account</div>
                  <div style={{ fontSize: 14, color: '#9A9A90' }}>No bank account linked</div>
                  <button
                    onClick={() => { setOpen(false); router.push('/settings?section=bank') }}
                    style={{ marginTop: 8, background: 'none', border: 'none', color: '#22A861', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                    + Add bank account
                  </button>
                </div>

                <button
                  onClick={handleWithdraw}
                  disabled={loading || true /* TODO: enable once bank account linked */}
                  style={{
                    width: '100%', background: '#1A7A4A', color: 'white',
                    border: 'none', borderRadius: 12, padding: '14px',
                    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16,
                    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {loading ? 'Processing…' : `Withdraw ${formatNaira(balance)}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}