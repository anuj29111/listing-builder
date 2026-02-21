import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  generateImageStackRecommendations,
  type KeywordAnalysisResult,
  type ReviewAnalysisResult,
  type QnAAnalysisResult,
} from '@/lib/claude'
import type { CompetitorAnalysisResult } from '@/types/api'

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
      .select('analysis_type, analysis_result, source, market_intelligence_id')
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .eq('status', 'completed')

    const allAnalyses = analyses || []

    // Pick best analysis per type
    const sourcePriority = ['merged', 'csv', 'file', 'linked']
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
    const competitorRow = pickBest('competitor_analysis')

    const keywordAnalysis = keywordRow
      ? (keywordRow.analysis_result as unknown as KeywordAnalysisResult)
      : null
    const reviewAnalysis = reviewRow
      ? (reviewRow.analysis_result as unknown as ReviewAnalysisResult)
      : null
    const qnaAnalysis = qnaRow
      ? (qnaRow.analysis_result as unknown as QnAAnalysisResult)
      : null
    const competitorAnalysis = competitorRow
      ? (competitorRow.analysis_result as unknown as CompetitorAnalysisResult)
      : null

    // Auto-resolve linked Market Intelligence
    const miRow = allAnalyses.find((a) => a.analysis_type === 'market_intelligence' && a.source === 'linked')
    let marketIntelligence = null
    if (miRow?.market_intelligence_id) {
      const { data: miRecord } = await supabase
        .from('lb_market_intelligence')
        .select('analysis_result, status')
        .eq('id', miRow.market_intelligence_id)
        .eq('status', 'completed')
        .single()
      if (miRecord?.analysis_result) {
        marketIntelligence = miRecord.analysis_result
      }
    }

    const { result, model, tokensUsed } = await generateImageStackRecommendations(
      cat.name,
      keywordAnalysis,
      reviewAnalysis,
      qnaAnalysis,
      competitorAnalysis,
      marketIntelligence
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
