import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { SECTION_TYPES, SECTION_TYPE_LABELS } from '@/lib/constants'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const batchId = params.id
    const body = await request.json()

    const { export_type } = body as { export_type: string }

    const validTypes = ['csv', 'flat_file']
    if (!export_type || !validTypes.includes(export_type)) {
      return NextResponse.json(
        { error: 'export_type must be csv or flat_file' },
        { status: 400 }
      )
    }

    // Fetch batch job to verify it exists
    const { data: batchJob, error: batchError } = await supabase
      .from('lb_batch_jobs')
      .select('*')
      .eq('id', batchId)
      .single()

    if (batchError || !batchJob) {
      return NextResponse.json({ error: 'Batch job not found' }, { status: 404 })
    }

    // Fetch all listings for this batch
    const { data: listings, error: listingsError } = await supabase
      .from('lb_listings')
      .select('id, generation_context')
      .eq('batch_job_id', batchId)
      .order('created_at', { ascending: true })

    if (listingsError || !listings || listings.length === 0) {
      return NextResponse.json({ error: 'No listings found for this batch' }, { status: 404 })
    }

    // Fetch all sections for all listings in this batch
    const listingIds = listings.map((l) => l.id)
    const { data: allSections, error: sectionsError } = await supabase
      .from('lb_listing_sections')
      .select('*')
      .in('listing_id', listingIds)

    if (sectionsError) {
      return NextResponse.json({ error: sectionsError.message }, { status: 500 })
    }

    // Group sections by listing_id
    const sectionsByListing: Record<string, typeof allSections> = {}
    for (const section of allSections || []) {
      if (!sectionsByListing[section.listing_id]) {
        sectionsByListing[section.listing_id] = []
      }
      sectionsByListing[section.listing_id].push(section)
    }

    // Helper to get selected text from sections
    const getSelectedText = (
      sections: typeof allSections,
      sectionType: string
    ): string => {
      const sec = (sections || []).find((s) => s.section_type === sectionType)
      if (!sec) return ''
      const vars = sec.variations as string[]
      return vars[sec.selected_variation] || vars[0] || ''
    }

    // Log exports
    const exportLogIds: string[] = []
    for (const listing of listings) {
      const { data: exportLog } = await adminClient
        .from('lb_export_logs')
        .insert({
          listing_id: listing.id,
          export_type,
          exported_by: lbUser.id,
        })
        .select('id')
        .single()
      if (exportLog) exportLogIds.push(exportLog.id)
    }

    let formatted: { headers: string[]; rows: string[][] }

    if (export_type === 'csv') {
      // CSV: Product, Section, Content, Char Count
      const headers = ['Product', 'Section', 'Content', 'Character Count']
      const rows: string[][] = []

      for (const listing of listings) {
        const productName = (listing.generation_context as Record<string, string>)?.productName || 'Unknown'
        const sections = sectionsByListing[listing.id] || []

        for (const sectionType of SECTION_TYPES) {
          const text = getSelectedText(sections, sectionType)
          const label = SECTION_TYPE_LABELS[sectionType] || sectionType
          rows.push([productName, label, text, String(text.length)])
        }
      }

      formatted = { headers, rows }
    } else {
      // flat_file: Amazon Seller Central format — one row per listing
      const headers = [
        'product_name',
        'item_name',
        'bullet_point1',
        'bullet_point2',
        'bullet_point3',
        'bullet_point4',
        'bullet_point5',
        'product_description',
        'generic_keywords',
        'subject_matter',
      ]
      const rows: string[][] = []

      for (const listing of listings) {
        const productName = (listing.generation_context as Record<string, string>)?.productName || 'Unknown'
        const sections = sectionsByListing[listing.id] || []

        rows.push([
          productName,
          getSelectedText(sections, 'title'),
          getSelectedText(sections, 'bullet_1'),
          getSelectedText(sections, 'bullet_2'),
          getSelectedText(sections, 'bullet_3'),
          getSelectedText(sections, 'bullet_4'),
          getSelectedText(sections, 'bullet_5'),
          getSelectedText(sections, 'description'),
          getSelectedText(sections, 'search_terms'),
          getSelectedText(sections, 'subject_matter'),
        ])
      }

      formatted = { headers, rows }
    }

    return NextResponse.json({
      data: {
        formatted,
        listing_count: listings.length,
        export_log_ids: exportLogIds,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
