import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { refineSection } from '@/lib/claude'
import { SECTION_TYPES, SECTION_TYPE_LABELS } from '@/lib/constants'
import type { ChatMessage } from '@/types/api'

const VALID_SECTIONS = new Set<string>(SECTION_TYPES)

export async function GET(
  request: Request,
  { params }: { params: { id: string; section: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()
    const { id: listingId, section } = params

    if (!VALID_SECTIONS.has(section)) {
      return NextResponse.json({ error: 'Invalid section type' }, { status: 400 })
    }

    const { data: chat } = await supabase
      .from('lb_listing_chats')
      .select('id, messages')
      .eq('listing_id', listingId)
      .eq('section_type', section)
      .single()

    return NextResponse.json({
      chat_id: chat?.id ?? null,
      messages: (chat?.messages ?? []) as ChatMessage[],
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; section: string } }
) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const { id: listingId, section } = params

    if (!VALID_SECTIONS.has(section)) {
      return NextResponse.json({ error: 'Invalid section type' }, { status: 400 })
    }

    const body = await request.json()
    const userMessage = body.message?.trim()
    if (!userMessage) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Fetch listing with product type + country + category
    const { data: listing, error: listingError } = await adminClient
      .from('lb_listings')
      .select(
        '*, product_type:lb_product_types(name, asin, category_id, lb_categories:lb_categories(name, brand)), country:lb_countries(name, language, title_limit, bullet_limit, description_limit, search_terms_limit)'
      )
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Fetch all sections for this listing
    const { data: sections, error: sectionsError } = await adminClient
      .from('lb_listing_sections')
      .select('*')
      .eq('listing_id', listingId)

    if (sectionsError || !sections) {
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 })
    }

    // Find the target section
    const targetSection = sections.find((s) => s.section_type === section)
    if (!targetSection) {
      return NextResponse.json({ error: 'Section not found for this listing' }, { status: 404 })
    }

    const currentVariations = (targetSection.variations || []) as string[]
    const selectedIndex = targetSection.selected_variation ?? 0

    // Build cascading context: approved sections that come BEFORE current section
    const currentSectionIndex = SECTION_TYPES.indexOf(section as typeof SECTION_TYPES[number])
    const approvedSections = sections
      .filter((s) => {
        const idx = SECTION_TYPES.indexOf(s.section_type as typeof SECTION_TYPES[number])
        return idx < currentSectionIndex && s.is_approved
      })
      .sort(
        (a, b) =>
          SECTION_TYPES.indexOf(a.section_type as typeof SECTION_TYPES[number]) -
          SECTION_TYPES.indexOf(b.section_type as typeof SECTION_TYPES[number])
      )
      .map((s) => ({
        label: SECTION_TYPE_LABELS[s.section_type] || s.section_type,
        selectedText: ((s.variations || []) as string[])[s.selected_variation ?? 0] || '',
      }))

    // Fetch existing chat history
    const { data: existingChat } = await adminClient
      .from('lb_listing_chats')
      .select('id, messages')
      .eq('listing_id', listingId)
      .eq('section_type', section)
      .single()

    const previousMessages = (existingChat?.messages ?? []) as ChatMessage[]

    // Extract product context from joins
    const productType = listing.product_type as { name: string; asin: string | null; category_id: string; lb_categories: { name: string; brand: string } } | null
    const country = listing.country as { name: string; language: string; title_limit: number; bullet_limit: number; description_limit: number; search_terms_limit: number } | null

    const productName = productType?.name || (listing.generation_context as Record<string, string>)?.productName || 'Unknown Product'
    const brand = productType?.lb_categories?.brand || (listing.generation_context as Record<string, string>)?.brand || ''
    const categoryName = productType?.lb_categories?.name || ''
    const countryName = country?.name || ''
    const language = country?.language || 'English'

    // Determine char limit for this section
    const charLimitMap: Record<string, number> = {
      title: country?.title_limit ?? 200,
      description: country?.description_limit ?? 2000,
      search_terms: country?.search_terms_limit ?? 250,
      subject_matter: country?.search_terms_limit ?? 250,
    }
    // Bullets 1-10 all use the same bullet_limit
    for (let i = 1; i <= 10; i++) {
      charLimitMap[`bullet_${i}`] = country?.bullet_limit ?? 250
    }
    const charLimit = charLimitMap[section] ?? 250

    // Call Claude
    const { refinedText, model, tokensUsed } = await refineSection({
      sectionType: section,
      sectionLabel: SECTION_TYPE_LABELS[section] || section,
      currentVariations,
      selectedVariationIndex: selectedIndex,
      charLimit,
      userMessage,
      approvedSections,
      productName,
      brand,
      categoryName,
      countryName,
      language,
      previousMessages,
    })

    // Add new variation to section
    const newVariations = [...currentVariations, refinedText]
    const newVariationIndex = newVariations.length - 1

    await adminClient
      .from('lb_listing_sections')
      .update({
        variations: newVariations,
        selected_variation: newVariationIndex,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetSection.id)

    // Build new messages
    const now = new Date().toISOString()
    const userMsg: ChatMessage = { role: 'user', content: userMessage, timestamp: now }
    const assistantMsg: ChatMessage = { role: 'assistant', content: refinedText, timestamp: now }
    const updatedMessages = [...previousMessages, userMsg, assistantMsg]

    // Upsert chat record
    let chatId: string
    if (existingChat) {
      await adminClient
        .from('lb_listing_chats')
        .update({
          messages: updatedMessages,
          model_used: model,
          updated_at: now,
        })
        .eq('id', existingChat.id)
      chatId = existingChat.id
    } else {
      const { data: newChat, error: chatError } = await adminClient
        .from('lb_listing_chats')
        .insert({
          listing_id: listingId,
          section_type: section,
          messages: updatedMessages,
          model_used: model,
        })
        .select('id')
        .single()

      if (chatError || !newChat) {
        // Section was already updated, chat just failed to save — still return success
        chatId = ''
      } else {
        chatId = newChat.id
      }
    }

    return NextResponse.json({
      chat_id: chatId,
      assistant_message: assistantMsg,
      new_variation: refinedText,
      new_variation_index: newVariationIndex,
      tokens_used: tokensUsed,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
