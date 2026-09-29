// src/app/(admin)/word-rules/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { AddRulesForm, RuleRowActions } from './word-rules-client'

interface RuleRow {
  id: string
  term: string
  match_type: 'word' | 'contains'
  action: 'flag' | 'block' | 'support'
  category: string
  is_active: boolean
  created_at: string
}

async function getRules() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_rules')
    .select('id, term, match_type, action, category, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  return (data || []) as RuleRow[]
}

export default async function WordRulesPage() {
  const rules = await getRules()
  const active = rules.filter(r => r.is_active).length

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Word rules</h1>
        <p className="mt-0.5 text-sm text-faint">
          Words and phrases that aren&apos;t allowed in posts and replies. {active} active of {rules.length}.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-surface p-4 text-[13px] leading-relaxed text-secondary sm:p-5">
        <p className="mb-1.5 font-display text-sm font-bold text-primary">How it works</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="font-semibold text-primary">Flag</span>: the post publishes normally and lands in Flagged content for you to review.</li>
          <li><span className="font-semibold text-primary">Block</span>: the post is rejected before it publishes. The person sees a generic message (it doesn&apos;t say which word). The attempt still appears in Flagged content so repeat offenders are visible.</li>
          <li><span className="font-semibold text-primary">Support</span>: used for self-harm wording. The post publishes, the person is shown free helplines, and it is <span className="font-semibold text-primary">not</span> added to Flagged content. Someone in distress should be offered help, not treated as a rule-breaker.</li>
          <li>Matching ignores capital letters and accents, and catches common swaps like <span className="font-mono">@</span> for a, <span className="font-mono">0</span> for o, <span className="font-mono">3</span> for e, and stretched or starred letters (&quot;killlll&quot;, &quot;c*nt&quot;).</li>
          <li>Use <span className="font-semibold text-primary">Whole word</span> for short words so &quot;ass&quot; doesn&apos;t catch &quot;class&quot;. Use <span className="font-semibold text-primary">Anywhere</span> only for terms that are never innocent inside another word.</li>
          <li>Chats are not scanned; they stay private. Only public posts and replies are checked.</li>
        </ul>
      </div>

      <AddRulesForm />

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-14 text-center">
          <p className="text-[15px] text-faint">No rules yet. Add your first words above.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {rules.map((r, i) => (
            <div
              key={r.id}
              className={`flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${i < rules.length - 1 ? 'border-b border-border' : ''} ${r.is_active ? '' : 'opacity-50'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-display text-sm font-semibold text-primary">{r.term}</span>
                  <span
                    className="rounded px-2 py-0.5 text-[11px] font-bold"
                    style={r.action === 'block'
                      ? { background: 'rgba(229,57,53,0.12)', color: '#E53935' }
                      : r.action === 'support'
                        ? { background: 'rgba(55,138,221,0.12)', color: '#378ADD' }
                        : { background: 'rgba(212,160,23,0.12)', color: '#D4A017' }}
                  >
                    {r.action === 'block' ? 'BLOCK' : r.action === 'support' ? 'SUPPORT' : 'FLAG'}
                  </span>
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold capitalize text-secondary">{r.category.replace('_', ' ')}</span>
                  <span className="text-[11px] text-faint">{r.match_type === 'word' ? 'whole word' : 'anywhere'}</span>
                  {!r.is_active && <span className="text-[11px] font-semibold text-faint">PAUSED</span>}
                </div>
              </div>
              <RuleRowActions id={r.id} isActive={r.is_active} action={r.action} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
