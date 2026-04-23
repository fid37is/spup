// src/app/content-policy/page.tsx
import LegalLayout, { Section, P, UL, Highlight } from '@/components/landing/legal-layout'

export const metadata = { title: 'Content Policy' }

export default function ContentPolicyPage() {
  return (
    <LegalLayout
      title="Content Policy"
      subtitle="What you can post, what you can't, and how we keep Spup a great place for Nigerian voices."
      lastUpdated="April 23, 2026"
    >
      <Highlight>
        Spup was built so Nigerians can speak freely and get paid for it. That freedom comes with responsibility. These rules exist to protect everyone on the platform — including you.
      </Highlight>

      <Section title="1. What Spup Stands For">
        <P>Spup is a space for authentic Nigerian expression — in Pidgin, Yoruba, Igbo, Hausa, English, or any language spoken in this country. We celebrate bold opinions, sharp humour, breaking news, local sports, music, culture, and everyday life.</P>
        <P>We do not police viewpoints or political opinions. We do protect people from genuine harm.</P>
      </Section>

      <Section title="2. Strictly Prohibited Content">
        <P>The following will result in immediate content removal and may lead to account suspension or permanent ban:</P>
        <UL items={[
          'Child sexual abuse material (CSAM) — zero tolerance, reported to authorities',
          'Credible threats of violence against specific individuals or groups',
          'Content that incites ethnic or religious violence',
          'Non-consensual intimate images (revenge porn)',
          'Doxxing — sharing someone\'s private personal information without consent',
          'Coordinated inauthentic behaviour (fake accounts, bot networks)',
          'Terrorist recruitment or propaganda',
          'Financial scams, phishing, or advance-fee fraud (419)',
        ]} />
      </Section>

      <Section title="3. Sensitive Content">
        <P>The following content is allowed but must be clearly labelled and may be restricted from monetisation:</P>
        <UL items={[
          'Graphic news imagery — must include a content warning',
          'Adult content — only permitted on accounts with age verification enabled',
          'Satirical content about public figures — must be clearly presented as satire',
          'Discussion of substance use — educational context only; no promotion',
        ]} />
      </Section>

      <Section title="4. Misinformation">
        <P>We do not remove content simply because it is unpopular or controversial. However, we act on:</P>
        <UL items={[
          'Demonstrably false claims that could cause physical harm (e.g., dangerous medical misinformation)',
          'Election misinformation that suppresses voting',
          'Fabricated quotes attributed to real public figures',
          'Synthetic media (deepfakes) designed to deceive without disclosure',
        ]} />
        <P>We may add context labels to disputed claims rather than removing them outright.</P>
      </Section>

      <Section title="5. Harassment & Hate Speech">
        <P>You may criticise ideas, institutions, and public figures robustly. You may not:</P>
        <UL items={[
          'Target private individuals with coordinated harassment campaigns',
          'Use slurs to attack people based on ethnicity, religion, gender, disability, or sexual orientation',
          'Post content designed solely to degrade or dehumanise a group of people',
          'Repeatedly contact someone who has blocked you through other means',
        ]} />
      </Section>

      <Section title="6. Intellectual Property">
        <P>Only post content you own or have rights to. Repeated copyright infringement will result in account termination under our repeat infringer policy. To report a copyright violation, email <strong style={{ color: '#EDEDEA' }}>copyright@spup.ng</strong>.</P>
      </Section>

      <Section title="7. Monetisation Eligibility">
        <P>Content that violates this policy is ineligible for ad revenue sharing. Creators who repeatedly post policy-violating content may have their monetisation suspended even if individual posts are not removed.</P>
        <P>We do not run ads adjacent to graphic violence, adult content, or politically sensitive content regardless of creator eligibility.</P>
      </Section>

      <Section title="8. Reporting & Enforcement">
        <P>Every post on Spup has a report button. Our moderation team reviews reports and takes action within 24 hours for severe violations and within 72 hours for standard reviews.</P>
        <P>If your content is removed, you will be notified with a reason. You may appeal removals by emailing <strong style={{ color: '#EDEDEA' }}>appeals@spup.ng</strong> within 14 days.</P>
        <UL items={[
          '1st violation: Content removed + warning',
          '2nd violation: Temporary suspension (7 days)',
          '3rd violation: Permanent ban',
          'Severe violations (CSAM, threats): Immediate permanent ban + report to authorities',
        ]} />
      </Section>

      <Section title="9. Updates">
        <P>This policy will evolve as the platform grows. We will communicate significant changes to creators at least 7 days before they take effect. Questions? Contact our Trust & Safety team at <strong style={{ color: '#EDEDEA' }}>safety@spup.ng</strong>.</P>
      </Section>
    </LegalLayout>
  )
}