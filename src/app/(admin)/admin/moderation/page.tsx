// src/app/(admin)/admin/moderation/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import AdminPostActions from '../posts/post-actions'

// Shows posts that are sensitive-flagged OR have 3+ reports — the active moderation queue
async function getModerationQueue() {
  const admin = createAdminClient()

  // Sensitive-flagged posts not yet deleted
  const { data: sensitive } = await admin
    .from('posts')
    .select(`
      id, body, is_sensitive, created_at,
      author:users!posts_user_id_fkey(id, username, display_name, status)
    `)
    .eq('is_sensitive', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(30)

  // Posts with multiple reports
  const { data: reported } = await admin
    .from('reports')
    .select('entity_id')
    .eq('entity_type', 'post')
    .eq('status', 'pending')

  const reportCounts: Record<string, number> = {}
  ;(reported || []).forEach((r: {entity_id: string}) => {
    reportCounts[r.entity_id] = (reportCounts[r.entity_id] || 0) + 1
  })

  const hotPostIds = Object.entries(reportCounts)
    .filter(([, count]) => count >= 2)
    .map(([id]) => id)

  let hotPosts: any[] = []
  if (hotPostIds.length > 0) {
    const { data } = await admin
      .from('posts')
      .select(`
        id, body, is_sensitive, created_at,
        author:users!posts_user_id_fkey(id, username, display_name, status)
      `)
      .in('id', hotPostIds)
      .is('deleted_at', null)

    hotPosts = (data || []).map((p: any) => ({
      ...p,
      reportCount: reportCounts[p.id] || 0,
    }))
  }

  return {
    sensitive: sensitive || [],
    hotPosts,
  }
}

async function getSuspendedUsers() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('id, username, display_name, status, created_at')
    .eq('status', 'suspended')
    .order('created_at', { ascending: false })
    .limit(20)
  return data || []
}

export default async function AdminModerationPage() {
  const [{ sensitive, hotPosts }, suspended] = await Promise.all([
    getModerationQueue(),
    getSuspendedUsers(),
  ])

  return (
    <div style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24, color: '#F0F0EC', letterSpacing: '-0.02em' }}>Moderation</h1>
        <p style={{ fontSize: 14, color: '#44444A', marginTop: 2 }}>Active content requiring human review</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Hot reported posts */}
        <div style={{ background: '#0D0D12', border: '1px solid rgba(229,57,53,0.2)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #141418', display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#F0F0EC' }}>Multiple reports</h2>
            {hotPosts.length > 0 && (
              <span style={{ background: '#E53935', color: 'white', fontSize: 11, fontWeight: 800, borderRadius: 10, padding: '1px 7px' }}>{hotPosts.length}</span>
            )}
          </div>
          {hotPosts.length === 0 ? (
            <div style={{ padding: '40px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#44444A' }}>No posts with multiple reports</p>
            </div>
          ) : hotPosts.map((post: any, i: number) => (
            <div key={post.id} style={{ padding: '14px 18px', borderBottom: i < hotPosts.length - 1 ? '1px solid #141418' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, background: 'rgba(229,57,53,0.12)', color: '#E53935', padding: '2px 8px', borderRadius: 5, fontWeight: 700 }}>
                      {post.reportCount} REPORTS
                    </span>
                    <span style={{ fontSize: 12, color: '#44444A' }}>@{post.author?.username}</span>
                    <span style={{ fontSize: 11, color: '#3A3A40' }}>{formatRelativeTime(post.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#C0C0B8', lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                    {post.body || <em style={{ color: '#44444A' }}>[media only]</em>}
                  </p>
                </div>
                <AdminPostActions postId={post.id} />
              </div>
            </div>
          ))}
        </div>

        {/* Sensitive flagged posts */}
        <div style={{ background: '#0D0D12', border: '1px solid rgba(212,160,23,0.15)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #141418', display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#F0F0EC' }}>Sensitive content</h2>
            {sensitive.length > 0 && (
              <span style={{ background: '#D4A017', color: '#000', fontSize: 11, fontWeight: 800, borderRadius: 10, padding: '1px 7px' }}>{sensitive.length}</span>
            )}
          </div>
          {sensitive.length === 0 ? (
            <div style={{ padding: '40px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#44444A' }}>No sensitive posts pending review</p>
            </div>
          ) : sensitive.map((post: any, i: number) => (
            <div key={post.id} style={{ padding: '14px 18px', borderBottom: i < sensitive.length - 1 ? '1px solid #141418' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, background: 'rgba(212,160,23,0.12)', color: '#D4A017', padding: '2px 8px', borderRadius: 5, fontWeight: 700 }}>SENSITIVE</span>
                    <span style={{ fontSize: 12, color: '#44444A' }}>@{post.author?.username}</span>
                    <span style={{ fontSize: 11, color: '#3A3A40' }}>{formatRelativeTime(post.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#C0C0B8', lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                    {post.body || <em style={{ color: '#44444A' }}>[media only]</em>}
                  </p>
                </div>
                <AdminPostActions postId={post.id} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suspended users */}
      <div style={{ marginTop: 20, background: '#0D0D12', border: '1px solid #1E1E26', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #141418' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#F0F0EC' }}>Currently suspended users</h2>
        </div>
        {suspended.length === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#44444A' }}>No suspended users</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, background: '#141418' }}>
            {suspended.map((u: any) => (
              <div key={u.id} style={{ background: '#0D0D12', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F0F0EC', fontFamily: "'Syne', sans-serif" }}>{u.display_name}</div>
                  <div style={{ fontSize: 11, color: '#44444A' }}>@{u.username}</div>
                </div>
                <a href={`/admin/users?q=${u.username}`} style={{ fontSize: 11, color: '#1A9E5F', textDecoration: 'none', fontWeight: 600 }}>Manage</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}