// src/app/privacy/page.tsx
import LegalLayout, { Section, P, UL, Highlight } from '@/components/landing/legal-layout'

export const metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your personal information on Spup."
      lastUpdated="April 23, 2026"
    >
      <Highlight>
        Your privacy matters. Spup is built for Nigerian creators and we handle your data with respect. We never sell your personal information to third parties.
      </Highlight>

      <Section title="1. Information We Collect">
        <P>When you join the Spup waitlist or create an account, we collect:</P>
        <UL items={[
          'Full name and email address (for waitlist registration)',
          'Nigerian phone number (used for account verification)',
          'Bank account details (for Naira payouts — stored securely via our payment partners)',
          'Content you post, including text, images, and audio',
          'Usage data: pages visited, features used, time spent on the platform',
          'Device and browser information for security and performance purposes',
        ]} />
      </Section>

      <Section title="2. How We Use Your Information">
        <P>We use your information to:</P>
        <UL items={[
          'Create and manage your Spup account',
          'Process ad revenue payouts to your bank account in Naira',
          'Send you platform notifications and product updates',
          'Improve the platform through analytics and feedback',
          'Detect fraud, abuse, and violations of our Content Policy',
          'Comply with Nigerian data protection regulations (NDPR)',
        ]} />
      </Section>

      <Section title="3. Data Sharing">
        <P>We do not sell your personal data. We share data only in these limited cases:</P>
        <UL items={[
          'Payment processors (to facilitate your Naira payouts)',
          'Cloud infrastructure providers who host the platform',
          'Law enforcement, when required by Nigerian law',
          'With your explicit consent, for any other purpose',
        ]} />
        <P>Advertisers see aggregated, anonymised audience data — never your personal identity.</P>
      </Section>

      <Section title="4. Data Storage & Security">
        <P>Your data is stored on secure servers. We use industry-standard encryption for data in transit (TLS) and at rest. Bank details are processed by PCI-compliant payment partners — we do not store raw bank credentials ourselves.</P>
        <P>Access to personal data within Spup is restricted to authorised personnel only, on a need-to-know basis.</P>
      </Section>

      <Section title="5. Your Rights (NDPR)">
        <P>Under the Nigeria Data Protection Regulation, you have the right to:</P>
        <UL items={[
          'Access the personal data we hold about you',
          'Request correction of inaccurate data',
          'Request deletion of your account and associated data',
          'Opt out of marketing communications at any time',
          'Lodge a complaint with the National Information Technology Development Agency (NITDA)',
        ]} />
      </Section>

      <Section title="6. Cookies">
        <P>We use essential cookies to keep you logged in and remember your preferences. We also use analytics cookies (anonymised) to understand how creators use the platform. You can disable non-essential cookies in your browser settings.</P>
      </Section>

      <Section title="7. Children">
        <P>Spup is not intended for users under 16 years of age. If we discover an account belongs to someone under 16, we will delete it promptly. If you believe a minor has registered, contact us at privacy@spup.ng.</P>
      </Section>

      <Section title="8. Changes to This Policy">
        <P>We may update this policy as Spup grows. We will notify you of significant changes via email or an in-app notice at least 7 days before they take effect.</P>
      </Section>

      <Section title="9. Contact">
        <P>For privacy-related questions or data requests, email us at <strong style={{ color: '#EDEDEA' }}>privacy@spup.ng</strong> or visit our <a href="/contact" style={{ color: '#1A9E5F', textDecoration: 'none' }}>Contact page</a>.</P>
      </Section>
    </LegalLayout>
  )
}