// No 'use client' — this is a server component.
// No state, no hooks, no need for client bundle.

import Image from 'next/image'
import styles from './orbit-section.module.css'
import { formatCreatorCount } from '@/lib/utils/format-creator-count'

// To switch from waitlist → live user count after launch:
// <OrbitSection count={userCount} mode="users" />
type Props = {
  count: number
  mode?: 'waitlist' | 'users'
}

// Orbit positions — computed once at module level, never recalculated
const R_INNER = 150  // px radius, clockwise ring
const R_OUTER = 245  // px radius, anti-clockwise ring
const D45 = Math.round(R_OUTER * Math.sin(45 * Math.PI / 180))

const CW_AVATARS = [
  { w: 72, top: `calc(50% - ${R_INNER}px - 36px)`, left: 'calc(50% - 36px)',           src: '/images/orbit/user1.jpg' },
  { w: 66, top: 'calc(50% - 33px)',                 left: `calc(50% + ${R_INNER}px - 33px)`, src: '/images/orbit/user2.jpg' },
  { w: 70, top: `calc(50% + ${R_INNER}px - 35px)`, left: 'calc(50% - 35px)',           src: '/images/orbit/user3.jpg' },
  { w: 68, top: 'calc(50% - 34px)',                 left: `calc(50% - ${R_INNER}px - 34px)`, src: '/images/orbit/user4.jpg' },
]

const CCW_AVATARS = [
  { w: 90, top: `calc(50% - ${D45}px - 45px)`, left: `calc(50% + ${D45}px - 45px)`, src: '/images/orbit/user5.jpg' },
  { w: 84, top: `calc(50% + ${D45}px - 42px)`, left: `calc(50% + ${D45}px - 42px)`, src: '/images/orbit/user6.jpg' },
  { w: 88, top: `calc(50% + ${D45}px - 44px)`, left: `calc(50% - ${D45}px - 44px)`, src: '/images/orbit/user7.jpg' },
  { w: 82, top: `calc(50% - ${D45}px - 41px)`, left: `calc(50% - ${D45}px - 41px)`, src: '/images/orbit/user8.jpg' },
]

export default function OrbitSection({ count, mode = 'waitlist' }: Props) {
  const stats = [
    {
      value: formatCreatorCount(count),
      label: mode === 'waitlist' ? 'Creators on waitlist' : 'Creators on Spup',
    },
    { value: '36', label: 'States represented' },
  ]

  return (
    <section className={styles.section}>
      <div className={styles.wrap}>

        {/* ── Copy ── */}
        <div className={styles.copy}>
          <p style={{fontSize:12,color:'var(--color-brand)',fontWeight:600,letterSpacing:'0.1em',marginBottom:10}}>
            YOUR COMMUNITY
          </p>
          <h2 style={{
            fontFamily:"'Syne',sans-serif", fontWeight:800,
            fontSize:'clamp(34px,4vw,52px)',
            letterSpacing:'-0.03em', lineHeight:1.05,
            color:'var(--color-text-primary)', marginBottom:20,
          }}>
            Connect with<br/>
            <span style={{color:'var(--color-brand)'}}>your people</span>
          </h2>
          <p style={{fontSize:16,color:'var(--color-text-secondary)',lineHeight:1.8,maxWidth:360,marginBottom:36}}>
            Spup puts you at the centre of a growing network of Nigerian creators,
            fans, and communities. Real people. Real conversations. Right here.
          </p>

          <div className={styles.statsRow}>
            {stats.map(({ value, label }) => (
              <div key={label} className={styles.statCard}>
                <div className={styles.statValue}>{value}</div>
                <div className={styles.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Orbit stage ── */}
        <div className={styles.stage}>

          <div className={`${styles.ring}`}           style={{width:300,height:300}} />
          <div className={`${styles.ring} ${styles.ring2}`} style={{width:490,height:490}} />

          <div className={styles.beam} />

          {/* Center */}
          <div className={styles.center}>
            <Image
              src="/images/orbit/center.jpg"
              alt="You"
              fill
              sizes="200px"
              loading="lazy"
              style={{objectFit:'cover'}}
            />
          </div>

          {/* Clockwise ring */}
          <div className={styles.cw}>
            {CW_AVATARS.map((a, i) => (
              <div
                key={i}
                className={styles.avatar}
                style={{ width: a.w, height: a.w, top: a.top, left: a.left }}
              >
                <Image
                  src={a.src}
                  alt=""
                  fill
                  sizes={`${a.w}px`}
                  loading="lazy"
                  style={{objectFit:'cover'}}
                />
              </div>
            ))}
          </div>

          {/* Anti-clockwise ring */}
          <div className={styles.ccw}>
            {CCW_AVATARS.map((a, i) => (
              <div
                key={i}
                className={styles.avatar}
                style={{ width: a.w, height: a.w, top: a.top, left: a.left }}
              >
                <Image
                  src={a.src}
                  alt=""
                  fill
                  sizes={`${a.w}px`}
                  loading="lazy"
                  style={{objectFit:'cover'}}
                />
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  )
}