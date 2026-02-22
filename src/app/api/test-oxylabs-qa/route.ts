import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const OXYLABS_TIMEOUT_MS = 60_000

async function getCredentials() {
  const adminClient = createAdminClient()
  const [usernameResult, passwordResult] = await Promise.all([
    adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'oxylabs_username')
      .single(),
    adminClient
      .from('lb_admin_settings')
      .select('value')
      .eq('key', 'oxylabs_password')
      .single(),
  ])

  if (usernameResult.data?.value && passwordResult.data?.value) {
    return {
      username: usernameResult.data.value,
      password: passwordResult.data.value,
    }
  }

  const username = process.env.OXYLABS_USERNAME
  const password = process.env.OXYLABS_PASSWORD

  if (!username || !password) {
    throw new Error('Oxylabs credentials not found')
  }

  return { username, password }
}

async function oxylabsFetch(options: RequestInit, timeoutMs = OXYLABS_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://realtime.oxylabs.io/v1/queries', {
      ...options,
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Oxylabs API error (${response.status}): ${text}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const asin = searchParams.get('asin') || 'B000J07TUG' // Default: Chalkola chalk markers
    const domain = searchParams.get('domain') || 'com'
    const pages = parseInt(searchParams.get('pages') || '3', 10) // Test with 3 pages

    const { username, password } = await getCredentials()
    const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')

    // Fetch Q&A with multiple pages
    const qaResponse = await oxylabsFetch({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        source: 'amazon_questions',
        domain,
        query: asin,
        pages,
        parse: true,
      }),
    })

    const results = qaResponse.results as Array<Record<string, unknown>> | undefined
    const content = results?.[0]?.content as Record<string, unknown> | undefined
    const questions = (content?.questions || []) as Array<Record<string, unknown>>

    // Also check: what does the raw response structure look like?
    const statusCode = results?.[0]?.status_code
    const createdAt = qaResponse.created_at
    const updatedAt = qaResponse.updated_at

    // Analyze question content
    const analysis = {
      test_params: { asin, domain, pages_requested: pages },
      response_meta: {
        status_code: statusCode,
        created_at: createdAt,
        updated_at: updatedAt,
        parse_status_code: content?.parse_status_code,
        url: content?.url,
        page: content?.page,
        total_pages_available: content?.pages,
      },
      question_stats: {
        total_questions_returned: questions.length,
        questions_with_answers: questions.filter((q) => q.answer && String(q.answer).trim()).length,
        questions_without_answers: questions.filter((q) => !q.answer || !String(q.answer).trim()).length,
        questions_with_votes: questions.filter((q) => typeof q.votes === 'number' && q.votes > 0).length,
        avg_votes: questions.length > 0
          ? (questions.reduce((sum, q) => sum + (typeof q.votes === 'number' ? q.votes : 0), 0) / questions.length).toFixed(1)
          : 0,
        max_votes: questions.length > 0
          ? Math.max(...questions.map((q) => (typeof q.votes === 'number' ? q.votes : 0)))
          : 0,
      },
      // Full questions data so we can inspect content
      questions: questions.map((q, i) => ({
        index: i + 1,
        question: q.question,
        answer: q.answer,
        votes: q.votes,
        author: q.author,
        date: q.date,
        // Check for any Rufus-like AI indicators
        answer_length: q.answer ? String(q.answer).length : 0,
      })),
      // Raw content keys to see full structure
      raw_content_keys: content ? Object.keys(content) : [],
      // Full raw response for deep inspection (first result only)
      raw_first_result_keys: results?.[0] ? Object.keys(results[0]) : [],
    }

    return NextResponse.json(analysis, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
