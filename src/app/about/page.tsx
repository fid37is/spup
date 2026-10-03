// src/app/about/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import LegalLayout, { Section, P, UL, Highlight } from '@/components/landing/legal-layout'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://spup.live'

export const metadata: Metadata = {
  title: 'About Spup',
  description:
    "Spup is a Nigerian social platform where people post in English, Pidgin, Yoruba, Igbo and Hausa, buy and sell with escrow protection, and creators earn from in-app ads.",
  alternates: { canonical: `${BASE_URL}/about` },
  robots: { index: true, follow: true },
}

export default function AboutPage() {
  return (
    <LegalLayout
      title="About Spup"
      subtitle="A social platform built for Nigerian conversations, with a fairer deal for the people who start them."
      lastUpdated="October 2026"
    >
      <Section title="What Spup is">
        <P>
          Spup is a social platform made in Nigeria. People post thoughts, photos and videos, follow
          each other, reply, and join conversations in English, Pidgin, Yoruba, Igbo and Hausa. Anyone
          can read public posts without an account on our <Link href="/discover" style={{ color: 'var(--color-brand)' }}>Discover</Link> page;
          an account lets you post, reply, follow and message.
        </P>
        <P>
          We built Spup because most of the platforms Nigerians spend their time on are built
          somewhere else, for someone else. Spup puts local language, local trends and Naira payments first.
        </P>
      </Section>

      <Section title="How creators earn">
        <P>
          Spup sells advertising to brands, including promoted posts. Eligible creators receive 70% of
          the revenue from Spup&apos;s in-app ads, paid in Naira to their bank account. Creators become eligible
          by reaching 500 followers within 90 days, and the minimum payout is ₦1,000.
        </P>
        <P>
          The full rules are in our <Link href="/terms" style={{ color: 'var(--color-brand)' }}>Terms</Link>.
          Content that breaks our <Link href="/content-policy" style={{ color: 'var(--color-brand)' }}>Content Policy</Link> is
          not eligible for earnings.
        </P>
      </Section>

      <Section title="Buying and selling safely">
        <P>
          Anyone can mark a post as an item or service for sale. Buyer and seller agree the details in
          private messages, and the buyer pays through Spup. The money is held in escrow, and it is only
          released to the seller when the buyer confirms delivery. If the two sides disagree, they can
          sort it out in chat first, and Spup steps in to settle it if they can&apos;t.
        </P>
      </Section>

      <Section title="Keeping Spup safe">
        <P>We take moderation seriously, because a platform is only worth using if people feel safe on it.</P>
        <UL items={[
          'Every post has a report button, and our moderation team reviews reports, acting within 24 hours on severe violations.',
          'Posts are checked against rules for scams, spam, threats, hate and sexual content, and flagged posts are reviewed before action is taken.',
          'Posts that break our Content Policy can be removed, and repeat offenders can be suspended or banned.',
          'Members can verify their identity, and verified accounts carry a badge.',
        ]} />
        <P>
          Read the full <Link href="/content-policy" style={{ color: 'var(--color-brand)' }}>Content Policy</Link> and
          our <Link href="/privacy" style={{ color: 'var(--color-brand)' }}>Privacy Policy</Link> to see exactly how we handle content and data.
        </P>
      </Section>

      <Section title="The company">
        <P>Spup is operated by WLA Entertainment Limited, Nigeria.</P>
        <Highlight>
          Questions, press enquiries or problems? Visit our <Link href="/contact" style={{ color: 'var(--color-brand)' }}>Contact page</Link>.
        </Highlight>
      </Section>
    </LegalLayout>
  )
}
