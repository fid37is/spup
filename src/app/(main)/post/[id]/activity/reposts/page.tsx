import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import BackButton from '@/components/ui/back-button'
import { getPostRepostersList } from '@/lib/queries/post-engagers'
import LikerRow from '../likes/liker-row'
import ListSortMenu from '../list-sort-menu'

export default async function PostRepostsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const { id } = await params
  const { sort: sortParam } = await searchParams
  const sort: 'recent' | 'top' = sortParam === 'top' ? 'top' : 'recent'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: viewerProfile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  const { data: post } = await supabase.from('posts').select('id').eq('id', id).is('deleted_at', null).single()
  if (!post) notFound()

  const reposters = await getPostRepostersList(id, user.id, sort)

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BackButton variant="bare" fallbackHref={`/post/${id}/activity`} />
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)' }}>
            Reposted by
          </h1>
        </div>
        <ListSortMenu basePath={`/post/${id}/activity/reposts`} currentSort={sort} />
      </div>

      {reposters.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'var(--color-text-faint)' }}>No reposts yet.</p>
        </div>
      ) : (
        reposters.map(person => (
          <LikerRow key={person.id} user={person} isSelf={person.id === viewerProfile?.id} />
        ))
      )}
    </div>
  )
}