// src/app/api/upload/signature/route.ts
//
// Retired. Uploads used to be signed here for direct-to-Cloudinary upload. Media now
// goes to bunny.net through /api/upload/bunny. This stays only to give an app that is
// still running the old JavaScript a clear message, instead of letting it keep creating
// Cloudinary files: the answer 410 makes the old composer show the message and stop.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Spup has been updated. Please close and reopen the app (or refresh the page), then try again.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
