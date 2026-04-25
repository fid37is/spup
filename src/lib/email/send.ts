// src/lib/email/send.ts
// Server-only — never import this from client components.
// Uses Resend (https://resend.com) to send transactional emails.

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL     = process.env.EMAIL_FROM || 'Spup <noreply@spup.ng>'
const APP_URL        = process.env.NEXT_PUBLIC_APP_URL || 'https://spup.ng'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailType =
  | 'new_follower'
  | 'post_comment'
  | 'mention'
  | 'tip_received'
  | 'earning_milestone'
  | 'weekly_digest'
  | 'product_update'

interface SendEmailOptions {
  to: string
  type: EmailType
  data: Record<string, unknown>
}

// ─── Core send function ───────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    })

    const data = await res.json()
    if (!res.ok) return { error: data.message || 'Email send failed' }
    return { id: data.id }
  } catch (err) {
    console.error('Email send error:', err)
    return { error: 'Network error sending email' }
  }
}

// ─── Shared layout wrapper ────────────────────────────────────────────────────

function wrap(content: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #050508; font-family: 'Arial', sans-serif; color: #F0F0EC; }
    .wrap { max-width: 560px; margin: 40px auto; background: #0D0D12; border: 1px solid #1E1E26; border-radius: 16px; overflow: hidden; }
    .header { background: #0A0A0F; padding: 24px 32px; border-bottom: 1px solid #1E1E26; }
    .logo { font-size: 24px; font-weight: 800; color: #1A9E5F; letter-spacing: -0.02em; }
    .body { padding: 32px; }
    .footer { padding: 20px 32px; border-top: 1px solid #1E1E26; font-size: 12px; color: #44444A; text-align: center; line-height: 1.6; }
    h1 { font-size: 22px; font-weight: 800; color: #F0F0EC; margin-bottom: 12px; letter-spacing: -0.01em; }
    p { font-size: 15px; color: #9A9A90; line-height: 1.7; margin-bottom: 16px; }
    .btn { display: inline-block; background: #1A9E5F; color: white !important; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; margin: 8px 0 20px; }
    .pill { display: inline-block; background: rgba(26,158,95,0.1); border: 1px solid rgba(26,158,95,0.2); border-radius: 8px; padding: 10px 16px; font-size: 14px; color: #1A9E5F; margin-bottom: 20px; }
    .amount { font-size: 36px; font-weight: 800; color: #F0F0EC; letter-spacing: -0.02em; }
    .muted { font-size: 13px; color: #44444A; }
    a { color: #1A9E5F; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header"><span class="logo">Spup</span></div>
    <div class="body">${content}</div>
    <div class="footer">
      You&apos;re receiving this because you have email notifications enabled.<br />
      <a href="${APP_URL}/settings/notifications">Manage notification preferences</a> &nbsp;·&nbsp;
      <a href="${APP_URL}/settings">Account settings</a>
    </div>
  </div>
</body>
</html>`
}

// ─── Email templates ──────────────────────────────────────────────────────────

function newFollowerEmail(d: { followerName: string; followerUsername: string; followerCount: number }) {
  return {
    subject: `${d.followerName} is now following you on Spup`,
    html: wrap(`
      <h1>You have a new follower 🎉</h1>
      <p><strong style="color:#F0F0EC">${d.followerName}</strong> (@${d.followerUsername}) just followed you.</p>
      <p>You now have <strong style="color:#1A9E5F">${d.followerCount.toLocaleString()} followers</strong>.</p>
      <a href="${APP_URL}/user/${d.followerUsername}" class="btn">View their profile</a>
      <p class="muted">Keep posting — the more you share, the more you grow.</p>
    `),
  }
}

function postCommentEmail(d: { commenterName: string; commenterUsername: string; postPreview: string; postId: string }) {
  const preview = d.postPreview.length > 80 ? d.postPreview.slice(0, 80) + '…' : d.postPreview
  return {
    subject: `${d.commenterName} replied to your post`,
    html: wrap(`
      <h1>Someone replied to your post</h1>
      <div class="pill">&ldquo;${preview}&rdquo;</div>
      <p><strong style="color:#F0F0EC">${d.commenterName}</strong> (@${d.commenterUsername}) left a reply on your post.</p>
      <a href="${APP_URL}/post/${d.postId}" class="btn">See the reply</a>
    `),
  }
}

function mentionEmail(d: { mentionerName: string; mentionerUsername: string; postPreview: string; postId: string }) {
  const preview = d.postPreview.length > 80 ? d.postPreview.slice(0, 80) + '…' : d.postPreview
  return {
    subject: `${d.mentionerName} mentioned you on Spup`,
    html: wrap(`
      <h1>You were mentioned 📣</h1>
      <p><strong style="color:#F0F0EC">${d.mentionerName}</strong> (@${d.mentionerUsername}) mentioned you in a post:</p>
      <div class="pill">&ldquo;${preview}&rdquo;</div>
      <a href="${APP_URL}/post/${d.postId}" class="btn">View post</a>
    `),
  }
}

function tipReceivedEmail(d: { tipper: string; amountNaira: string; balance: string }) {
  return {
    subject: `You received a ₦${d.amountNaira} tip on Spup! 🎉`,
    html: wrap(`
      <h1>You got a tip!</h1>
      <p><strong style="color:#F0F0EC">${d.tipper}</strong> just sent you:</p>
      <p class="amount">₦${d.amountNaira}</p>
      <p style="margin-top:8px">Your wallet balance is now <strong style="color:#1A9E5F">₦${d.balance}</strong>.</p>
      <a href="${APP_URL}/wallet" class="btn">View wallet</a>
      <p class="muted">Keep creating great content — your audience loves it.</p>
    `),
  }
}

function earningMilestoneEmail(d: { amountNaira: string; milestone: string }) {
  return {
    subject: `Milestone reached: ₦${d.amountNaira} earned on Spup! 🏆`,
    html: wrap(`
      <h1>You hit a milestone! 🏆</h1>
      <p>You&apos;ve now earned a total of:</p>
      <p class="amount">₦${d.amountNaira}</p>
      <p style="margin-top:8px; color:#D4A017; font-weight:700">${d.milestone}</p>
      <a href="${APP_URL}/wallet" class="btn">View earnings breakdown</a>
      <p class="muted">70% of ad revenue — straight to your wallet. Keep it up.</p>
    `),
  }
}

function weeklyDigestEmail(d: {
  displayName: string
  weekEarningsNaira: string
  totalEarningsNaira: string
  newFollowers: number
  postCount: number
  topPostPreview?: string
}) {
  return {
    subject: `Your Spup weekly summary — ₦${d.weekEarningsNaira} earned`,
    html: wrap(`
      <h1>Your week on Spup</h1>
      <p>Here&apos;s how you did this week, ${d.displayName}:</p>

      <table style="width:100%; border-collapse:collapse; margin-bottom:24px">
        ${[
          ['💰 Earnings this week', `₦${d.weekEarningsNaira}`],
          ['📈 Total earned', `₦${d.totalEarningsNaira}`],
          ['👥 New followers', `+${d.newFollowers}`],
          ['✍️ Posts this week', String(d.postCount)],
        ].map(([label, value]) => `
          <tr style="border-bottom:1px solid #1E1E26">
            <td style="padding:12px 0; font-size:14px; color:#8A8A85">${label}</td>
            <td style="padding:12px 0; font-size:16px; font-weight:700; color:#F0F0EC; text-align:right">${value}</td>
          </tr>
        `).join('')}
      </table>

      ${d.topPostPreview ? `
        <p style="font-size:13px; color:#44444A; margin-bottom:6px">TOP POST THIS WEEK</p>
        <div class="pill">&ldquo;${d.topPostPreview.slice(0, 100)}${d.topPostPreview.length > 100 ? '…' : ''}&rdquo;</div>
      ` : ''}

      <a href="${APP_URL}/wallet" class="btn">View full earnings</a>
      <a href="${APP_URL}/feed" style="display:inline-block; margin-left:12px; font-size:14px; color:#1A9E5F">Go to feed →</a>
    `),
  }
}

// ─── Public dispatch function ─────────────────────────────────────────────────

export async function sendNotificationEmail(opts: SendEmailOptions): Promise<{ id?: string; error?: string }> {
  const { to, type, data } = opts

  let template: { subject: string; html: string }

  switch (type) {
    case 'new_follower':
      template = newFollowerEmail(data as Parameters<typeof newFollowerEmail>[0])
      break
    case 'post_comment':
      template = postCommentEmail(data as Parameters<typeof postCommentEmail>[0])
      break
    case 'mention':
      template = mentionEmail(data as Parameters<typeof mentionEmail>[0])
      break
    case 'tip_received':
      template = tipReceivedEmail(data as Parameters<typeof tipReceivedEmail>[0])
      break
    case 'earning_milestone':
      template = earningMilestoneEmail(data as Parameters<typeof earningMilestoneEmail>[0])
      break
    case 'weekly_digest':
      template = weeklyDigestEmail(data as Parameters<typeof weeklyDigestEmail>[0])
      break
    default:
      return { error: `Unknown email type: ${type}` }
  }

  return sendEmail(to, template.subject, template.html)
}