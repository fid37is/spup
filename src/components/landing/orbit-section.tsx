'use client'

export default function OrbitSection() {
  return (
    <section style={{
      position: 'relative',
      zIndex: 1,
      // FIX 1: use site CSS variables instead of hardcoded dark-blue gradient
      background: 'var(--color-background, #020b16)',
      padding: '100px 0',
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

        .orb-stage {
          position:relative;
          width:580px; height:580px;
          flex-shrink:0;
          /* FIX 2: contain layout so the stage never causes page reflow/scroll jump */
          contain: layout style;
        }

        .orb-ring {
          position:absolute; border-radius:50%;
          border:1.5px dashed rgba(255,255,255,.18);
          top:50%; left:50%;
          transform:translate(-50%,-50%);
          animation:pulse-ring 2.5s ease-in-out infinite;
          pointer-events:none;
          /* FIX 3: GPU-promote every animated element */
          will-change: transform, opacity;
        }
        .orb-ring-2 { animation-delay:.8s; border-color:rgba(255,255,255,.1); }

        /* FIX 4: replace clip-path beam (expensive) with a conic-gradient on a
           rotating div — same visual, zero per-frame rasterisation cost */
        .orb-beam {
          position:absolute;
          width:100%; height:100%;
          border-radius:50%;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(30,80,200,.18) 40deg,
            transparent 80deg
          );
          animation:rotate-reverse 10s linear infinite;
          will-change: transform;
        }

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
          /* keep center static — no will-change needed */
        }
        .orb-center img { width:100%;height:100%;object-fit:cover;display:block; }

        /* FIX 5: GPU-promote the ring wrappers so child repaints stay on compositor */
        .orb-cw  {
          position:absolute; inset:0;
          animation:rotate 12s linear infinite;
          will-change: transform;
        }
        .orb-ccw {
          position:absolute; inset:0;
          animation:rotate-reverse 18s linear infinite;
          will-change: transform;
        }

        .orb-avatar {
          position:absolute;
          border-radius:50%;
          overflow:hidden;
          border:3px solid rgba(255,255,255,.22);
          box-shadow:0 6px 28px rgba(0,0,0,.7);
          will-change: transform;
        }
        .orb-avatar img { width:100%;height:100%;object-fit:cover;display:block; }

        .orb-cw  .orb-avatar { animation:counter-cw 12s linear infinite; }
        .orb-ccw .orb-avatar { animation:counter-rv 18s linear infinite; }

        /* FIX 6: remove overflow:hidden from section — it was the scroll-trap.
           Instead clip only the stage itself so avatars don't bleed into copy. */
        .orb-stage-clip {
          border-radius:50%;
          /* soft radial fade at edges instead of hard clip */
          -webkit-mask-image: radial-gradient(ellipse 90% 90% at 50% 50%, black 60%, transparent 100%);
          mask-image:         radial-gradient(ellipse 90% 90% at 50% 50%, black 60%, transparent 100%);
        }

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
        <div className="orb-stage orb-stage-clip">

          {/* Dashed rings */}
          <div className="orb-ring"   style={{width:300,height:300}} />
          <div className="orb-ring orb-ring-2" style={{width:490,height:490}} />

          {/* Sweep beam */}
          <div className="orb-beam" />

          {/* Center */}
          <div className="orb-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://unsplash.com/photos/F16KPYxfm6s/download?force=true" alt="You" />
          </div>

          {/* ── CLOCKWISE ring — inner ── */}
          <div className="orb-cw">
            <div className="orb-avatar" style={{width:72,height:72,top:'calc(50% - 150px - 36px)',left:'calc(50% - 36px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/x_cdCJ3bAJg/download?force=true" alt="" />
            </div>
            <div className="orb-avatar" style={{width:66,height:66,top:'calc(50% - 33px)',left:'calc(50% + 150px - 33px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/e6k8RrfbJ2A/download?force=true" alt="" />
            </div>
            <div className="orb-avatar" style={{width:70,height:70,top:'calc(50% + 150px - 35px)',left:'calc(50% - 35px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/hCjA-Vt4XD8/download?force=true" alt="" />
            </div>
            <div className="orb-avatar" style={{width:68,height:68,top:'calc(50% - 34px)',left:'calc(50% - 150px - 34px)'}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/vH8imwT4RX0/download?force=true" alt="" />
            </div>
          </div>

          {/* ── ANTI-CLOCKWISE ring — outer ── */}
          <div className="orb-ccw">
            <div className="orb-avatar" style={{
              width:90,height:90,
              top: `calc(50% - ${Math.round(245*Math.sin(45*Math.PI/180))}px - 45px)`,
              left:`calc(50% + ${Math.round(245*Math.cos(45*Math.PI/180))}px - 45px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/R0ipcguzRIU/download?force=true" alt="" />
            </div>
            <div className="orb-avatar" style={{
              width:84,height:84,
              top: `calc(50% + ${Math.round(245*Math.sin(45*Math.PI/180))}px - 42px)`,
              left:`calc(50% + ${Math.round(245*Math.cos(45*Math.PI/180))}px - 42px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/i2hoD-C2RUA/download?force=true" alt="" />
            </div>
            <div className="orb-avatar" style={{
              width:88,height:88,
              top: `calc(50% + ${Math.round(245*Math.sin(45*Math.PI/180))}px - 44px)`,
              left:`calc(50% - ${Math.round(245*Math.cos(45*Math.PI/180))}px - 44px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/jOFFw4WEoTU/download?force=true" alt="" />
            </div>
            <div className="orb-avatar" style={{
              width:82,height:82,
              top: `calc(50% - ${Math.round(245*Math.sin(45*Math.PI/180))}px - 41px)`,
              left:`calc(50% - ${Math.round(245*Math.cos(45*Math.PI/180))}px - 41px)`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://unsplash.com/photos/cIoGMY1DrRI/download?force=true" alt="" />
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}