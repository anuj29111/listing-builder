import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateOpenAIImage, orientationToSize } from '@/lib/openai'
import { generateGeminiImage, orientationToAspect } from '@/lib/gemini'
import type { ChatMessage } from '@/types/api'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data: chat } = await supabase
      .from('lb_image_chats')
      .select('*')
      .eq('image_generation_id', params.id)
      .single()

    return NextResponse.json({
      data: {
        chat_id: chat?.id || null,
        messages: (chat?.messages as ChatMessage[]) || [],
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

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const supabase = createClient()
    const adminClient = createAdminClient()
    const body = await request.json()

    const { message } = body as { message: string }

    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return NextResponse.json({ error: 'Message must be at least 2 characters' }, { status: 400 })
    }

    // Fetch the image
    const { data: image, error: imgError } = await supabase
      .from('lb_image_generations')
      .select('*')
      .eq('id', params.id)
      .single()

    if (imgError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Refine prompt based on user feedback
    const refinedPrompt = `${image.prompt}\n\nUser refinement: ${message.trim()}`

    // Re-generate with refined prompt
    let previewUrl: string
    let storagePath: string
    let costCents = 0

    if (image.provider === 'openai') {
      const result = await generateOpenAIImage({
        prompt: refinedPrompt,
        size: orientationToSize('square'),
        quality: 'medium',
      })

      const imageBuffer = Buffer.from(result.base64Data, 'base64')
      const fileName = `openai/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`

      const { error: uploadError } = await adminClient.storage
        .from('lb-images')
        .upload(fileName, imageBuffer, { contentType: 'image/png', upsert: false })

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

      const { data: publicUrl } = adminClient.storage.from('lb-images').getPublicUrl(fileName)
      previewUrl = publicUrl.publicUrl
      storagePath = fileName
      costCents = 4
    } else {
      const result = await generateGeminiImage({
        prompt: refinedPrompt,
        aspectRatio: orientationToAspect('square'),
      })

      const imageBuffer = Buffer.from(result.base64Data, 'base64')
      const ext = result.mimeType.includes('png') ? 'png' : 'webp'
      const fileName = `gemini/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await adminClient.storage
        .from('lb-images')
        .upload(fileName, imageBuffer, { contentType: result.mimeType, upsert: false })

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

      const { data: publicUrl } = adminClient.storage.from('lb-images').getPublicUrl(fileName)
      previewUrl = publicUrl.publicUrl
      storagePath = fileName
      costCents = 2
    }

    // Create new image record (sibling)
    const { data: newImage, error: insertError } = await adminClient
      .from('lb_image_generations')
      .insert({
        listing_id: image.listing_id,
        prompt: refinedPrompt,
        provider: image.provider,
        preview_url: previewUrl,
        full_url: null,
        status: 'preview',
        cost_cents: costCents,
        created_by: lbUser.id,
      })
      .select()
      .single()

    if (insertError || !newImage) {
      await adminClient.storage.from('lb-images').remove([storagePath])
      throw new Error(insertError?.message || 'Failed to save new image')
    }

    // Update chat history
    const now = new Date().toISOString()
    const userMsg: ChatMessage = { role: 'user', content: message.trim(), timestamp: now }
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: `Refined prompt and generated a new image. The updated prompt incorporates your feedback: "${message.trim()}"`,
      timestamp: now,
    }

    const { data: existingChat } = await supabase
      .from('lb_image_chats')
      .select('*')
      .eq('image_generation_id', params.id)
      .single()

    if (existingChat) {
      const existingMessages = (existingChat.messages as ChatMessage[]) || []
      await adminClient
        .from('lb_image_chats')
        .update({
          messages: [...existingMessages, userMsg, assistantMsg],
          updated_at: now,
        })
        .eq('id', existingChat.id)
    } else {
      await adminClient
        .from('lb_image_chats')
        .insert({
          image_generation_id: params.id,
          messages: [userMsg, assistantMsg],
        })
    }

    return NextResponse.json({
      data: {
        chat_id: existingChat?.id || null,
        refined_prompt: refinedPrompt,
        new_image: newImage,
      },
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Image chat error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
