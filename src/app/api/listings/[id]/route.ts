import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { SECTION_TYPES } from '@/lib/constants'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const listingId = params.id

    // Fetch listing with joins
    const { data: listing, error: listingError } = await supabase
      .from('lb_listings')
      .select(
        '*, product_type:lb_product_types(id, name, asin, category_id, attributes), country:lb_countries(id, name, code, flag_emoji, language, title_limit, bullet_limit, bullet_count, description_limit, search_terms_limit), creator:lb_users!created_by(full_name)'
      )
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Fetch sections
    const { data: sections, error: sectionsError } = await supabase
      .from('lb_listing_sections')
      .select('*')
      .eq('listing_id', listingId)

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

    return NextResponse.json({
      data: {
        ...listing,
        sections: sortedSections,
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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const listingId = params.id
    const body = await request.json()

    const { sections, status } = body

    // Update sections if provided
    if (sections && Array.isArray(sections)) {
      for (const section of sections) {
        if (!section.id) continue
        await adminClient
          .from('lb_listing_sections')
          .update({
            selected_variation: section.selected_variation,
            is_approved: section.is_approved,
            final_text: section.final_text !== undefined ? section.final_text : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', section.id)
          .eq('listing_id', listingId)
      }

      // Sync denormalized fields on lb_listings — prefer final_text over selected variation
      const { data: allSections } = await adminClient
        .from('lb_listing_sections')
        .select('section_type, variations, selected_variation, final_text')
        .eq('listing_id', listingId)

      if (allSections) {
        const getSelectedText = (sectionType: string): string => {
          const sec = allSections.find((s) => s.section_type === sectionType)
          if (!sec) return ''
          // Prefer final_text (user's edited version) over AI variation
          if (sec.final_text && sec.final_text.trim()) return sec.final_text
          const vars = sec.variations as string[]
          return vars[sec.selected_variation] || vars[0] || ''
        }

        const bulletPoints = [1, 2, 3, 4, 5].map((n) => getSelectedText(`bullet_${n}`))

        await adminClient
          .from('lb_listings')
          .update({
            title: getSelectedText('title'),
            bullet_points: bulletPoints,
            description: getSelectedText('description'),
            search_terms: getSelectedText('search_terms'),
            subject_matter: [getSelectedText('subject_matter')],
            updated_at: new Date().toISOString(),
          })
          .eq('id', listingId)
      }
    }

    // Update status if provided
    if (status) {
      const validStatuses = ['draft', 'review', 'approved', 'exported']
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      await adminClient
        .from('lb_listings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', listingId)
    }

    // Return updated listing with sections
    const { data: updated, error } = await adminClient
      .from('lb_listings')
      .select(
        '*, product_type:lb_product_types(name, asin, category_id), country:lb_countries(name, code, flag_emoji, language)'
      )
      .eq('id', listingId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: updatedSections } = await adminClient
      .from('lb_listing_sections')
      .select('*')
      .eq('listing_id', listingId)

    const sectionOrder = SECTION_TYPES.reduce(
      (acc, type, idx) => ({ ...acc, [type]: idx }),
      {} as Record<string, number>
    )
    const sortedSections = (updatedSections || []).sort(
      (a, b) => (sectionOrder[a.section_type] ?? 99) - (sectionOrder[b.section_type] ?? 99)
    )

    return NextResponse.json({
      data: { ...updated, sections: sortedSections },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const listingId = params.id

    const { error } = await adminClient
      .from('lb_listings')
      .delete()
      .eq('id', listingId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: { success: true } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
