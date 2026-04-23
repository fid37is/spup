#!/bin/bash

# Create admin directory structure and empty files

files=(
  "src/app/(admin)/admin/posts/page.tsx"
  "src/app/(admin)/admin/posts/post-actions.tsx"
  "src/app/(admin)/admin/reports/page.tsx"
  "src/app/(admin)/admin/reports/report-actions.tsx"
  "src/app/(admin)/admin/ads/page.tsx"
  "src/app/(admin)/admin/ads/ad-review-actions.tsx"
  "src/app/(admin)/admin/moderation/page.tsx"
  "src/app/(admin)/admin/activity/page.tsx"
  "src/app/(admin)/admin/users/[id]/page.tsx"
  "src/app/(admin)/admin/waitlist/page.tsx"
  "src/app/(admin)/admin/waitlist/invite-button.tsx"
  "src/components/admin/admin-nav.tsx"
  "src/app/(main)/feed/feed-client.tsx"
)

for file in "${files[@]}"; do
  mkdir -p "$(dirname "$file")"
  touch "$file"
  echo "Created: $file"
done

echo ""
echo "Done — ${#files[@]} files created."
