// src/lib/actions/wallet-transfer.ts
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// Direct wallet-to-wallet transfer between two Spup users. Unlike
// escrow.ts (013), there's no hold/release step — the balance move
// is atomic and immediate via the transfer_wallet_funds() Postgres
// function (014_wallet_transfers.sql), so a crash mid-request can
// never leave a debit without its matching credit.
//
// Balance mutation goes through the admin client for the same
// reason as escrow: a single action touches two different users'
// wallets, which RLS can't authorize for one request. The caller
// is still fully authenticated/authorized before anything moves.
// ============================================================

const MIN_TRANSFER_KOBO = 5_000 // ₦50

function generateReference(prefix: string) {
  return `SPUP-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', profile: null }

  const { data: profile } = await supabase
    .from('users')
    .select('id, username, status')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found', profile: null }
  if (profile.status === 'banned' || profile.status === 'suspended') {
    return { error: 'Your account is not eligible for this action', profile: null }
  }
  return { error: null, profile }
}

async function notify(recipientId: string, actorId: string, type: string, entityId: string, entityType = 'wallet_transfer') {
  const admin = createAdminClient()
  void admin.from('notifications').insert({
    recipient_id: recipientId,
    actor_id: actorId,
    type,
    entity_id: entityId,
    entity_type: entityType,
  })
}

// ─── Look up a recipient by username before sending ─────────────────────────
// Powers the live "who are you sending to" preview in send-button.tsx.
// Deliberately returns the same shape/behaviour whether the user doesn't
// exist or isn't eligible to receive — no need to distinguish those to the
// sender beyond "can't send to this account".

export async function resolveTransferRecipientAction(username: string) {
  const clean = username.trim().replace(/^@/, '').toLowerCase()
  if (!clean) return { error: 'Enter a username' }

  const { error: authError, profile: sender } = await getCallerProfile()
  if (authError || !sender) return { error: authError }

  const admin = createAdminClient()
  const { data: recipient } = await admin
    .from('users')
    .select('id, username, display_name, avatar_url, status')
    .eq('username', clean)
    .single()

  if (!recipient) return { error: 'User not found' }
  if (recipient.status === 'banned' || recipient.status === 'suspended') {
    return { error: 'This account cannot receive transfers' }
  }
  if (recipient.id === sender.id) return { error: "You can't send money to yourself" }

  return {
    recipient: {
      id: recipient.id,
      username: recipient.username,
      display_name: recipient.display_name,
      avatar_url: recipient.avatar_url,
    },
  }
}

// ─── Send the transfer ───────────────────────────────────────────────────────

export async function transferAction({
  recipientUsername,
  amountKobo,
  note,
}: {
  recipientUsername: string
  amountKobo: number
  note?: string
}) {
  const { error: authError, profile: sender } = await getCallerProfile()
  if (authError || !sender) return { error: authError }

  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    return { error: 'Enter a valid amount' }
  }
  if (amountKobo < MIN_TRANSFER_KOBO) {
    return { error: `Minimum transfer is ₦${(MIN_TRANSFER_KOBO / 100).toFixed(0)}` }
  }

  const admin = createAdminClient()

  const clean = recipientUsername.trim().replace(/^@/, '').toLowerCase()
  const { data: recipient } = await admin
    .from('users')
    .select('id, username, status')
    .eq('username', clean)
    .single()

  if (!recipient) return { error: 'Recipient not found' }
  if (recipient.status === 'banned' || recipient.status === 'suspended') {
    return { error: 'This account cannot receive transfers' }
  }
  if (recipient.id === sender.id) return { error: "You can't send money to yourself" }

  const { data: senderWallet } = await admin
    .from('wallets')
    .select('id, balance_kobo')
    .eq('user_id', sender.id)
    .single()

  if (!senderWallet) return { error: 'Wallet not found' }
  if (senderWallet.balance_kobo < amountKobo) {
    return {
      error: `Insufficient balance. Your balance is ₦${(senderWallet.balance_kobo / 100).toFixed(2)}.`,
      insufficient_balance: true,
    }
  }

  const { data: recipientWallet } = await admin
    .from('wallets')
    .select('id')
    .eq('user_id', recipient.id)
    .single()

  if (!recipientWallet) return { error: "Recipient's wallet could not be found" }

  const reference = generateReference('XFER')
  const now = new Date().toISOString()

  // Atomic debit + credit — see transfer_wallet_funds() in
  // 014_wallet_transfers.sql. Anything that fails here means NO
  // balance moved at all (the function's own transaction rolled
  // back), so it's safe to just return the error.
  const { error: rpcError } = await admin.rpc('transfer_wallet_funds', {
    p_sender_wallet_id: senderWallet.id,
    p_recipient_wallet_id: recipientWallet.id,
    p_amount_kobo: amountKobo,
  })

  if (rpcError) {
    if (rpcError.message?.includes('INSUFFICIENT_BALANCE')) {
      return { error: 'Insufficient balance.', insufficient_balance: true }
    }
    return { error: 'Could not process transfer. Please try again.' }
  }

  // Balances have already moved at this point — everything below is
  // record-keeping. If it fails partway, the money is still correctly
  // moved; we log what we can rather than attempt a reversal, since
  // reversing would itself need the same atomicity guarantees.
  const description = note?.trim() ? note.trim().slice(0, 200) : undefined

  const { data: senderTxn, error: senderTxnError } = await admin
    .from('transactions')
    .insert({
      wallet_id: senderWallet.id,
      type: 'transfer_sent',
      amount_kobo: amountKobo,
      status: 'completed',
      reference: `${reference}-OUT`,
      description: description ?? `Sent to @${recipient.username}`,
      entity_id: recipient.id,
      completed_at: now,
    })
    .select('id')
    .single()

  const { data: recipientTxn, error: recipientTxnError } = await admin
    .from('transactions')
    .insert({
      wallet_id: recipientWallet.id,
      type: 'transfer_received',
      amount_kobo: amountKobo,
      status: 'completed',
      reference: `${reference}-IN`,
      description: description ?? `Received from @${sender.username}`,
      entity_id: sender.id,
      completed_at: now,
    })
    .select('id')
    .single()

  let transferId: string | null = null

  if (senderTxnError || recipientTxnError || !senderTxn || !recipientTxn) {
    // Money moved but the ledger rows are incomplete — flag loudly
    // for ops rather than silently returning success.
    console.error('[transferAction] balance moved but transaction logging failed', {
      reference, senderTxnError, recipientTxnError,
    })
  } else {
    const { data: transferRow } = await admin
      .from('wallet_transfers')
      .insert({
        reference,
        sender_id: sender.id,
        recipient_id: recipient.id,
        amount_kobo: amountKobo,
        note: description ?? null,
        sender_txn_id: senderTxn.id,
        recipient_txn_id: recipientTxn.id,
      })
      .select('id')
      .single()
    transferId = transferRow?.id ?? null
  }

  // entity_id is a UUID column — fall back to the recipient's own
  // transaction row if the wallet_transfers insert above didn't
  // succeed, rather than passing the (non-UUID) text reference.
  const notificationEntityId = transferId ?? recipientTxn?.id
  if (notificationEntityId) {
    await notify(recipient.id, sender.id, 'wallet_transfer_received', notificationEntityId)
  }
  revalidatePath('/wallet')

  return { success: true, reference }
}