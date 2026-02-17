import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyzeKeywords, analyzeReviews, analyzeQnA, convertAnalysisFile, mergeAnalysisResults } from '@/lib/claude'
import type { AnalysisType, AnalysisSource, FileType } from '@/types'

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
    const { category_id, country_id, analysis_type, source } = body as {
      category_id: string
      country_id: string
      analysis_type: AnalysisType
      source?: AnalysisSource
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

    const validSources: AnalysisSource[] = ['csv', 'file', 'merged']
    const effectiveSource: AnalysisSource = source && validSources.includes(source) ? source : 'csv'

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

    // ── MERGED path: reads from existing DB records, no file downloads ──
    if (effectiveSource === 'merged') {
      return await handleMerge(adminClient, supabase, {
        category_id, country_id, analysis_type, lbUserId: lbUser.id,
        categoryName: catResult.data.name, countryName: countryResult.data.name,
      })
    }

    // ── CSV or FILE or PRIMARY path: download files from storage ──

    // Check for pre-analyzed file
    const analysisFileType = ANALYSIS_FILE_TYPES[analysis_type]
    const { data: analysisFiles } = await supabase
      .from('lb_research_files')
      .select('id, file_type, storage_path, file_name')
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .eq('file_type', analysisFileType)
      .order('created_at', { ascending: false })
      .limit(1)

    // Check for raw CSV files
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

    const hasAnalysisFile = !!(analysisFiles && analysisFiles.length > 0)
    const hasRawFiles = !!(rawFiles && rawFiles.length > 0)

    // Determine what to process based on source
    let useAnalysisFile = false
    let useRawFiles = false

    if (effectiveSource === 'csv') {
      if (!hasRawFiles) {
        return NextResponse.json({ error: 'No raw CSV files found to analyze.' }, { status: 400 })
      }
      useRawFiles = true
    } else if (effectiveSource === 'file') {
      if (!hasAnalysisFile) {
        return NextResponse.json({ error: 'No analysis file found to import.' }, { status: 400 })
      }
      useAnalysisFile = true
    } else {
      // Default to CSV analysis when no specific source requested
      if (!hasRawFiles) {
        return NextResponse.json(
          { error: `No raw CSV files found to analyze.` },
          { status: 400 }
        )
      }
      useRawFiles = true
    }

    // Collect source file IDs for the record
    const sourceFileIds = [
      ...(useAnalysisFile && hasAnalysisFile ? analysisFiles.map((f) => f.id) : []),
      ...(useRawFiles && hasRawFiles ? rawFiles.map((f) => f.id) : []),
    ]

    // Delete existing record for this source, then create new processing record
    await adminClient
      .from('lb_research_analysis')
      .delete()
      .eq('category_id', category_id)
      .eq('country_id', country_id)
      .eq('analysis_type', analysis_type)
      .eq('source', effectiveSource)

    const { data: analysisRow, error: insertError } = await adminClient
      .from('lb_research_analysis')
      .insert({
        category_id,
        country_id,
        analysis_type,
        source: effectiveSource,
        source_file_ids: sourceFileIds,
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

      if (useAnalysisFile) {
        // Import pre-analyzed file
        const analysisFile = analysisFiles![0]
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('lb-research-files')
          .download(analysisFile.storage_path)
        if (downloadError || !fileData) {
          throw new Error(`Failed to download ${analysisFile.file_name}: ${downloadError?.message}`)
        }
        const content = await fileData.text()

        // Try direct JSON import first (zero cost)
        try {
          const parsed = JSON.parse(content)
          if (parsed && typeof parsed === 'object' && ('summary' in parsed)) {
            analysisOutput = { result: parsed as Record<string, unknown>, model: 'direct-json-import', tokensUsed: 0 }
          } else {
            throw new Error('JSON missing expected structure')
          }
        } catch {
          const output = await convertAnalysisFile(content, analysis_type)
          analysisOutput = { ...output, result: output.result as unknown as Record<string, unknown> }
        }
      } else {
        // Analyze raw CSV files
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
          filesToProcess.push({ id: file.id, fileType: file.file_type, content: await fileData.text() })
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
        .update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() })
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

// ── Merge handler: combines two existing completed analyses from DB ──
async function handleMerge(
  adminClient: ReturnType<typeof createAdminClient>,
  supabase: ReturnType<typeof createClient>,
  opts: {
    category_id: string
    country_id: string
    analysis_type: AnalysisType
    lbUserId: string
    categoryName: string
    countryName: string
  }
) {
  const { category_id, country_id, analysis_type, lbUserId, categoryName, countryName } = opts

  // Fetch the csv and file source records
  const { data: sourceRecords, error: fetchError } = await supabase
    .from('lb_research_analysis')
    .select('id, source, analysis_result, status')
    .eq('category_id', category_id)
    .eq('country_id', country_id)
    .eq('analysis_type', analysis_type)
    .in('source', ['csv', 'file'])

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const csvRecord = sourceRecords?.find((r) => r.source === 'csv' && r.status === 'completed')
  const fileRecord = sourceRecords?.find((r) => r.source === 'file' && r.status === 'completed')

  if (!csvRecord || !fileRecord) {
    return NextResponse.json(
      { error: 'Both CSV analysis and imported file must be completed before merging.' },
      { status: 400 }
    )
  }

  // Delete existing merged record if any, then create processing record
  await adminClient
    .from('lb_research_analysis')
    .delete()
    .eq('category_id', category_id)
    .eq('country_id', country_id)
    .eq('analysis_type', analysis_type)
    .eq('source', 'merged')

  const { data: mergeRow, error: insertError } = await adminClient
    .from('lb_research_analysis')
    .insert({
      category_id,
      country_id,
      analysis_type,
      source: 'merged',
      source_file_ids: [],
      status: 'processing',
      analyzed_by: lbUserId,
    })
    .select()
    .single()

  if (insertError || !mergeRow) {
    return NextResponse.json(
      { error: `Failed to create merge record: ${insertError?.message}` },
      { status: 500 }
    )
  }

  try {
    const csvResult = csvRecord.analysis_result as Record<string, unknown>
    const fileResult = fileRecord.analysis_result as Record<string, unknown>

    const output = await mergeAnalysisResults(csvResult, fileResult, analysis_type, categoryName, countryName)

    const { data: updated, error: updateError } = await adminClient
      .from('lb_research_analysis')
      .update({
        analysis_result: output.result,
        model_used: output.model,
        tokens_used: output.tokensUsed,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', mergeRow.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: updated })
  } catch (mergeError) {
    const errorMessage = mergeError instanceof Error ? mergeError.message : 'Merge failed'
    await adminClient
      .from('lb_research_analysis')
      .update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() })
      .eq('id', mergeRow.id)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
