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

  // marketplace comes as "amazon.com", "amazon.co.uk", etc.
  const { data } = await adminClient
    .from('lb_countries')
    .select('id, amazon_domain')
    .eq('amazon_domain', marketplace)
    .single()

  return data
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
 * POST /api/rufus-qna
 *
 * Receives extracted Rufus Q&A data from the Chrome extension.
 * Authenticates via API key stored in lb_admin_settings.
 * Stores Q&A in lb_asin_questions (upserts on asin+country_id).
 */
export async function POST(request: Request) {
  try {
    // Authenticate
    const isValid = await validateApiKey(request)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      )
    }

    const body = (await request.json()) as RufusQAPayload
    const { asin, marketplace, questions } = body

    // Validate input
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

    // Resolve country
    const country = await resolveCountry(marketplace)
    if (!country) {
      return NextResponse.json(
        { error: `Unknown marketplace: ${marketplace}` },
        { status: 400 }
      )
    }

    const cleanedAsin = asin.trim().toUpperCase()

    // Format questions to match OxylabsQnAItem shape
    const formattedQuestions = questions.map((q) => ({
      question: q.question || '',
      answer: q.answer || '',
      votes: 0,
      source: 'rufus' as const,
    }))

    // Upsert into lb_asin_questions
    const adminClient = createAdminClient()

    // Check for existing record — if it has Oxylabs data, merge rather than replace
    const { data: existing } = await adminClient
      .from('lb_asin_questions')
      .select('id, questions')
      .eq('asin', cleanedAsin)
      .eq('country_id', country.id)
      .single()

    let mergedQuestions = formattedQuestions
    if (existing?.questions && Array.isArray(existing.questions)) {
      // Keep existing Oxylabs questions, append Rufus questions
      // De-duplicate by question text (case-insensitive)
      const existingSet = new Set(
        (existing.questions as Array<{ question: string }>).map((q) =>
          q.question.toLowerCase().trim()
        )
      )
      const newOnes = formattedQuestions.filter(
        (q) => !existingSet.has(q.question.toLowerCase().trim())
      )
      mergedQuestions = [...(existing.questions as typeof formattedQuestions), ...newOnes]
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
          raw_response: {
            source: 'rufus_extension',
            rufus_count: formattedQuestions.length,
            extracted_at: new Date().toISOString(),
          },
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
      questions_stored: mergedQuestions.length,
      rufus_questions_added: formattedQuestions.length,
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
 * Retrieve stored Rufus Q&A for an ASIN.
 * Also authenticated via API key (for extension use).
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

    // Filter to only rufus-sourced questions if requested
    const rufusOnly = searchParams.get('rufus_only') === 'true'
    let questions = data.questions || []
    if (rufusOnly && Array.isArray(questions)) {
      questions = (questions as Array<{ source?: string }>).filter(
        (q) => q.source === 'rufus'
      )
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
