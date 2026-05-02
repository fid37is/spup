'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownToLine, X, ChevronDown, CheckCircle, AlertCircle, Loader2, Search } from 'lucide-react'
import { formatNaira } from '@/lib/utils'
import { useRouter } from 'next/navigation'

const BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Citibank Nigeria', code: '023' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank', code: '214' },
  { name: 'Globus Bank', code: '00103' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Heritage Bank', code: '030' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Kuda Bank', code: '50211' },
  { name: 'OPay', code: '304' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Providus Bank', code: '101' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Titan Trust Bank', code: '102' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'VFD Microfinance Bank', code: '566' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
]

type Step = 'form' | 'confirm' | 'success' | 'error'

interface WithdrawButtonProps {
  canWithdraw: boolean
  balance: number
  bvnVerified: boolean
  savedBank?: { bank_name: string; bank_account_number: string; bank_account_name: string; paystack_recipient_code: string } | null
}

export default function WithdrawButton({ canWithdraw, balance, bvnVerified, savedBank }: WithdrawButtonProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const router = useRouter()

  // Form state
  const [bankCode, setBankCode] = useState(savedBank?.paystack_recipient_code ? '' : '')
  const [bankName, setBankName] = useState(savedBank?.bank_name || '')
  const [accountNumber, setAccountNumber] = useState(savedBank?.bank_account_number || '')
  const [accountName, setAccountName] = useState(savedBank?.bank_account_name || '')
  const [resolving, setResolving] = useState(false)
  const [bankSearch, setBankSearch] = useState('')
  const [showBankList, setShowBankList] = useState(false)
  const [amountKobo, setAmountKobo] = useState(balance)

  useEffect(() => { setMounted(true) }, [])

  // Auto-resolve account name when bank + 10-digit account are ready
  useEffect(() => {
    if (!bankCode || accountNumber.length !== 10 || savedBank?.bank_account_number === accountNumber) return
    setAccountName('')
    setResolving(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/paystack/resolve-account?account_number=${accountNumber}&bank_code=${bankCode}`)
        const data = await res.json()
        if (data.account_name) setAccountName(data.account_name)
        else setAccountName('')
      } catch {
        setAccountName('')
      } finally {
        setResolving(false)
      }
    }, 600)
    return () => clearTimeout(timeout)
  }, [bankCode, accountNumber, savedBank?.bank_account_number])

  function reset() {
    setStep('form')
    setError('')
    if (!savedBank) {
      setBankCode(''); setBankName(''); setAccountNumber(''); setAccountName('')
    }
    setAmountKobo(balance)
  }

  function handleClose() {
    setOpen(false)
    setTimeout(reset, 300)
  }

  const canProceed = bankCode && accountNumber.length === 10 && accountName && amountKobo >= 100_000 && amountKobo <= balance

  function handleConfirm() {
    if (!canProceed) return
    setStep('confirm')
  }

  function handleWithdraw() {
    setError('')
    startTransition(async () => {
      try {
        const res = await fetch('/api/paystack/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount_kobo: amountKobo, bank_code: bankCode, account_number: accountNumber, account_name: accountName }),
        })
        const data = await res.json()
        if (!res.ok || data.error) { setError(data.error || 'Withdrawal failed.'); setStep('error'); return }
        setStep('success')
        router.refresh()
      } catch {
        setError('Network error. Please try again.')
        setStep('error')
      }
    })
  }

  const filteredBanks = BANKS.filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase()))

  const modal = (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        borderRadius: '20px 20px 0 0',
        maxHeight: '92dvh',
        overflowY: 'auto',
        animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
        maxWidth: 560,
        margin: '0 auto',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 16px' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            {step === 'confirm' ? 'Confirm withdrawal' : step === 'success' ? 'Withdrawal initiated' : step === 'error' ? 'Withdrawal failed' : 'Withdraw funds'}
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 20px 40px' }}>

          {/* SUCCESS */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={32} color="var(--color-brand)" />
              </div>
              <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                {formatNaira(amountKobo)} on its way
              </p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                Funds will arrive in your {bankName} account within 3–5 business days.
              </p>
              <button onClick={handleClose} style={{ marginTop: 28, width: '100%', padding: '14px', background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          )}

          {/* ERROR */}
          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <AlertCircle size={32} color="var(--color-error)" />
              </div>
              <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8 }}>Something went wrong</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 28 }}>{error}</p>
              <button onClick={() => setStep('form')} style={{ width: '100%', padding: '14px', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}

          {/* CONFIRM */}
          {step === 'confirm' && (
            <div>
              <div style={{ background: 'var(--color-surface-2)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                <Row label="Amount" value={formatNaira(amountKobo)} strong />
                <Row label="Bank" value={bankName} />
                <Row label="Account number" value={accountNumber} />
                <Row label="Account name" value={accountName} last />
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
                By confirming, you authorise Spup to transfer {formatNaira(amountKobo)} to the account above. This cannot be reversed once initiated.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('form')} style={{ flex: 1, padding: '14px', background: 'none', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                  Back
                </button>
                <button onClick={handleWithdraw} disabled={isPending} style={{ flex: 2, padding: '14px', background: 'var(--color-brand)', color: 'white', border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {isPending && <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />}
                  {isPending ? 'Processing…' : 'Confirm withdrawal'}
                </button>
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* FORM */}
          {step === 'form' && (
            <div>
              {/* Amount */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--color-text-muted)', fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>₦</span>
                  <input
                    type="number"
                    value={amountKobo / 100}
                    onChange={e => setAmountKobo(Math.round(parseFloat(e.target.value || '0') * 100))}
                    min={1000}
                    max={balance / 100}
                    step={100}
                    style={{ width: '100%', padding: '13px 14px 13px 30px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 16, color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Min ₦1,000</span>
                  <button onClick={() => setAmountKobo(balance)} style={{ fontSize: 12, color: 'var(--color-brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Withdraw all</button>
                </div>
              </div>

              {/* Bank selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>Bank</label>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowBankList(v => !v)}
                    style={{ width: '100%', padding: '13px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: bankName ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {bankName || 'Select bank'}
                    <ChevronDown size={16} style={{ transform: showBankList ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                  </button>

                  {showBankList && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Search size={14} color="var(--color-text-muted)" />
                        <input autoFocus value={bankSearch} onChange={e => setBankSearch(e.target.value)} placeholder="Search banks…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif" }} />
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {filteredBanks.map(b => (
                          <button key={b.code} onClick={() => { setBankCode(b.code); setBankName(b.name); setShowBankList(false); setBankSearch('') }}
                            style={{ width: '100%', padding: '11px 14px', background: b.code === bankCode ? 'var(--color-surface-2)' : 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 14, color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif", display: 'block' }}>
                            {b.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Account number */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>Account number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="10-digit NUBAN"
                  style={{ width: '100%', padding: '13px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 15, color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box', letterSpacing: '0.05em' }}
                />
              </div>

              {/* Account name (resolved) */}
              <div style={{ marginBottom: 24, minHeight: 44 }}>
                {resolving && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                    <Loader2 size={14} color="var(--color-text-muted)" style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Verifying account…</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                )}
                {!resolving && accountName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                    <CheckCircle size={15} color="var(--color-brand)" />
                    <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 600 }}>{accountName}</span>
                  </div>
                )}
                {!resolving && accountNumber.length === 10 && bankCode && !accountName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                    <AlertCircle size={15} color="var(--color-error)" />
                    <span style={{ fontSize: 14, color: 'var(--color-error)' }}>Account not found. Check details.</span>
                  </div>
                )}
              </div>

              <button
                onClick={handleConfirm}
                disabled={!canProceed}
                style={{ width: '100%', padding: '14px', background: canProceed ? 'var(--color-brand)' : 'var(--color-surface-2)', color: canProceed ? 'white' : 'var(--color-text-muted)', border: 'none', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: canProceed ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      <button
        onClick={() => canWithdraw && setOpen(true)}
        disabled={!canWithdraw}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: canWithdraw ? 'var(--color-brand)' : 'var(--color-surface-2)', color: canWithdraw ? 'white' : 'var(--color-text-muted)', border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, cursor: canWithdraw ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}
      >
        <ArrowDownToLine size={16} />
        Withdraw
      </button>
      {!canWithdraw && bvnVerified && balance < 100_000 && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>Minimum withdrawal is ₦1,000</p>
      )}
      {mounted && open && createPortal(modal, document.body)}
    </>
  )
}

function Row({ label, value, strong, last }: { label: string; value: string; strong?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: last ? 'none' : '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: strong ? 700 : 500, color: 'var(--color-text-primary)', fontFamily: strong ? "'Syne', sans-serif" : "'DM Sans', sans-serif" }}>{value}</span>
    </div>
  )
}