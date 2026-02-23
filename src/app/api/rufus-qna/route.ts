import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Validate the Rufus extension API key from the Authorization header.
 * Key is stored in lb_admin_settings with key 'rufus_extension_api_key'.
 */
async function validateApiKey(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const providedKey = authHeader.slice(7).trim()
  if (!providedKey) return false

  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('lb_admin_settings')
    .select('value')
    .eq('key', 'rufus_extension_api_key')
    .single()

  if (!data?.value) return false
  return data.value === providedKey
}

/**
 * Marketplace domain → country lookup.
 */
async function resolveCountry(
  marketplace: string
): Promise<{ id: string; amazon_domain: string } | null> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('lb_countries')
    .select('id, amazon_domain')
    .eq('amazon_domain', marketplace)
    .single()

  return data
}

interface QAPair {
  question: string
  answer: string
  votes?: number
  source?: string
  author?: string
  date?: string
}

interface RufusQAPayload {
  asin: string
  marketplace: string
  questions: Array<{
    question: string
    answer: string
  }>
}

/**
 * Build a dedup key from a Q&A pair.
 * Only EXACT (question + answer) matches are considered duplicates.
 * Same question with a different Rufus answer → KEPT (captures variation).
 */
function dedupKey(q: string, a: string): string {
  return `${q.toLowerCase().trim()}|||${a.toLowerCase().trim()}`
}

/**
 * POST /api/rufus-qna
 *
 * Receives extracted Rufus Q&A data from the Chrome extension.
 * Authenticates via API key stored in lb_admin_settings.
 * Stores Q&A in lb_asin_questions (upserts on asin+country_id).
 *
 * Dedup rule: Only exact (question + answer) pairs are duplicates.
 * Same question with a different answer is KEPT — Rufus may answer differently.
 */
export async function POST(request: Request) {
  try {
    const isValid = await validateApiKey(request)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      )
    }

    const body = (await request.json()) as RufusQAPayload
    const { asin, marketplace, questions } = body

    if (!asin || !/^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())) {
      return NextResponse.json(
        { error: 'Invalid ASIN format (must be 10 alphanumeric characters)' },
        { status: 400 }
      )
    }

    if (!marketplace) {
      return NextResponse.json(
        { error: 'marketplace is required (e.g. "amazon.com")' },
        { status: 400 }
      )
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: 'questions array is required and must not be empty' },
        { status: 400 }
      )
    }

    const country = await resolveCountry(marketplace)
    if (!country) {
      return NextResponse.json(
        { error: `Unknown marketplace: ${marketplace}` },
        { status: 400 }
      )
    }

    const cleanedAsin = asin.trim().toUpperCase()

    // Format incoming Rufus questions
    const incomingQuestions: QAPair[] = questions.map((q) => ({
      question: q.question || '',
      answer: q.answer || '',
      votes: 0,
      source: 'rufus',
    }))

    const adminClient = createAdminClient()

    // Fetch existing record (may have Oxylabs Q&A, previous Rufus Q&A, or both)
    const { data: existing } = await adminClient
      .from('lb_asin_questions')
      .select('id, questions, raw_response')
      .eq('asin', cleanedAsin)
      .eq('country_id', country.id)
      .single()

    // Merge: keep ALL existing Q&A, then append only truly new pairs
    // A pair is "new" only if no existing pair has the EXACT same question AND answer
    let mergedQuestions: QAPair[]
    let newQuestionsAdded: number

    if (existing?.questions && Array.isArray(existing.questions)) {
      const existingPairs = existing.questions as QAPair[]

      // Build set of existing (question+answer) keys
      const existingKeys = new Set(
        existingPairs.map((q) => dedupKey(q.question, q.answer))
      )

      // Only add pairs that don't exist yet (exact Q+A match)
      // Also dedup within the incoming batch itself
      const seenNew = new Set<string>()
      const newPairs = incomingQuestions.filter((q) => {
        const key = dedupKey(q.question, q.answer)
        if (existingKeys.has(key) || seenNew.has(key)) return false
        seenNew.add(key)
        return true
      })

      mergedQuestions = [...existingPairs, ...newPairs]
      newQuestionsAdded = newPairs.length
    } else {
      // No existing data — deduplicate within the incoming batch itself
      const seen = new Set<string>()
      mergedQuestions = []
      for (const q of incomingQuestions) {
        const key = dedupKey(q.question, q.answer)
        if (!seen.has(key)) {
          seen.add(key)
          mergedQuestions.push(q)
        }
      }
      newQuestionsAdded = mergedQuestions.length
    }

    // Build raw_response: preserve existing metadata (e.g. Oxylabs), nest Rufus under its own key
    const rufusMetadata = {
      last_batch_size: incomingQuestions.length,
      new_added: newQuestionsAdded,
      total_rufus: mergedQuestions.filter((q) => q.source === 'rufus').length,
      total_oxylabs: mergedQuestions.filter((q) => q.source !== 'rufus').length,
      extracted_at: new Date().toISOString(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingRawResponse = (existing?.raw_response as Record<string, any>) || {}
    const mergedRawResponse = {
      ...existingRawResponse,
      rufus: rufusMetadata,
    }

    const { data: saved, error: saveErr } = await adminClient
      .from('lb_asin_questions')
      .upsert(
        {
          asin: cleanedAsin,
          country_id: country.id,
          marketplace_domain: marketplace,
          total_questions: mergedQuestions.length,
          questions: mergedQuestions,
          raw_response: mergedRawResponse,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'asin,country_id' }
      )
      .select('id')
      .single()

    if (saveErr) {
      console.error('Failed to save Rufus Q&A:', saveErr)
      return NextResponse.json(
        { error: `Database error: ${saveErr.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      id: saved?.id,
      asin: cleanedAsin,
      country_id: country.id,
      questions_total: mergedQuestions.length,
      new_questions_added: newQuestionsAdded,
      duplicates_skipped: incomingQuestions.length - newQuestionsAdded,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('Rufus Q&A API error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/rufus-qna?asin=XXX&marketplace=amazon.com
 *
 * Retrieve stored Q&A for an ASIN.
 * Optional: ?rufus_only=true to filter to only Rufus-sourced questions.
 */
export async function GET(request: Request) {
  try {
    const isValid = await validateApiKey(request)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const asin = searchParams.get('asin')?.trim().toUpperCase()
    const marketplace = searchParams.get('marketplace')

    if (!asin || !marketplace) {
      return NextResponse.json(
        { error: 'asin and marketplace are required' },
        { status: 400 }
      )
    }

    const country = await resolveCountry(marketplace)
    if (!country) {
      return NextResponse.json(
        { error: `Unknown marketplace: ${marketplace}` },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('lb_asin_questions')
      .select('id, questions, total_questions, updated_at')
      .eq('asin', asin)
      .eq('country_id', country.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ questions: [], total: 0 })
    }

    const rufusOnly = searchParams.get('rufus_only') === 'true'
    let questions = data.questions || []
    if (rufusOnly && Array.isArray(questions)) {
      questions = (questions as QAPair[]).filter((q) => q.source === 'rufus')
    }

    return NextResponse.json({
      questions,
      total: Array.isArray(questions) ? questions.length : 0,
      updated_at: data.updated_at,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
