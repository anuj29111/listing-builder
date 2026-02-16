import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyzeKeywords, analyzeReviews, analyzeQnA, convertAnalysisFile } from '@/lib/claude'
import type { AnalysisType, FileType } from '@/types'

// Maps analysis_type → raw CSV file types
const RAW_FILE_TYPES: Record<AnalysisType, FileType[]> = {
  keyword_analysis: ['keywords'],
  review_analysis: ['reviews'],
  qna_analysis: ['qna', 'rufus_qna'],
}

// Maps analysis_type → pre-analyzed file type
const ANALYSIS_FILE_TYPES: Record<AnalysisType, FileType> = {
  keyword_analysis: 'keywords_analysis',
  review_analysis: 'reviews_analysis',
  qna_analysis: 'qna_analysis',
}

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

    // Check for pre-analyzed file FIRST (cheaper path)
    const analysisFileType = ANALYSIS_FILE_TYPES[analysis_type]
    const { data: analysisFiles } = await supabase
      .from('lb_research_files')
      .select('id, file_type, storage_path, file_name')
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .eq('file_type', analysisFileType)
      .order('created_at', { ascending: false })
      .limit(1)

    // Fall back to raw CSV files
    const rawFileTypes = RAW_FILE_TYPES[analysis_type]
    const { data: rawFiles, error: filesError } = await supabase
      .from('lb_research_files')
      .select('id, file_type, storage_path, file_name')
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .in('file_type', rawFileTypes)
      .order('created_at', { ascending: false })

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 })
    }

    const hasAnalysisFile = analysisFiles && analysisFiles.length > 0
    const hasRawFiles = rawFiles && rawFiles.length > 0

    if (!hasAnalysisFile && !hasRawFiles) {
      return NextResponse.json(
        { error: `No files found for ${analysis_type}. Upload raw data CSV or an analysis file.` },
        { status: 400 }
      )
    }

    // Determine which files to use — prefer pre-analyzed over raw
    const allSourceFiles = [
      ...(hasAnalysisFile ? analysisFiles : []),
      ...(hasRawFiles ? rawFiles : []),
    ]

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
        source_file_ids: allSourceFiles.map((f) => f.id),
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

    try {
      let analysisOutput: { result: Record<string, unknown>; model: string; tokensUsed: number }

      // PATH 1: Pre-analyzed file exists → use it (cheap or free)
      if (hasAnalysisFile) {
        const analysisFile = analysisFiles[0]

        const { data: fileData, error: downloadError } = await supabase.storage
          .from('lb-research-files')
          .download(analysisFile.storage_path)

        if (downloadError || !fileData) {
          throw new Error(`Failed to download ${analysisFile.file_name}: ${downloadError?.message}`)
        }

        const content = await fileData.text()

        // Try to parse as JSON directly (zero AI cost)
        try {
          const parsed = JSON.parse(content)
          // Validate it has expected top-level keys
          if (parsed && typeof parsed === 'object' && ('summary' in parsed)) {
            analysisOutput = {
              result: parsed as Record<string, unknown>,
              model: 'direct-json-import',
              tokensUsed: 0,
            }
          } else {
            throw new Error('JSON missing expected structure')
          }
        } catch {
          // Not valid JSON or missing structure → use lightweight AI conversion
          const output = await convertAnalysisFile(content, analysis_type)
          analysisOutput = { ...output, result: output.result as unknown as Record<string, unknown> }
        }
      }
      // PATH 2: Raw CSV files → full AI analysis (expensive)
      else {
        // Download CSV content from storage (use the most recent file per type)
        const seenTypes = new Set<string>()
        const filesToProcess: Array<{ id: string; fileType: string; content: string }> = []

        for (const file of rawFiles!) {
          if (seenTypes.has(file.file_type)) continue
          seenTypes.add(file.file_type)

          const { data: fileData, error: downloadError } = await supabase.storage
            .from('lb-research-files')
            .download(file.storage_path)

          if (downloadError || !fileData) {
            throw new Error(`Failed to download ${file.file_name}: ${downloadError?.message}`)
          }

          const content = await fileData.text()
          filesToProcess.push({ id: file.id, fileType: file.file_type, content })
        }

        const combinedContent = filesToProcess.map((f) => f.content).join('\n\n')

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
    } catch (analysisError) {
      const errorMessage = analysisError instanceof Error ? analysisError.message : 'Analysis failed'

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
