// src/app/terms/page.tsx
import LegalLayout, { Section, P, UL, Highlight } from '@/components/landing/legal-layout'

export const metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The rules of the road for using Spup. Please read before you join."
      lastUpdated="April 23, 2026"
    >
      <Highlight>
        By using Spup — including signing up for the waitlist — you agree to these terms. They are governed by the laws of the Federal Republic of Nigeria.
      </Highlight>

      <Section title="1. Who Can Use Spup">
        <P>You must be at least 16 years old to use Spup. By creating an account, you confirm that:</P>
        <UL items={[
          'You are 16 years of age or older',
          'You have a valid Nigerian phone number for verification',
          'The information you provide during registration is accurate',
          'You are not barred from using social platforms under any applicable law',
        ]} />
      </Section>

      <Section title="2. Your Account">
        <P>You are responsible for all activity that occurs under your account. Keep your login credentials secure. If you suspect unauthorised access, notify us immediately at support@spup.ng.</P>
        <P>You may not create multiple accounts to circumvent suspensions or bans. Spup reserves the right to terminate accounts that violate these terms.</P>
      </Section>

      <Section title="3. Content You Post">
        <P>You retain ownership of all content you post on Spup. By posting, you grant Spup a non-exclusive, royalty-free licence to display, distribute, and promote your content on the platform and in marketing materials.</P>
        <P>You are solely responsible for ensuring your content does not infringe third-party rights, including copyright, trademarks, and privacy rights.</P>
      </Section>

      <Section title="4. Revenue Sharing & Earnings">
        <P>Eligible creators receive 70% of net advertising revenue attributed to their content. To qualify:</P>
        <UL items={[
          'You must reach 500 followers within 90 days of account creation',
          'Your account must be in good standing (no active violations)',
          'You must provide valid Nigerian bank account details for payouts',
          'Minimum payout threshold is ₦1,000',
        ]} />
        <P>Spup calculates revenue monthly. Payouts are processed within 15 business days of the month-end. Spup reserves the right to withhold earnings if fraud or policy violations are detected.</P>
      </Section>

      <Section title="5. Prohibited Conduct">
        <P>You may not use Spup to:</P>
        <UL items={[
          'Post content that violates our Content Policy',
          'Impersonate another person or organisation',
          'Manipulate engagement metrics (buying likes, followers, or reposts)',
          'Send unsolicited commercial messages (spam)',
          'Scrape, harvest, or automate interactions without written consent',
          'Interfere with or disrupt Spup\'s infrastructure or other users\' experience',
          'Engage in any illegal activity under Nigerian law',
        ]} />
      </Section>

      <Section title="6. Intellectual Property">
        <P>The Spup name, logo, and platform design are owned by Spup Technologies Limited. You may not use them without prior written permission. All other trademarks belong to their respective owners.</P>
      </Section>

      <Section title="7. Disclaimers & Limitation of Liability">
        <P>Spup is provided "as is". We do not guarantee uninterrupted service or that the platform will be error-free. To the maximum extent permitted by Nigerian law, Spup's total liability to you for any claim shall not exceed the amount you paid to Spup (if any) in the 12 months preceding the claim.</P>
      </Section>

      <Section title="8. Termination">
        <P>You may delete your account at any time. Spup may suspend or terminate your account immediately for violations of these terms. Upon termination, your access to the platform ceases, but content you posted may remain visible unless you delete it before termination.</P>
      </Section>

      <Section title="9. Governing Law">
        <P>These terms are governed by and construed in accordance with the laws of the Federal Republic of Nigeria. Any disputes shall be subject to the exclusive jurisdiction of Nigerian courts.</P>
      </Section>

      <Section title="10. Changes to These Terms">
        <P>We may update these terms. Continued use of Spup after changes take effect constitutes your acceptance. We will notify you of material changes at least 14 days in advance.</P>
        <P>Questions? Contact us at <strong style={{ color: '#EDEDEA' }}>legal@spup.ng</strong></P>
      </Section>
    </LegalLayout>
  )
}