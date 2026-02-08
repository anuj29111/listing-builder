import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyzeKeywords, analyzeReviews, analyzeQnA } from '@/lib/claude'
import type { AnalysisType, FileType } from '@/types'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()

    const body = await request.json()
    const { category_id, country_id, analysis_type } = body as {
      category_id: string
      country_id: string
      analysis_type: AnalysisType
    }

    if (!category_id || !country_id || !analysis_type) {
      return NextResponse.json(
        { error: 'category_id, country_id, and analysis_type are required' },
        { status: 400 }
      )
    }

    const validTypes: AnalysisType[] = ['keyword_analysis', 'review_analysis', 'qna_analysis']
    if (!validTypes.includes(analysis_type)) {
      return NextResponse.json({ error: 'Invalid analysis_type' }, { status: 400 })
    }

    // Determine which file types to look for
    const fileTypesForAnalysis: FileType[] =
      analysis_type === 'keyword_analysis'
        ? ['keywords']
        : analysis_type === 'review_analysis'
          ? ['reviews']
          : ['qna', 'rufus_qna']

    // Fetch category + country info
    const [catResult, countryResult] = await Promise.all([
      supabase.from('lb_categories').select('id, name, slug').eq('id', category_id).single(),
      supabase.from('lb_countries').select('id, name, code').eq('id', country_id).single(),
    ])

    if (catResult.error || !catResult.data) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
    if (countryResult.error || !countryResult.data) {
      return NextResponse.json({ error: 'Country not found' }, { status: 404 })
    }

    // Find research files for this category/country/type
    const { data: files, error: filesError } = await supabase
      .from('lb_research_files')
      .select('id, file_type, storage_path, file_name')
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .in('file_type', fileTypesForAnalysis)
      .order('created_at', { ascending: false })

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 })
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: `No ${fileTypesForAnalysis.join('/')} files found for this category/country` },
        { status: 400 }
      )
    }

    // Upsert a pending analysis record (delete existing if re-analyzing)
    await adminClient
      .from('lb_research_analysis')
      .delete()
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .eq('analysis_type', analysis_type)

    const { data: analysisRow, error: insertError } = await adminClient
      .from('lb_research_analysis')
      .insert({
        category_id,
        country_id,
        analysis_type,
        source_file_ids: files.map((f) => f.id),
        status: 'processing',
        analyzed_by: lbUser.id,
      })
      .select()
      .single()

    if (insertError || !analysisRow) {
      return NextResponse.json(
        { error: `Failed to create analysis record: ${insertError?.message}` },
        { status: 500 }
      )
    }

    // Download CSV content from storage (use the most recent file per type)
    const seenTypes = new Set<string>()
    const filesToProcess: Array<{ id: string; fileType: string; content: string }> = []

    for (const file of files) {
      // Only use the most recent file of each type
      if (seenTypes.has(file.file_type)) continue
      seenTypes.add(file.file_type)

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('lb-research-files')
        .download(file.storage_path)

      if (downloadError || !fileData) {
        // Mark analysis as failed
        await adminClient
          .from('lb_research_analysis')
          .update({ status: 'failed', error_message: `Failed to download ${file.file_name}: ${downloadError?.message}` })
          .eq('id', analysisRow.id)

        return NextResponse.json(
          { error: `Failed to download file: ${file.file_name}` },
          { status: 500 }
        )
      }

      const content = await fileData.text()
      filesToProcess.push({ id: file.id, fileType: file.file_type, content })
    }

    // Concatenate if multiple files (e.g. qna + rufus_qna)
    const combinedContent = filesToProcess.map((f) => f.content).join('\n\n')

    // Run Claude analysis
    try {
      let analysisOutput: { result: Record<string, unknown>; model: string; tokensUsed: number }

      if (analysis_type === 'keyword_analysis') {
        const output = await analyzeKeywords(combinedContent, catResult.data.name, countryResult.data.name)
        analysisOutput = { ...output, result: output.result as unknown as Record<string, unknown> }
      } else if (analysis_type === 'review_analysis') {
        const output = await analyzeReviews(combinedContent, catResult.data.name, countryResult.data.name)
        analysisOutput = { ...output, result: output.result as unknown as Record<string, unknown> }
      } else {
        const hasRufus = filesToProcess.some((f) => f.fileType === 'rufus_qna')
        const output = await analyzeQnA(combinedContent, catResult.data.name, countryResult.data.name, hasRufus)
        analysisOutput = { ...output, result: output.result as unknown as Record<string, unknown> }
      }

      // Save completed analysis
      const { data: updated, error: updateError } = await adminClient
        .from('lb_research_analysis')
        .update({
          analysis_result: analysisOutput.result,
          model_used: analysisOutput.model,
          tokens_used: analysisOutput.tokensUsed,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', analysisRow.id)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ data: updated })
    } catch (claudeError) {
      const errorMessage = claudeError instanceof Error ? claudeError.message : 'Claude analysis failed'

      await adminClient
        .from('lb_research_analysis')
        .update({
          status: 'failed',
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', analysisRow.id)

      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
