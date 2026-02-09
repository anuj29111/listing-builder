import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { SECTION_TYPES, SECTION_TYPE_LABELS } from '@/lib/constants'

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { listing_id, export_type } = body

    if (!listing_id || !export_type) {
      return NextResponse.json(
        { error: 'listing_id and export_type are required' },
        { status: 400 }
      )
    }

    const validTypes = ['csv', 'clipboard', 'flat_file']
    if (!validTypes.includes(export_type)) {
      return NextResponse.json({ error: 'Invalid export_type' }, { status: 400 })
    }

    // Fetch listing + sections
    const { data: listing, error: listingError } = await supabase
      .from('lb_listings')
      .select('*, country:lb_countries(name, code)')
      .eq('id', listing_id)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const { data: sections, error: sectionsError } = await supabase
      .from('lb_listing_sections')
      .select('*')
      .eq('listing_id', listing_id)

    if (sectionsError) {
      return NextResponse.json({ error: sectionsError.message }, { status: 500 })
    }

    // Sort sections by SECTION_TYPES order
    const sectionOrder = SECTION_TYPES.reduce(
      (acc, type, idx) => ({ ...acc, [type]: idx }),
      {} as Record<string, number>
    )
    const sortedSections = (sections || []).sort(
      (a, b) => (sectionOrder[a.section_type] ?? 99) - (sectionOrder[b.section_type] ?? 99)
    )

    // Helper to get selected text from a section
    const getSelectedText = (sectionType: string): string => {
      const sec = sortedSections.find((s) => s.section_type === sectionType)
      if (!sec) return ''
      const vars = sec.variations as string[]
      return vars[sec.selected_variation] || vars[0] || ''
    }

    // Log the export
    const { data: exportLog } = await adminClient
      .from('lb_export_logs')
      .insert({
        listing_id,
        export_type,
        exported_by: lbUser.id,
      })
      .select('id')
      .single()

    let formatted: string | { headers: string[]; rows: string[][] }

    if (export_type === 'clipboard') {
      // Build formatted plain text
      const lines: string[] = []
      lines.push(`TITLE: ${getSelectedText('title')}`)
      lines.push('')
      for (let i = 1; i <= 5; i++) {
        lines.push(`BULLET ${i}: ${getSelectedText(`bullet_${i}`)}`)
      }
      lines.push('')
      lines.push(`DESCRIPTION:`)
      lines.push(getSelectedText('description'))
      lines.push('')
      lines.push(`SEARCH TERMS: ${getSelectedText('search_terms')}`)
      lines.push('')
      lines.push(`SUBJECT MATTER: ${getSelectedText('subject_matter')}`)

      formatted = lines.join('\n')
    } else if (export_type === 'csv') {
      // Build CSV data
      const headers = ['Section', 'Content', 'Character Count']
      const rows: string[][] = []

      for (const sectionType of SECTION_TYPES) {
        const text = getSelectedText(sectionType)
        const label = SECTION_TYPE_LABELS[sectionType] || sectionType
        rows.push([label, text, String(text.length)])
      }

      formatted = { headers, rows }
    } else {
      // flat_file format (Amazon Seller Central format)
      const headers = [
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
      const rows: string[][] = [
        [
          getSelectedText('title'),
          getSelectedText('bullet_1'),
          getSelectedText('bullet_2'),
          getSelectedText('bullet_3'),
          getSelectedText('bullet_4'),
          getSelectedText('bullet_5'),
          getSelectedText('description'),
          getSelectedText('search_terms'),
          getSelectedText('subject_matter'),
        ],
      ]

      formatted = { headers, rows }
    }

    return NextResponse.json({
      data: {
        formatted,
        export_log_id: exportLog?.id || null,
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
