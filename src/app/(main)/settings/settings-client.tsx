// src/app/(main)/settings/settings-client.tsx
'use client'

import { useState, useTransition } from 'react'
import { signOutAction } from '@/lib/actions'
import { updateProfileAction, changeUsernameAction, deleteAccountAction } from '@/lib/actions/profiles'
import { ChevronRight, LogOut, Shield, Bell, Globe, CreditCard, AlertTriangle, X, Check, User, Edit3 } from 'lucide-react'

type Panel = null | 'edit-profile' | 'username' | 'language'
const LANGS = [{ code:'en',label:'English' },{ code:'pcm',label:'Pidgin' },{ code:'yo',label:'Yoruba' },{ code:'ig',label:'Igbo' },{ code:'ha',label:'Hausa' }]

export default function SettingsClient({ profile }: { profile: any }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [isPrivate, setIsPrivate] = useState(profile?.is_private||false)
  const [showDelete, setShowDelete] = useState(false)
  const [isPending, startT] = useTransition()
  const [msg, setMsg] = useState<{text:string;ok:boolean}|null>(null)
  const [displayName, setDisplayName] = useState(profile?.display_name||'')
  const [bio, setBio] = useState(profile?.bio||'')
  const [location, setLocation] = useState(profile?.location||'')
  const [website, setWebsite] = useState(profile?.website_url||'')
  const [lang, setLang] = useState(profile?.language_preference||'en')
  const [username, setUsername] = useState(profile?.username||'')

  function flash(text:string, ok=true) { setMsg({text,ok}); setTimeout(()=>setMsg(null),3000) }

  const inp = { width:'100%', background:'#131318', border:'1px solid #1E1E26', borderRadius:10, padding:'11px 14px', color:'#F0F0EC', fontSize:15, outline:'none', fontFamily:"'DM Sans', sans-serif" }

  return (
    <div style={{ paddingTop:8 }}>
      {msg && (
        <div style={{ margin:'12px 20px', padding:'12px 16px', borderRadius:10, background:msg.ok?'rgba(26,158,95,0.1)':'rgba(229,57,53,0.1)', border:`1px solid ${msg.ok?'rgba(26,158,95,0.2)':'rgba(229,57,53,0.2)'}`, display:'flex', alignItems:'center', gap:8, fontSize:14, color:msg.ok?'#1A9E5F':'#E57373' }}>
          {msg.ok?<Check size={15}/>:<X size={15}/>} {msg.text}
        </div>
      )}

      {/* Profile card */}
      <div style={{ margin:'12px 20px 20px', background:'#0D0D12', border:'1px solid #1E1E26', borderRadius:14, padding:16, display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#1A9E5F,#22B86E)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne', sans-serif", fontWeight:800, fontSize:18, color:'white' }}>
          {profile?.display_name?.slice(0,2).toUpperCase()||'SP'}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'#F0F0EC', fontFamily:"'Syne', sans-serif" }}>{profile?.display_name}</div>
          <div style={{ fontSize:14, color:'#44444A' }}>@{profile?.username}</div>
        </div>
        <button onClick={()=>setPanel(panel==='edit-profile'?null:'edit-profile')} style={{ background:'#1A1A20', border:'1px solid #2A2A30', borderRadius:8, padding:'7px 14px', cursor:'pointer', color:'#8A8A85', fontSize:13, fontFamily:"'Syne', sans-serif", fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
          <Edit3 size={13}/> Edit
        </button>
      </div>

      {/* Edit profile panel */}
      {panel==='edit-profile'&&(
        <div style={{ margin:'0 20px 20px', background:'#0D0D12', border:'1px solid #1E1E26', borderRadius:14, padding:20 }}>
          <h3 style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:15, color:'#F0F0EC', marginBottom:16 }}>Edit profile</h3>
          {[
            { label:'Display name', value:displayName, set:setDisplayName, max:50, type:'text', ph:'Your name' },
            { label:'Location', value:location, set:setLocation, max:60, type:'text', ph:'Lagos, Nigeria' },
            { label:'Website', value:website, set:setWebsite, max:100, type:'url', ph:'https://yoursite.com' },
          ].map(f=>(
            <div key={f.label} style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color:'#8A8A85', display:'block', marginBottom:6, fontWeight:500 }}>{f.label}</label>
              <input value={f.value} onChange={e=>f.set(e.target.value)} maxLength={f.max} type={f.type} placeholder={f.ph} style={inp as any} />
            </div>
          ))}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, color:'#8A8A85', display:'block', marginBottom:6, fontWeight:500 }}>Bio <span style={{color:'#44444A'}}>({160-bio.length} left)</span></label>
            <textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160} rows={3} style={{ ...inp, resize:'none' as any }} />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={()=>startT(async()=>{ const r=await updateProfileAction({display_name:displayName,bio,location,website_url:website}); r.error?flash(r.error,false):(flash('Profile updated'),setPanel(null)) })} disabled={isPending} style={{ flex:1, background:'#1A9E5F', color:'white', border:'none', borderRadius:10, padding:11, fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:14, cursor:'pointer', opacity:isPending?0.6:1 }}>
              {isPending?'Saving…':'Save changes'}
            </button>
            <button onClick={()=>setPanel(null)} style={{ padding:'11px 18px', background:'#1A1A20', border:'1px solid #2A2A30', borderRadius:10, color:'#8A8A85', cursor:'pointer', fontSize:14 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Username panel */}
      {panel==='username'&&(
        <div style={{ margin:'0 20px 20px', background:'#0D0D12', border:'1px solid #1E1E26', borderRadius:14, padding:20 }}>
          <h3 style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:15, color:'#F0F0EC', marginBottom:16 }}>Change username</h3>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, color:'#8A8A85', display:'block', marginBottom:6, fontWeight:500 }}>New username</label>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#44444A' }}>@</span>
              <input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} maxLength={20} style={{ ...inp, paddingLeft:28 } as any} />
            </div>
            <p style={{ fontSize:12, color:'#44444A', marginTop:6 }}>3–20 characters. Letters, numbers, underscores only.</p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={()=>startT(async()=>{ const r=await changeUsernameAction(username); r.error?flash(r.error,false):(flash('Username updated'),setPanel(null)) })} disabled={isPending||username.length<3} style={{ flex:1, background:'#1A9E5F', color:'white', border:'none', borderRadius:10, padding:11, fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:14, cursor:'pointer', opacity:(isPending||username.length<3)?0.5:1 }}>
              {isPending?'Checking…':'Change username'}
            </button>
            <button onClick={()=>setPanel(null)} style={{ padding:'11px 18px', background:'#1A1A20', border:'1px solid #2A2A30', borderRadius:10, color:'#8A8A85', cursor:'pointer', fontSize:14 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Language panel */}
      {panel==='language'&&(
        <div style={{ margin:'0 20px 20px', background:'#0D0D12', border:'1px solid #1E1E26', borderRadius:14, overflow:'hidden' }}>
          {LANGS.map((l,i)=>(
            <button key={l.code} onClick={()=>startT(async()=>{ setLang(l.code); await updateProfileAction({language_preference:l.code as any}); flash(`Language set to ${l.label}`); setPanel(null) })} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', padding:'14px 18px', background:'none', border:'none', borderBottom:i<LANGS.length-1?'1px solid #141418':'none', cursor:'pointer', color:lang===l.code?'#1A9E5F':'#F0F0EC', fontSize:15, fontFamily:"'DM Sans', sans-serif" }}>
              {l.label} {lang===l.code&&<Check size={16} color="#1A9E5F"/>}
            </button>
          ))}
        </div>
      )}

      <SL label="Account"/>
      <div style={{ border:'1px solid #1E1E26', borderLeft:'none', borderRight:'none' }}>
        <SR icon={User} label="Change username" desc={`@${profile?.username}`} onClick={()=>setPanel(panel==='username'?null:'username')}/>
        <SR icon={CreditCard} label="BVN verification" desc={profile?.bvn_verified?'Verified ✓':'Required for withdrawals'} onClick={()=>{}} color={profile?.bvn_verified?'#1A9E5F':undefined}/>
        <SR icon={Shield} label="Security & password" desc="Change password, 2FA" onClick={()=>{}}/>
      </div>

      <SL label="Preferences"/>
      <div style={{ border:'1px solid #1E1E26', borderLeft:'none', borderRight:'none' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #141418' }}>
          <div>
            <div style={{ fontSize:15, color:'#F0F0EC', fontWeight:500 }}>Private account</div>
            <div style={{ fontSize:13, color:'#44444A', marginTop:2 }}>Only approved followers see your posts</div>
          </div>
          <button onClick={()=>{ const n=!isPrivate; setIsPrivate(n); startT(async()=>{ const r=await updateProfileAction({is_private:n}); if(r.error){setIsPrivate(!n);flash(r.error,false)} }) }} style={{ width:46, height:26, borderRadius:13, background:isPrivate?'#1A9E5F':'#2A2A30', border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <span style={{ position:'absolute', top:3, left:isPrivate?23:3, width:20, height:20, borderRadius:'50%', background:'white', transition:'left 0.2s' }}/>
          </button>
        </div>
        <SR icon={Bell} label="Notifications" desc="Push, email, in-app" onClick={()=>{}}/>
        <SR icon={Globe} label="Language" desc={LANGS.find(l=>l.code===lang)?.label||'English'} onClick={()=>setPanel(panel==='language'?null:'language')}/>
      </div>

      <SL label="Session"/>
      <div style={{ border:'1px solid #1E1E26', borderLeft:'none', borderRight:'none' }}>
        <SR icon={LogOut} label={isPending?'Signing out…':'Sign out'} desc="Sign out of your Spup account" onClick={()=>startT(()=>signOutAction())} danger/>
      </div>

      <SL label="Danger zone"/>
      <div style={{ border:'1px solid #1E1E26', borderLeft:'none', borderRight:'none', marginBottom:60 }}>
        <SR icon={AlertTriangle} label="Delete account" desc="Permanently delete your account" onClick={()=>setShowDelete(true)} danger/>
      </div>

      {showDelete&&(
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#0D0D12', border:'1px solid #2A2A30', borderRadius:16, padding:28, maxWidth:380, width:'100%' }}>
            <div style={{ fontSize:24, marginBottom:12, textAlign:'center' }}>⚠️</div>
            <h3 style={{ fontFamily:"'Syne', sans-serif", fontWeight:800, fontSize:18, color:'#F0F0EC', textAlign:'center', marginBottom:12 }}>Delete account?</h3>
            <p style={{ fontSize:14, color:'#6A6A60', textAlign:'center', lineHeight:1.6, marginBottom:24 }}>This permanently deletes your posts, followers, and unwithdawn earnings. Cannot be undone.</p>
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={()=>setShowDelete(false)} style={{ flex:1, padding:12, background:'#1A1A20', border:'1px solid #2A2A30', borderRadius:10, color:'#F0F0EC', cursor:'pointer', fontFamily:"'Syne', sans-serif", fontWeight:600 }}>Cancel</button>
              <button onClick={()=>startT(async()=>{ await deleteAccountAction(); window.location.href='/' })} disabled={isPending} style={{ flex:1, padding:12, background:'#E53935', border:'none', borderRadius:10, color:'white', cursor:'pointer', fontFamily:"'Syne', sans-serif", fontWeight:700 }}>
                {isPending?'Deleting…':'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SL({ label }:{label:string}) {
  return <div style={{ padding:'16px 20px 8px', fontSize:11, fontWeight:700, color:'#44444A', letterSpacing:'0.08em', textTransform:'uppercase' as const }}>{label}</div>
}
function SR({ icon:Icon, label, desc, onClick, danger=false, color }:any) {
  return (
    <button onClick={onClick} style={{ display:'flex', alignItems:'center', gap:14, width:'100%', padding:'14px 20px', background:'none', border:'none', borderBottom:'1px solid #141418', cursor:'pointer', textAlign:'left', transition:'background 0.12s' }}>
      <div style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:danger?'rgba(229,57,53,0.1)':'#131318', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon size={17} color={danger?'#E53935':(color||'#8A8A85')}/>
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:15, color:danger?'#E53935':'#F0F0EC', fontWeight:500 }}>{label}</div>
        {desc&&<div style={{ fontSize:13, color:color||'#44444A', marginTop:2 }}>{desc}</div>}
      </div>
      <ChevronRight size={16} color="#2A2A30"/>
    </button>
  )
}