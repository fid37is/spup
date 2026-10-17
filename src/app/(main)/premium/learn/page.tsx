// src/app/(main)/premium/learn/page.tsx
//
// "How Spup Premium works" — the explainer behind every "Learn more" link.
// Ends with the Subscribe button so people can act once they've read it.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BackButton from '@/components/ui/back-button'
import SubscribeButton from '@/components/premium/subscribe-button'
import { getPremiumPriceKobo, getPremiumUntil } from '@/lib/premium'
import { BIG_TRANSACTION_THRESHOLD_KOBO } from '@/lib/constants'
import { formatNaira } from '@/lib/utils'

export const metadata = {
  title: 'How Spup Premium works — Spup',
  robots: { index: false, follow: false },
}

const H2: React.CSSProperties = {
  fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17,
  color: 'var(--color-text-primary)', margin: '28px 0 8px',
}
const P: React.CSSProperties = { fontSize: 14.5, lineHeight: 1.7, color: 'var(--color-text-secondary)', margin: '0 0 10px' }
const UL: React.CSSProperties = { ...P, paddingLeft: 20, margin: '0 0 10px' }

export default async function PremiumLearnPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) redirect('/login')

  const [priceKobo, until] = await Promise.all([getPremiumPriceKobo(), getPremiumUntil(profile.id)])
  const active = !!until && until.getTime() > Date.now()
  const price = formatNaira(priceKobo)

  return (
    <div style={{ paddingBottom: 48 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
      }}>
        <BackButton variant="bare" fallbackHref="/wallet" />
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--color-text-primary)', margin: 0 }}>
          How Spup Premium works
        </h1>
      </div>

      <article style={{ padding: '8px 20px 0', maxWidth: 600, margin: '0 auto' }}>
        <p style={{ ...P, marginTop: 20, fontSize: 15.5 }}>
          Spup Premium is a {price}-a-month subscription for creators. It does two things: it lets you
          verify your identity, and it lets you earn ad revenue from your posts.
        </p>

        <h2 style={H2}>Why verification needs Premium</h2>
        <p style={P}>
          Every identity check costs Spup real money, because we pay an identity provider to confirm each
          person is who they say they are. Premium covers that cost, which keeps Spup free of fake and
          duplicate accounts without charging everyone.
        </p>

        <h2 style={H2}>How it works, step by step</h2>
        <ol style={UL}>
          <li><strong>Subscribe.</strong> Pay {price} through Paystack. Premium starts immediately and lasts 30 days.</li>
          <li><strong>Verify your phone.</strong> We text a code to your Nigerian number.</li>
          <li><strong>Verify your NIN.</strong> Enter your 11-digit NIN and take a selfie. We match the selfie to the photo on your government record.</li>
          <li><strong>You&apos;re verified.</strong> You get the verified badge and can withdraw your earnings.</li>
        </ol>

        <h2 style={H2}>About verification</h2>
        <ul style={UL}>
          <li>Verification is <strong>permanent</strong>. It stays even if your Premium ends.</li>
          <li>You can verify any time while you&apos;re subscribed. There&apos;s no deadline.</li>
          <li>You get 3 tries per month for each ID type, in case of a typo or a blurry selfie.</li>
          <li>If our verification service is down, the try isn&apos;t counted against you.</li>
          <li>Your selfie is sent to our identity provider to be matched against your record. Spup does not store it.</li>
          <li>One NIN can only be linked to one Spup account.</li>
          <li>A BVN check is only asked for if you withdraw more than {formatNaira(BIG_TRANSACTION_THRESHOLD_KOBO)}.</li>
        </ul>

        <h2 style={H2}>Earning ad revenue</h2>
        <p style={P}>To turn on monetisation you need all four of these:</p>
        <ul style={UL}>
          <li>500 followers</li>
          <li>100 original posts (replies and reposts don&apos;t count)</li>
          <li>A 90-day-old account</li>
          <li>Active Spup Premium</li>
        </ul>
        <p style={P}>
          Once monetisation is on, you receive 70% of the ad revenue your posts generate. New earnings only
          build up while your Premium is active. If it ends, new earnings pause and start again when you renew.
        </p>

        <h2 style={H2}>Your earnings are always yours</h2>
        <p style={P}>
          Money you&apos;ve already earned stays in your wallet when Premium ends, and you can still withdraw it
          (minimum ₦1,000, to your own bank account). Withdrawing needs a verified NIN. It does not need an active subscription.
        </p>

        <h2 style={H2}>Payment and renewal</h2>
        <ul style={UL}>
          <li>One payment gives you 30 days of Premium.</li>
          <li>We never charge you automatically. You renew yourself when you&apos;re ready.</li>
          <li>Renewing early is fine: the new 30 days start after your current period ends, so you lose nothing.</li>
        </ul>

        <h2 style={H2}>Common questions</h2>
        <p style={P}><strong>What happens to my verification if Premium ends?</strong><br />Nothing. It&apos;s permanent.</p>
        <p style={P}><strong>Can I verify without Premium?</strong><br />No. Premium is needed to start verification.</p>
        <p style={P}><strong>Do I need Premium to withdraw?</strong><br />No. You need to be verified. Money you&apos;ve already earned can always be withdrawn.</p>
        <p style={P}><strong>I paid but nothing changed.</strong><br />Reopen the Premium page. It re-checks your payment and updates on its own within a minute.</p>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <SubscribeButton priceKobo={priceKobo} renew={active} />
        </div>
      </article>
    </div>
  )
}