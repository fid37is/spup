'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldAlert, ShieldX, SearchX, ExternalLink, ArrowLeft, Flag } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'
import { reportLinkAction } from '@/lib/actions/links'

type Props =
  | { state: 'missing'; appealUrl: string; slug?: undefined; domain?: undefined; url?: undefined; verified?: undefined }
  | { state: 'blocked'; appealUrl: string; slug: string; domain?: undefined; url?: undefined; verified?: undefined }
  | { state: 'warn'; appealUrl: string; slug: string; domain: string; url: string; verified: boolean }

export default function LinkView(props: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const [reported, setReported] = useState<'idle' | 'done' | 'login' | 'error'>('idle')
  const [pending, startTransition] = useTransition()

  function goBack() {
    // Opened in a new tab there is nothing to go back to: head to the app instead.
    if (window.history.length > 1) router.back()
    else router.push('/')
  }

  function report() {
    if (props.state !== 'warn') return
    startTransition(async () => {
      const res = await reportLinkAction(props.slug)
      if ('success' in res) setReported('done')
      else setReported(res.error === 'Not authenticated' ? 'login' : 'error')
    })
  }

  const Icon = props.state === 'warn' ? ShieldAlert : props.state === 'blocked' ? ShieldX : SearchX
  const iconColor = props.state === 'warn' ? 'var(--color-gold, #E8A100)' : props.state === 'blocked' ? 'var(--color-error)' : 'var(--color-text-muted)'

  const title = props.state === 'warn' ? t('links.leaving_title') : props.state === 'blocked' ? t('links.blocked_title') : t('links.missing_title')

  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))',
      background: 'var(--color-bg)', color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 22, padding: '28px 22px 22px', textAlign: 'center',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface-2)', color: iconColor,
        }}>
          <Icon size={30} />
        </div>

        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 21, margin: '0 0 8px' }}>{title}</h1>

        {props.state === 'warn' && (
          <>
            <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              {t('links.leaving_body')}
            </p>
            <div style={{
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 14,
              padding: '12px 14px', margin: '0 0 14px', textAlign: 'left',
            }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, wordBreak: 'break-all' }}>{props.domain}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4, wordBreak: 'break-all' }}>
                {props.url.length > 120 ? props.url.slice(0, 119) + '…' : props.url}
              </div>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', margin: '0 0 6px', lineHeight: 1.5 }}>
              {t('links.leaving_warning')}
            </p>
            {!props.verified && (
              <p style={{ fontSize: 13, color: 'var(--color-gold, #E8A100)', margin: '0 0 6px', fontWeight: 600 }}>{t('links.unverified_notice')}</p>
            )}

            <div style={{ display: 'flex', gap: 10, margin: '18px 0 4px' }}>
              <button
                type="button" onClick={goBack}
                style={{
                  flex: 1, minHeight: 46, borderRadius: 23, border: '1px solid var(--color-border)', background: 'transparent',
                  color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <ArrowLeft size={16} /> {t('links.go_back')}
              </button>
              <a
                href={props.url} rel="nofollow ugc noopener noreferrer" referrerPolicy="no-referrer"
                style={{
                  flex: 1, minHeight: 46, borderRadius: 23, background: 'var(--color-brand)', color: 'white', textDecoration: 'none',
                  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {t('links.continue')} <ExternalLink size={15} />
              </a>
            </div>

            <div style={{ marginTop: 14, fontSize: 13 }}>
              {reported === 'done' ? (
                <span style={{ color: 'var(--color-text-muted)' }}>{t('links.reported')}</span>
              ) : reported === 'login' ? (
                <Link href="/login" style={{ color: 'var(--color-brand)', fontWeight: 600 }}>{t('links.report_login')}</Link>
              ) : (
                <button
                  type="button" onClick={report} disabled={pending}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <Flag size={13} /> {reported === 'error' ? t('links.report_failed') : t('links.report')}
                </button>
              )}
            </div>
          </>
        )}

        {props.state === 'blocked' && (
          <>
            <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>{t('links.blocked_body')}</p>
            <Link href={props.appealUrl} style={{ color: 'var(--color-brand)', fontWeight: 600, fontSize: 14 }}>{t('links.appeal_hint')}</Link>
          </>
        )}

        {props.state === 'missing' && (
          <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>{t('links.missing_body')}</p>
        )}

        {props.state !== 'warn' && (
          <div style={{ marginTop: 18 }}>
            <button
              type="button" onClick={goBack}
              style={{
                minHeight: 44, padding: '0 26px', borderRadius: 22, border: '1px solid var(--color-border)', background: 'transparent',
                color: 'var(--color-text-primary)', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              {t('links.go_back')}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
