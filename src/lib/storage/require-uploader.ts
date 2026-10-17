// src/lib/storage/require-uploader.ts
//
// Shared by both upload routes: who is asking, and are they allowed to upload?
// (Same rules the Cloudinary routes applied: signed in, not banned, not suspended.)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suspensionBlock } from '@/lib/suspension-server'

export async function requireUploader(): Promise<{ profile: { id: string } } | { response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('id, status')
    .eq('auth_id', user.id)
    .single()

  if (!profile || profile.status === 'banned') {
    return { response: NextResponse.json({ error: 'Account not eligible for uploads' }, { status: 403 }) }
  }
  const suspended = await suspensionBlock(profile)
  if (suspended) return { response: NextResponse.json(suspended, { status: 403 }) }

  return { profile: { id: profile.id as string } }
}
