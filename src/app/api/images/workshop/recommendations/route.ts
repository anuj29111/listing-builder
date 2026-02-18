import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateImageStackRecommendations,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const body = await request.json()

    const { category_id, country_id } = body

    if (!category_id || !country_id) {
      return NextResponse.json(
        { error: 'category_id and country_id are required' },
        { status: 400 }
      )
    }

    // Fetch category name
    const { data: cat } = await supabase
      .from('lb_categories')
      .select('name')
      .eq('id', category_id)
      .single()

    if (!cat) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Fetch analyses
    const { data: analyses } = await supabase
      .from('lb_research_analysis')
      .select('analysis_type, analysis_result, source')
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .eq('status', 'completed')

    const allAnalyses = analyses || []

    // Pick best analysis per type
    const sourcePriority = ['merged', 'csv', 'file']
    const pickBest = (type: string) => {
      const matches = allAnalyses.filter((a) => a.analysis_type === type)
      if (matches.length === 0) return undefined
      return matches.sort((a, b) => {
        const ai = sourcePriority.indexOf(a.source || 'csv')
        const bi = sourcePriority.indexOf(b.source || 'csv')
        return ai - bi
      })[0]
    }

    const keywordRow = pickBest('keyword_analysis')
    const reviewRow = pickBest('review_analysis')
    const qnaRow = pickBest('qna_analysis')

    const keywordAnalysis = keywordRow
      ? (keywordRow.analysis_result as unknown as KeywordAnalysisResult)
      : null
    const reviewAnalysis = reviewRow
      ? (reviewRow.analysis_result as unknown as ReviewAnalysisResult)
      : null
    const qnaAnalysis = qnaRow
      ? (qnaRow.analysis_result as unknown as QnAAnalysisResult)
      : null

    const { result, model, tokensUsed } = await generateImageStackRecommendations(
      cat.name,
      keywordAnalysis,
      reviewAnalysis,
      qnaAnalysis
    )

    return NextResponse.json({
      data: result,
      model,
      tokensUsed,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Image stack recommendations error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
