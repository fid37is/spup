// src/lib/link-safety/config.ts
//
// Everything you may want to tune about link safety lives here: which domains skip the
// "you're leaving Spup" page, which short-link services get expanded, the Nigerian
// fintech / regulator names we protect, and the scam wording we look for next to them.
// Plain data, no imports - safe to use on the server and in the browser.

/** Read a comma separated list from an env var (server only - the browser never sees these). */
function envList(name: string): string[] {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return (raw ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

// Spup's own addresses (APP_HOST, OWN_HOSTS) live in short-link.ts so the browser can use them
// without downloading this whole file.
export { APP_HOST, OWN_HOSTS } from './short-link'

// ─── Shortener expansion (Layer 1) ────────────────────────────────────────────

/** Link-shortening services: followed on the server so we judge where they really go. */
export const SHORTENER_DOMAINS = new Set([
  'bit.ly', 'bitly.com', 'bit.do', 't.co', 'tinyurl.com', 'tiny.cc', 'goo.gl', 'ow.ly', 'is.gd', 'v.gd',
  'buff.ly', 'rebrand.ly', 'rb.gy', 'cutt.ly', 'shorturl.at', 't.ly', 'lnkd.in', 's.id', 'bl.ink',
  'short.io', 'soo.gd', 'clck.ru', 'qr.ae', 'adf.ly', 'tr.im', 'trib.al', 'dlvr.it', 'ift.tt', 'fb.me',
  'wp.me', 'amzn.to', 'mcaf.ee', 'smarturl.it', 'snip.ly', 'urlz.fr', 'x.co', 'zpr.io',
  ...envList('LINK_EXTRA_SHORTENERS'),
])
export const MAX_REDIRECT_HOPS = 5

// ─── Structural rules (Layer 1) ───────────────────────────────────────────────

/** Domains allowed to use punycode ("xn--") labels. Empty by default: lookalike spoofing is blocked. */
export const PUNYCODE_ALLOWLIST = new Set<string>(envList('LINK_PUNYCODE_ALLOW'))
export const MAX_URL_LENGTH = 2048
/** Query parameters removed when normalising (pure tracking - the page is the same). */
export const TRACKING_PARAMS = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|igshid|mc_eid|mc_cid|_hsenc|_hsmi|yclid)$/i
/** At most this many different links are processed in one piece of text. */
export const MAX_LINKS_PER_TEXT = 10

// ─── Trusted domains: skip the interstitial ───────────────────────────────────

/**
 * These (and their subdomains) go straight through without the warning page. Kept short on
 * purpose: nothing that has an open redirect (google.com, facebook.com...) belongs here.
 * Add more with LINK_TRUSTED_DOMAINS=a.com,b.com
 */
export const TRUSTED_DOMAINS = [
  'youtube.com', 'youtu.be', 'wikipedia.org', 'spotify.com',
  ...envList('LINK_TRUSTED_DOMAINS'),
]

// ─── Threat intelligence (Layer 2) ────────────────────────────────────────────

/**
 * Big shared platforms. A bad page on one of these is blocked by its exact address only -
 * blocking "github.com" or "web.app" because one phishing page lives there would break
 * thousands of honest links.
 */
export const SHARED_HOSTING_DOMAINS = new Set([
  'github.com', 'githubusercontent.com', 'github.io', 'gitlab.com', 'gitlab.io', 'bitbucket.org',
  'google.com', 'googleapis.com', 'googleusercontent.com', 'appspot.com', 'web.app', 'firebaseapp.com',
  'blogspot.com', 'sites.google.com', 'docs.google.com', 'drive.google.com', 'forms.gle',
  'dropbox.com', 'onedrive.live.com', '1drv.ms', 'sharepoint.com', 'box.com', 'mega.nz', 'mediafire.com',
  'wixsite.com', 'weebly.com', 'wordpress.com', 'squarespace.com', 'notion.site', 'carrd.co', 'webflow.io',
  'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'glitch.me', 'repl.co', 'onrender.com',
  'amazonaws.com', 'cloudfront.net', 'azurewebsites.net', 'blob.core.windows.net', 'r2.dev',
  'canva.com', 'typeform.com', 'jotform.com', 'linktr.ee', 'bio.link', 'beacons.ai',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'telegram.org', 't.me', 'discord.com', 'discord.gg',
  'whatsapp.com', 'wa.me', 'youtube.com', 'youtu.be', 'medium.com', 'substack.com', 'tumblr.com',
  ...envList('LINK_SHARED_HOSTING'),
])

// ─── Heuristics (Layer 3) ─────────────────────────────────────────────────────

/** A site registered more recently than this many days is treated as suspicious (the spec says 30). */
export const NEW_DOMAIN_DAYS = Number(process.env.LINK_NEW_DOMAIN_DAYS ?? 30) || 30
/** What to do with a brand-new domain: 'block' (spec default) or 'flag' (allow, but never mark it safe). */
export const NEW_DOMAIN_ACTION: 'block' | 'flag' = process.env.LINK_NEW_DOMAIN_ACTION === 'flag' ? 'flag' : 'block'

export interface ProtectedBrand {
  name: string
  /** Words that identify the brand inside a domain name. */
  tokens: string[]
  /** The brand's real domains. Anything else that uses the name is impersonation. */
  legit: string[]
}

/**
 * Nigerian banks, fintechs and regulators that scam pages impersonate. REVIEW the "legit" lists
 * against what you know - a real domain missing here can be wrongly blocked if it also contains
 * scam wording. Extra real domains can be added with LINK_BRAND_ALLOW=a.com,b.com
 */
export const PROTECTED_BRANDS: ProtectedBrand[] = [
  { name: 'GTBank',       tokens: ['gtbank', 'gtco', 'gtworld'],       legit: ['gtbank.com', 'gtco.com', 'gtbankng.com'] },
  { name: 'Opay',         tokens: ['opay', 'opayweb'],                  legit: ['opay.com', 'opayweb.com', 'opaycheckout.com', 'opay-nigeria.com'] },
  { name: 'PalmPay',      tokens: ['palmpay'],                          legit: ['palmpay.com', 'palmpay.com.ng'] },
  { name: 'Moniepoint',   tokens: ['moniepoint', 'monnify'],            legit: ['moniepoint.com', 'monnify.com'] },
  { name: 'Paystack',     tokens: ['paystack'],                         legit: ['paystack.com', 'paystack.co', 'paystack.shop'] },
  { name: 'Kuda',         tokens: ['kuda'],                             legit: ['kuda.com', 'kudabank.com'] },
  { name: 'Flutterwave',  tokens: ['flutterwave'],                      legit: ['flutterwave.com', 'flutterwave.network', 'flw.sh'] },
  { name: 'Access Bank',  tokens: ['accessbank', 'accessbankplc'],      legit: ['accessbankplc.com', 'accessbank.com'] },
  { name: 'Zenith Bank',  tokens: ['zenithbank'],                       legit: ['zenithbank.com'] },
  { name: 'First Bank',   tokens: ['firstbank', 'firstbanknigeria'],    legit: ['firstbanknigeria.com', 'firstbankgroup.com'] },
  { name: 'UBA',          tokens: ['ubagroup', 'ubabank'],              legit: ['ubagroup.com'] },
  { name: 'Wema Bank',    tokens: ['wemabank'],                         legit: ['wemabank.com'] },
  { name: 'Sterling',     tokens: ['sterlingbank'],                     legit: ['sterling.ng', 'sterlingbankng.com'] },
  { name: 'Fidelity',     tokens: ['fidelitybank'],                     legit: ['fidelitybank.ng'] },
  { name: 'Ecobank',      tokens: ['ecobank'],                          legit: ['ecobank.com'] },
  { name: 'Stanbic IBTC', tokens: ['stanbicibtc'],                      legit: ['stanbicibtcbank.com'] },
  { name: 'Carbon',       tokens: ['getcarbon'],                        legit: ['getcarbon.co', 'carbon.ng'] },
  { name: 'FairMoney',    tokens: ['fairmoney'],                        legit: ['fairmoney.io', 'fairmoney.ng'] },
  { name: 'Paga',         tokens: ['mypaga'],                           legit: ['mypaga.com', 'paga.com'] },
  { name: 'Interswitch',  tokens: ['interswitch', 'quickteller'],       legit: ['interswitchgroup.com', 'quickteller.com', 'interswitchng.com'] },
  { name: 'NIBSS / BVN',  tokens: ['nibss', 'bvn'],                     legit: ['nibss-plc.com.ng'] },
  // Regulators and government bodies. Short names, so these only match as whole words (see heuristics.ts).
  { name: 'CBN',          tokens: ['cbn'],                              legit: ['cbn.gov.ng'] },
  { name: 'NIMC / NIN',   tokens: ['nimc', 'nin'],                      legit: ['nimc.gov.ng', 'nimcng.com'] },
  { name: 'FIRS',         tokens: ['firs'],                             legit: ['firs.gov.ng'] },
]
export const BRAND_ALLOW = new Set(envList('LINK_BRAND_ALLOW'))

/** Wording that, next to a protected name in a link, is what scams look like. Matched on word pieces. */
export const SCAM_KEYWORDS = [
  'update', 'updates', 'kyc', 'bonus', 'doublemoney', 'double', 'giveaway', 'freemoney', 'freedata', 'free',
  'claim', 'reward', 'rewards', 'verify', 'verification', 'secure', 'login', 'signin', 'otp', 'airdrop',
  'grant', 'palliative', 'loan', 'recovery', 'unlock', 'upgrade', 'suspended', 'restore', 'refund',
  'promo', 'cashout', 'withdraw', 'activate', 'activation', 'tier3', 'limit', 'portal', 'support', 'helpdesk',
]

// ─── Fail-open behaviour & freshness ──────────────────────────────────────────

/** A stored verdict younger than this is reused instead of re-checking (saves API calls). */
export const VERDICT_REUSE_MS = 6 * 60 * 60 * 1000
/** How long a looked-up domain age stays cached. Unknown results are retried sooner. */
export const DOMAIN_AGE_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const DOMAIN_AGE_UNKNOWN_TTL_MS = 24 * 60 * 60 * 1000
export const WEB_RISK_TIMEOUT_MS = 3500
export const RDAP_TIMEOUT_MS = 4000

/** Where "this link can't be shared" sends people to appeal. */
export const APPEAL_URL = '/contact?topic=link-appeal'
