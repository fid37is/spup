import { Fragment, type ReactNode } from 'react'

// For translated sentences that contain inline JSX (a bold email, a link).
// The translator keeps the {slot} where it belongs in THEIR word order:
//   tRich(t('auth.terms_notice'), { terms: <Link .../>, privacy: <Link .../> })
// Pass the raw string from t() with NO vars, so {slot} tokens are left intact.
// No hooks, so it works in Server and Client Components alike.
export function tRich(text: string, slots: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    if (m && m[1] in slots) return <Fragment key={i}>{slots[m[1]]}</Fragment>
    return part
  })
}
