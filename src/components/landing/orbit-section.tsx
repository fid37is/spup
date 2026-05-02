'use client'

export default function OrbitSection() {
  return (
    <section style={{
      position: 'relative',
      zIndex: 1,
      overflow: 'hidden',
      padding: '100px 0',
      background: 'radial-gradient(circle at 65% 50%, #0a2a4a 0%, #020b16 60%)',
    }}>
      <style suppressHydrationWarning>{`
        @keyframes rotate         { from{transform:rotate(0deg)}   to{transform:rotate(360deg)}  }
        @keyframes rotate-reverse { from{transform:rotate(360deg)} to{transform:rotate(0deg)}    }
        @keyframes pulse-ring {
          0%,100% { opacity:.25; transform:translate(-50%,-50%) scale(1);    }
          50%     { opacity:.6;  transform:translate(-50%,-50%) scale(1.04); }
        }
        @keyframes counter-cw { from{transform:rotate(360deg)} to{transform:rotate(0deg)} }
        @keyframes counter-rv { from{transform:rotate(0deg)}   to{transform:rotate(360deg)} }

        .orb-wrap {
          max-width:1200px; margin:0 auto;
          padding:0 40px;
          display:flex; align-items:center; gap:40px;
        }
        .orb-copy { flex:0 0 380px; }

        /* The full orbit stage — large, like the reference */
        .orb-stage {
          position:relative;
          width:580px; height:580px;
          flex-shrink:0;
        }

        /* Dashed rings */
        .orb-ring {
          position:absolute; border-radius:50%;
          border:1.5px dashed rgba(255,255,255,.18);
          top:50%; left:50%;
          transform:translate(-50%,-50%);
          animation:pulse-ring 2.5s ease-in-out infinite;
          pointer-events:none;
        }
        .orb-ring-2 { animation-delay:.8s; border-color:rgba(255,255,255,.1); }

        /* Beam — thick filled wedge arc like the reference, between the two rings */
        .orb-beam {
          position:absolute;
          width:100%; height:100%;
          border-radius:50%;
          clip-path:polygon(50% 50%, 100% 0%, 100% 100%);
          background:rgba(30,80,200,.22);
          animation:rotate-reverse 10s linear infinite;
        }

        /* Center image — large */
        .orb-center {
          position:absolute;
          width:200px; height:200px;
          border-radius:50%;
          top:50%; left:50%;
          transform:translate(-50%,-50%);
          overflow:hidden;
          z-index:5;
          border:4px solid rgba(26,200,120,.6);
          box-shadow:0 0 0 10px rgba(26,120,74,.12), 0 0 60px rgba(10,42,74,.8);
        }
        .orb-center img { width:100%;height:100%;object-fit:cover;display:block; }

        /* Orbit wrappers */
        .orb-cw  { position:absolute;inset:0; animation:rotate         12s linear infinite; }
        .orb-ccw { position:absolute;inset:0; animation:rotate-reverse 18s linear infinite; }

        /* Avatar bubbles */
        .orb-avatar {
          position:absolute;
          border-radius:50%;
          overflow:hidden;
          border:3px solid rgba(255,255,255,.22);
          box-shadow:0 6px 28px rgba(0,0,0,.7);
        }
        .orb-avatar img { width:100%;height:100%;object-fit:cover;display:block; }

        /* Each avatar counter-rotates so faces stay upright */
        .orb-cw  .orb-avatar { animation:counter-cw 12s linear infinite; }
        .orb-ccw .orb-avatar { animation:counter-rv 18s linear infinite; }

        @media(max-width:1100px){
          .orb-wrap { flex-direction:column; padding:0 20px; }
          .orb-copy { flex:none; width:100%; text-align:center; }
          .orb-stage { width:420px; height:420px; }
          .orb-center { width:150px!important; height:150px!important; }
        }
        @media(max-width:600px){
          .orb-stage { width:320px; height:320px; }
          .orb-center { width:110px!important; height:110px!important; }
        }
      `}</style>

      <div className="orb-wrap">

        {/* ── Copy ── */}
        <div className="orb-copy">
          <p style={{fontSize:12,color:'var(--color-brand)',fontWeight:600,letterSpacing:'0.1em',marginBottom:10}}>
            YOUR COMMUNITY
          </p>
          <h2 style={{
            fontFamily:"'Syne',sans-serif",fontWeight:800,
            fontSize:'clamp(34px,4vw,52px)',
            letterSpacing:'-0.03em',lineHeight:1.05,
            color:'var(--color-text-primary)',marginBottom:20,
          }}>
            Connect with<br/>
            <span style={{color:'var(--color-brand)'}}>your people</span>
          </h2>
          <p style={{fontSize:16,color:'var(--color-text-secondary)',lineHeight:1.8,maxWidth:360,marginBottom:36}}>
            Spup puts you at the centre of a growing network of Nigerian creators,
            fans, and communities. Real people. Real conversations. Right here.
          </p>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {[{value:'500+',label:'Creators on waitlist'},{value:'36',label:'States represented'}].map(({value,label})=>(
              <div key={label} style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:14,padding:'12px 20px'}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:'var(--color-brand)',letterSpacing:'-0.03em'}}>{value}</div>
                <div style={{fontSize:12,color:'var(--color-text-secondary)',marginTop:3}}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Orbit stage ── */}
        <div className="orb-stage">

          {/* Dashed rings at inner and outer radii */}
          <div className="orb-ring"   style={{width:300,height:300}} />
          <div className="orb-ring orb-ring-2" style={{width:490,height:490}} />

          {/* Sweep beam */}
          <div className="orb-beam" />

          {/* Center — Black Nigerian woman selfie */}
          <div className="orb-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=400&fit=crop&crop=face&q=85" alt="You" />
          </div>
https://unsplash.com/photos/a-woman-with-curly-hair-smiling-for-the-camera-RPcX5545QfI
          {/* ── CLOCKWISE ring — inner, 4 avatars at 0/90/180/270 ── */}
          <div className="orb-cw">
            {/* top — 0deg, radius 150px from center */}
            <div className="orb-avatar" style={{width:72,height:72,top:'calc(50% - 150px - 36px)',left:'calc(50% - 36px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1522529599102-193144843bad?w=144&h=144&fit=crop&crop=face&q=80" alt="" />
            </div>
            {/* right — 90deg */}
            <div className="orb-avatar" style={{width:66,height:66,top:'calc(50% - 33px)',left:'calc(50% + 150px - 33px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=132&h=132&fit=crop&crop=face&q=80" alt="" />
            </div>
            {/* bottom — 180deg */}
            <div className="orb-avatar" style={{width:70,height:70,top:'calc(50% + 150px - 35px)',left:'calc(50% - 35px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=140&h=140&fit=crop&crop=face&q=80" alt="" />
            </div>
            {/* left — 270deg */}
            <div className="orb-avatar" style={{width:68,height:68,top:'calc(50% - 34px)',left:'calc(50% - 150px - 34px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=136&h=136&fit=crop&crop=face&q=80" alt="" />
            </div>
          </div>

          {/* ── ANTI-CLOCKWISE ring — outer, 4 avatars at 45/135/225/315 ── */}
          <div className="orb-ccw">
            {/* top-right 45deg, radius 245px */}
            <div className="orb-avatar" style={{
              width:90,height:90,
              top: `calc(50% - ${Math.round(245*Math.sin(45*Math.PI/180))}px - 45px)`,
              left:`calc(50% + ${Math.round(245*Math.cos(45*Math.PI/180))}px - 45px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=180&h=180&fit=crop&crop=face&q=80" alt="" />
            </div>
            {/* bottom-right 135deg */}
            <div className="orb-avatar" style={{
              width:84,height:84,
              top: `calc(50% + ${Math.round(245*Math.sin(45*Math.PI/180))}px - 42px)`,
              left:`calc(50% + ${Math.round(245*Math.cos(45*Math.PI/180))}px - 42px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=168&h=168&fit=crop&crop=face&q=80" alt="" />
            </div>
            {/* bottom-left 225deg */}
            <div className="orb-avatar" style={{
              width:88,height:88,
              top: `calc(50% + ${Math.round(245*Math.sin(45*Math.PI/180))}px - 44px)`,
              left:`calc(50% - ${Math.round(245*Math.cos(45*Math.PI/180))}px - 44px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=176&h=176&fit=crop&crop=face&q=80" alt="" />
            </div>
            {/* top-left 315deg */}
            <div className="orb-avatar" style={{
              width:82,height:82,
              top: `calc(50% - ${Math.round(245*Math.sin(45*Math.PI/180))}px - 41px)`,
              left:`calc(50% - ${Math.round(245*Math.cos(45*Math.PI/180))}px - 41px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1589156280159-27698a70f29e?w=164&h=164&fit=crop&crop=face&q=80" alt="" />
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}