// src/app/(main)/explore/page.tsx
import { createClient } from '@/lib/supabase/server'
import { searchPosts, searchUsers } from '@/lib/queries'
import { formatNumber } from '@/lib/utils'
import { Search } from 'lucide-react'
import PostCard from '@/components/feed/post-card'
import Link from 'next/link'

const TOPIC_PILLS = ['Football','Afrobeats','Politics','Business','Nollywood','Comedy','Tech','Fashion','Crypto','Faith']
const AVATAR_COLORS = ['#1A9E5F','#7A3A1A','#1A4A7A','#4A1A7A','#7A6A1A']
const FALLBACK_TRENDING = [
  { tag:'LagosSpeaks', posts_count:14200 }, { tag:'SuperEagles', posts_count:8900 },
  { tag:'CBNPolicy', posts_count:6100 },    { tag:'NaijaFashion', posts_count:4400 },
  { tag:'AbujaTech', posts_count:3200 },    { tag:'SoroSoke', posts_count:2800 },
  { tag:'NollyGossip', posts_count:2100 },  { tag:'NaijaMusic', posts_count:1900 },
  { tag:'SportsBet9ja', posts_count:1700 }, { tag:'GistMeSpup', posts_count:1400 },
]

async function getTrending() {
  const supabase = await createClient()
  const { data } = await supabase.from('hashtags').select('tag, posts_count').order('posts_count', { ascending: false }).limit(10)
  return (data && data.length > 0) ? data : FALLBACK_TRENDING
}

interface SP { q?: string; tab?: string }

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams
  const query = params.q?.trim() || ''
  const activeTab = params.tab || 'posts'

  const [trending, postResults, userResults] = await Promise.all([
    query ? Promise.resolve([]) : getTrending(),
    query ? searchPosts(query, 20) : Promise.resolve([]),
    query ? searchUsers(query, 10) : Promise.resolve([]),
  ])
  const totalResults = postResults.length + userResults.length

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:10, backdropFilter:'blur(20px)', background:'rgba(5,5,8,0.9)', borderBottom:'1px solid #1E1E26', padding:'14px 20px' }}>
        <form method="GET" action="/explore">
          <div style={{ position:'relative' }}>
            <Search size={16} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#44444A', pointerEvents:'none' }} />
            <input name="q" defaultValue={query} type="search" placeholder="Search posts, people, #hashtags…" autoComplete="off"
              style={{ width:'100%', background:'#0D0D12', border:'1px solid #1E1E26', borderRadius:24, padding:'11px 16px 11px 42px', color:'#F0F0EC', fontSize:15, outline:'none', fontFamily:"'DM Sans', sans-serif" }} />
          </div>
        </form>
      </div>

      {!query && (
        <>
          <div style={{ padding:'20px 20px 0' }}>
            <h2 style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:15, color:'#F0F0EC', marginBottom:14 }}>Browse topics</h2>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:28 }}>
              {TOPIC_PILLS.map(t => (
                <a key={t} href={`/explore?q=${encodeURIComponent(t)}`} style={{ padding:'8px 16px', borderRadius:100, border:'1px solid #1E1E26', background:'#0D0D12', color:'#8A8A85', fontSize:13, textDecoration:'none', fontFamily:"'DM Sans', sans-serif" }}>
                  {t}
                </a>
              ))}
            </div>
          </div>
          <div style={{ borderTop:'1px solid #1E1E26' }}>
            <div style={{ padding:'16px 20px 10px' }}>
              <h2 style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:15, color:'#F0F0EC' }}>Trending in Nigeria 🇳🇬</h2>
            </div>
            {trending.map((t:any, i:number) => (
              <a key={t.tag} href={`/explore?q=${encodeURIComponent('#'+t.tag)}`} style={{ textDecoration:'none', display:'block' }}>
                <div style={{ padding:'13px 20px', borderBottom:'1px solid #0F0F14', cursor:'pointer' }}>
                  <div style={{ fontSize:11, color:'#3A3A40', marginBottom:2 }}>#{i+1} · Trending</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#F0F0EC', fontFamily:"'Syne', sans-serif" }}>#{t.tag}</div>
                  <div style={{ fontSize:12, color:'#3A3A40', marginTop:2 }}>{(t.posts_count as number).toLocaleString()} posts</div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {query && (
        <>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #1E1E26' }}>
            <p style={{ fontSize:13, color:'#44444A', marginBottom:12 }}>
              {totalResults === 0 ? 'No results' : `${totalResults} result${totalResults!==1?'s':''}`} for{' '}
              <strong style={{ color:'#F0F0EC' }}>&ldquo;{query}&rdquo;</strong>
            </p>
            <div style={{ display:'flex', gap:6 }}>
              {[{key:'posts',label:'Posts',count:postResults.length},{key:'people',label:'People',count:userResults.length}].map(tab => (
                <a key={tab.key} href={`/explore?q=${encodeURIComponent(query)}&tab=${tab.key}`} style={{ padding:'7px 16px', borderRadius:20, textDecoration:'none', fontSize:13, fontWeight:600, fontFamily:"'Syne', sans-serif", background:activeTab===tab.key?'#1A9E5F':'#0D0D12', color:activeTab===tab.key?'white':'#6A6A60', border:`1px solid ${activeTab===tab.key?'#1A9E5F':'#1E1E26'}` }}>
                  {tab.label}{tab.count>0&&<span style={{opacity:0.7}}> ({tab.count})</span>}
                </a>
              ))}
            </div>
          </div>

          {activeTab === 'people' && userResults.map((u:any) => {
            const initials = u.display_name?.slice(0,2).toUpperCase()||'SP'
            const color = AVATAR_COLORS[u.username.charCodeAt(0)%AVATAR_COLORS.length]
            return (
              <Link key={u.id} href={`/user/${u.username}`} style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:12, padding:'14px 20px', borderBottom:'1px solid #0F0F14' }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:color, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne', sans-serif", fontWeight:800, fontSize:15, color:'white' }}>{initials}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'#F0F0EC', fontFamily:"'Syne', sans-serif", display:'flex', alignItems:'center', gap:6 }}>
                    {u.display_name}
                    {u.verification_tier!=='none'&&<span style={{fontSize:10,background:'#1A9E5F',color:'white',padding:'1px 5px',borderRadius:4}}>✓</span>}
                  </div>
                  <div style={{ fontSize:13, color:'#44444A' }}>@{u.username} · {formatNumber(u.followers_count)} followers</div>
                  {u.bio&&<p style={{ fontSize:13, color:'#6A6A60', margin:'3px 0 0', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{u.bio}</p>}
                </div>
              </Link>
            )
          })}

          {activeTab === 'posts' && (
            postResults.length===0
              ? <div style={{ padding:'60px 20px', textAlign:'center' }}>
                  <p style={{ fontSize:28, marginBottom:12 }}>🔍</p>
                  <h3 style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:18, color:'#F0F0EC', marginBottom:8 }}>No posts found</h3>
                  <p style={{ fontSize:14, color:'#44444A' }}>Try different keywords</p>
                </div>
              : postResults.map((post:any) => <PostCard key={post.id} post={{...post,is_liked:false,is_bookmarked:false,is_reposted:false}} />)
          )}
        </>
      )}
    </div>
  )
}