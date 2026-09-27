'use client'

// use-mention-autocomplete.ts
//
// Shared by every composer that lets someone @-tag a user while typing
// (post-composer.tsx and reply-composer.tsx) so the detection/selection
// logic - and its edge cases - only exist once.
//
// How it works: on every change/click/key-up in the textarea, `recheck()`
// looks backward from the caret for an in-progress "@token" (an "@" not
// itself preceded by a word character or another "@", per MENTION_RE in
// lib/utils, followed by up to 20 username characters with no whitespace).
// If found, it debounces a lookup via searchMentionUsersAction and exposes
// the results for a dropdown to render. Selecting a result replaces just
// that "@token" span in the text with "@username " and moves the caret
// past it - the rest of the message is untouched.

import { useCallback, useEffect, useRef, useState } from 'react'
import { searchMentionUsersAction, type MentionUser } from '@/lib/actions/mentions'

// Mirrors MENTION_RE's character set (letters/digits/underscore) but without
// the 3-char minimum or trailing \b - while someone is still typing, the
// token can be shorter than a valid username and there's nothing after it
// yet for \b to anchor against.
const IN_PROGRESS_MENTION_RE = /(?:^|[^\w@])@([a-zA-Z0-9_]{0,20})$/

interface UseMentionAutocompleteArgs {
  value: string
  onChange: (next: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

export function useMentionAutocomplete({ value, onChange, textareaRef }: UseMentionAutocompleteArgs) {
  const [query, setQuery] = useState<string | null>(null)
  const [results, setResults] = useState<MentionUser[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  // The exact [start, end) span of "@token" currently being typed, in the
  // textarea's own value - what selectUser() replaces.
  const rangeRef = useRef<{ start: number; end: number } | null>(null)
  const requestIdRef = useRef(0)

  const close = useCallback(() => {
    rangeRef.current = null
    setQuery(null)
    setResults([])
    setLoading(false)
  }, [])

  // Re-scans the caret position for an in-progress @token. Cheap enough to
  // call on every change/click/key-up rather than trying to special-case
  // which events can move the caret.
  const recheck = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const caret = ta.selectionStart ?? 0
    const match = ta.value.slice(0, caret).match(IN_PROGRESS_MENTION_RE)
    if (!match) {
      if (rangeRef.current) close()
      return
    }
    const token = match[1]
    rangeRef.current = { start: caret - token.length - 1, end: caret }
    setActiveIndex(0)
    setQuery(token)
  }, [textareaRef, close])

  // Debounced search whenever the in-progress token changes.
  useEffect(() => {
    if (query === null) return
    if (query.length === 0) { setResults([]); setLoading(false); return }
    const requestId = ++requestIdRef.current
    setLoading(true)
    const timer = setTimeout(async () => {
      const users = await searchMentionUsersAction(query)
      if (requestIdRef.current === requestId) {
        setResults(users)
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const selectUser = useCallback((username: string) => {
    const range = rangeRef.current
    const ta = textareaRef.current
    if (!range) return
    const before = value.slice(0, range.start)
    const after = value.slice(range.end)
    const insertion = `@${username} `
    onChange(before + insertion + after)
    close()
    // Wait a tick for the controlled value to actually reach the textarea
    // before moving the caret, or the browser clamps the selection to the
    // (still-stale) shorter value.
    requestAnimationFrame(() => {
      if (!ta) return
      const pos = before.length + insertion.length
      ta.focus()
      // Both composers auto-grow the textarea the same way on every typed
      // change; redo it here too since this insertion didn't go through
      // their onChange handler.
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
      ta.setSelectionRange(pos, pos)
    })
  }, [value, onChange, textareaRef, close])

  // Call from the textarea's onKeyDown. Returns true if it handled the key
  // (caller should skip its own handling / not also submit on Enter).
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (query === null || results.length === 0) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i + 1) % results.length); return true }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex(i => (i - 1 + results.length) % results.length); return true }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectUser(results[activeIndex].username); return true }
    if (e.key === 'Escape') { e.preventDefault(); close(); return true }
    return false
  }, [query, results, activeIndex, selectUser, close])

  return {
    isOpen: query !== null && (loading || results.length > 0),
    results,
    activeIndex,
    loading,
    setActiveIndex,
    recheck,
    handleKeyDown,
    selectUser,
    close,
  }
}