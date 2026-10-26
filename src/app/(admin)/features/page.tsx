// src/app/(admin)/features/page.tsx
//
// Feature switches: platform-wide on/off flags an admin can flip at any time, with no deploy.
// The list comes from FEATURE_FLAGS in lib/feature-flags.ts.

import { FEATURE_FLAGS, getAllFeatureFlags } from '@/lib/feature-flags'
import FeatureSwitch from './feature-switch'

export const dynamic = 'force-dynamic'

export default async function FeaturesPage() {
  const values = await getAllFeatureFlags()

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7 md:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary">Feature switches</h1>
        <p className="mt-0.5 text-sm text-faint">
          Turn platform features on or off for every user, instantly. Changes are recorded in the audit log.
        </p>
      </div>

      <div className="flex max-w-2xl flex-col gap-3">
        {FEATURE_FLAGS.map(flag => (
          <FeatureSwitch
            key={flag.key}
            flagKey={flag.key}
            label={flag.label}
            description={flag.description}
            onText={flag.onText}
            offText={flag.offText}
            initialValue={values[flag.key]}
          />
        ))}
      </div>
    </div>
  )
}
