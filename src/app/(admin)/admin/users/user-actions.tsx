// src/app/(admin)/admin/users/user-actions.tsx
'use client'

import { useState, useTransition } from 'react'
import { adminUpdateUserAction } from '@/lib/actions/admin'
import { MoreHorizontal } from 'lucide-react'

export default function AdminUserActions({ userId, currentStatus, currentRole }: {
  userId: string; currentStatus: string; currentRole: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function doAction(action: string) {
    setOpen(false)
    startTransition(async () => {
      await adminUpdateUserAction({ userId, action: action as any })
      window.location.reload()
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: '#1A1A20', border: '1px solid #2A2A30', borderRadius: 7,
          padding: '6px 10px', cursor: 'pointer', color: '#8A8A85', display: 'flex', alignItems: 'center',
        }}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', right: 0, top: 34, zIndex: 20,
            background: '#131318', border: '1px solid #2A2A30', borderRadius: 10,
            minWidth: 170, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
          }}>
            {currentStatus !== 'suspended' && (
              <MenuItem label="Suspend 7 days" color="#D4A017" onClick={() => doAction('suspend')} />
            )}
            {currentStatus === 'suspended' && (
              <MenuItem label="Lift suspension" color="#1A9E5F" onClick={() => doAction('unsuspend')} />
            )}
            {currentStatus !== 'banned' && (
              <MenuItem label="Permanent ban" color="#E53935" onClick={() => doAction('ban')} />
            )}
            {currentStatus === 'banned' && (
              <MenuItem label="Unban account" color="#1A9E5F" onClick={() => doAction('unban')} />
            )}
            <div style={{ height: 1, background: '#1E1E26', margin: '4px 0' }} />
            {currentRole === 'user' && (
              <MenuItem label="Promote to moderator" color="#378ADD" onClick={() => doAction('make_moderator')} />
            )}
            {currentRole === 'moderator' && (
              <MenuItem label="Revoke moderator" color="#D4A017" onClick={() => doAction('revoke_moderator')} />
            )}
            <div style={{ height: 1, background: '#1E1E26', margin: '4px 0' }} />
            <MenuItem label="View full profile" color="#8A8A85" onClick={() => { window.location.href = `/admin/users/${userId}` }} />
          </div>
        </>
      )}

      {isPending && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,5,8,0.6)', borderRadius: 7 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #1A9E5F', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 14px', background: 'none', border: 'none',
        fontSize: 13, color, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
        transition: 'background 0.1s',
      }}
    >
      {label}
    </button>
  )
}