// src/lib/nigeria.ts
//
// Nigeria's 36 states + the FCT, and helpers to turn what we receive into a
// clean state name:
//   - a Cloudflare / geo-IP region ("Lagos", "Federal Capital Territory", "LA")
//   - free text a user typed as their profile location ("Ikeja, Lagos", "PH")
// Also a small free-text -> country matcher, used only to *estimate* the
// country of users whose location was never detected.

export const FCT_NAME = 'FCT (Abuja)'

interface StateDef {
  name: string
  /** ISO 3166-2:NG subdivision code (what some hosts send instead of a name) */
  code: string
  /** other spellings and major towns/areas that identify the state */
  aliases: string[]
}

const STATE_DEFS: StateDef[] = [
  { name: 'Abia', code: 'AB', aliases: ['aba', 'umuahia'] },
  { name: 'Adamawa', code: 'AD', aliases: ['yola'] },
  { name: 'Akwa Ibom', code: 'AK', aliases: ['uyo', 'eket', 'ikot ekpene'] },
  { name: 'Anambra', code: 'AN', aliases: ['awka', 'onitsha', 'nnewi'] },
  { name: 'Bauchi', code: 'BA', aliases: [] },
  { name: 'Bayelsa', code: 'BY', aliases: ['yenagoa'] },
  { name: 'Benue', code: 'BE', aliases: ['makurdi'] },
  { name: 'Borno', code: 'BO', aliases: ['maiduguri'] },
  { name: 'Cross River', code: 'CR', aliases: ['calabar'] },
  { name: 'Delta', code: 'DE', aliases: ['asaba', 'warri', 'sapele', 'ughelli', 'agbor', 'effurun'] },
  { name: 'Ebonyi', code: 'EB', aliases: ['abakaliki'] },
  { name: 'Edo', code: 'ED', aliases: ['benin city', 'ekpoma', 'auchi'] },
  { name: 'Ekiti', code: 'EK', aliases: ['ado ekiti', 'ado-ekiti'] },
  { name: 'Enugu', code: 'EN', aliases: ['nsukka'] },
  { name: FCT_NAME, code: 'FC', aliases: ['federal capital territory', 'fct', 'abuja', 'garki', 'wuse', 'maitama', 'gwarinpa', 'kubwa', 'lugbe'] },
  { name: 'Gombe', code: 'GO', aliases: [] },
  { name: 'Imo', code: 'IM', aliases: ['owerri'] },
  { name: 'Jigawa', code: 'JI', aliases: ['dutse'] },
  { name: 'Kaduna', code: 'KD', aliases: ['zaria'] },
  { name: 'Kano', code: 'KN', aliases: [] },
  { name: 'Katsina', code: 'KT', aliases: [] },
  { name: 'Kebbi', code: 'KE', aliases: ['birnin kebbi'] },
  { name: 'Kogi', code: 'KO', aliases: ['lokoja'] },
  { name: 'Kwara', code: 'KW', aliases: ['ilorin'] },
  { name: 'Lagos', code: 'LA', aliases: ['ikeja', 'lekki', 'ikorodu', 'surulere', 'yaba', 'victoria island', 'ajah', 'badagry', 'ikoyi', 'festac', 'oshodi', 'mushin', 'alimosho'] },
  { name: 'Nasarawa', code: 'NA', aliases: ['lafia', 'keffi'] },
  { name: 'Niger', code: 'NI', aliases: ['minna', 'suleja', 'niger state'] },
  { name: 'Ogun', code: 'OG', aliases: ['abeokuta', 'sagamu', 'ijebu', 'ijebu ode'] },
  { name: 'Ondo', code: 'ON', aliases: ['akure'] },
  { name: 'Osun', code: 'OS', aliases: ['osogbo', 'ile ife', 'ile-ife', 'ilesa'] },
  { name: 'Oyo', code: 'OY', aliases: ['ibadan', 'ogbomosho'] },
  { name: 'Plateau', code: 'PL', aliases: ['jos'] },
  { name: 'Rivers', code: 'RI', aliases: ['port harcourt', 'portharcourt', 'ph city', 'obio akpor', 'obio-akpor'] },
  { name: 'Sokoto', code: 'SO', aliases: [] },
  { name: 'Taraba', code: 'TA', aliases: ['jalingo'] },
  { name: 'Yobe', code: 'YO', aliases: ['damaturu'] },
  { name: 'Zamfara', code: 'ZA', aliases: ['gusau'] },
]

export const NIGERIAN_STATES: string[] = STATE_DEFS.map(s => s.name)

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()

// name / alias -> canonical state, checked longest first so "benin city" beats "benin"
const TEXT_INDEX: Array<{ term: string; state: string }> = STATE_DEFS
  .flatMap(s => [s.name, ...s.aliases].map(term => ({ term: norm(term), state: s.name })))
  .filter(e => e.term.length > 0)
  .sort((a, b) => b.term.length - a.term.length)

const CODE_INDEX = new Map(STATE_DEFS.map(s => [s.code, s.name]))

/**
 * A region value from geo-IP -> canonical state name, or null if it isn't one.
 * Accepts full names ("Lagos"), FCT spellings, "X State", and 2-letter codes.
 */
export function canonicalState(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) return CODE_INDEX.get(trimmed.toUpperCase()) ?? null
  const n = norm(trimmed).replace(/\bstate$/, '').trim()
  if (!n) return null
  const exact = TEXT_INDEX.find(e => e.term === n)
  return exact ? exact.state : null
}

/** Free-text profile location ("Ikeja, Lagos", "Port Harcourt") -> state, or null. */
export function matchStateFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const n = ' ' + norm(text) + ' '
  for (const { term, state } of TEXT_INDEX) {
    if (n.includes(' ' + term + ' ')) return state
  }
  return null
}

// ── Countries (estimates from free text only) ───────────────────────────────
const COUNTRY_TERMS: Array<{ code: string; terms: string[] }> = [
  { code: 'NG', terms: ['nigeria', 'naija', '9ja', 'ng'] },
  { code: 'GH', terms: ['ghana', 'accra', 'kumasi'] },
  { code: 'KE', terms: ['kenya', 'nairobi', 'mombasa'] },
  { code: 'ZA', terms: ['south africa', 'johannesburg', 'cape town', 'durban', 'pretoria'] },
  { code: 'GB', terms: ['united kingdom', 'uk', 'england', 'london', 'manchester', 'birmingham', 'scotland', 'wales'] },
  { code: 'US', terms: ['united states', 'usa', 'america', 'new york', 'texas', 'houston', 'atlanta', 'california', 'chicago', 'maryland', 'dallas'] },
  { code: 'CA', terms: ['canada', 'toronto', 'calgary', 'vancouver', 'ottawa'] },
  { code: 'DE', terms: ['germany', 'berlin', 'hamburg'] },
  { code: 'AE', terms: ['uae', 'dubai', 'abu dhabi', 'united arab emirates'] },
  { code: 'IE', terms: ['ireland', 'dublin'] },
  { code: 'FR', terms: ['france', 'paris'] },
  { code: 'CM', terms: ['cameroon', 'douala', 'yaounde'] },
  { code: 'BJ', terms: ['benin republic', 'republic of benin', 'cotonou'] },
  { code: 'AU', terms: ['australia', 'sydney', 'melbourne'] },
  { code: 'CN', terms: ['china', 'guangzhou', 'shenzhen'] },
]
const COUNTRY_INDEX = COUNTRY_TERMS
  .flatMap(c => c.terms.map(term => ({ term: norm(term), code: c.code })))
  .sort((a, b) => b.term.length - a.term.length)

/**
 * Best-effort country from free text. Any Nigerian state / major Nigerian town
 * counts as Nigeria. Returns null when nothing is recognised - never guesses.
 */
export function matchCountryFromText(text: string | null | undefined): string | null {
  if (!text) return null
  if (matchStateFromText(text)) return 'NG'
  const n = ' ' + norm(text) + ' '
  for (const { term, code } of COUNTRY_INDEX) {
    if (n.includes(' ' + term + ' ')) return code
  }
  return null
}
