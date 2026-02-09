import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateDalleImage, orientationToSize } from '@/lib/openai'
import { generateGeminiImage, orientationToAspect } from '@/lib/gemini'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    const { data: image, error } = await supabase
      .from('lb_image_generations')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Fetch chat history if exists
    const { data: chat } = await supabase
      .from('lb_image_chats')
      .select('*')
      .eq('image_generation_id', params.id)
      .single()

    return NextResponse.json({
      data: { image, chat: chat || null },
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
    const body = await request.json()

    const { action } = body as { action: 'approve' | 'reject' }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    // Fetch current image
    const { data: image, error: fetchError } = await adminClient
      .from('lb_image_generations')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    if (action === 'reject') {
      const { data, error } = await adminClient
        .from('lb_image_generations')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ data: { image: data } })
    }

    // Approve: re-generate at HD quality and store as full_url
    let fullUrl: string | null = null

    try {
      if (image.provider === 'dalle3') {
        const result = await generateDalleImage({
          prompt: image.prompt,
          size: orientationToSize('square'),
          quality: 'hd',
        })

        const imageResponse = await fetch(result.url)
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
        const fileName = `dalle3/hd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`

        const { error: uploadError } = await adminClient.storage
          .from('lb-images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/png',
            upsert: false,
          })

        if (!uploadError) {
          const { data: publicUrl } = adminClient.storage
            .from('lb-images')
            .getPublicUrl(fileName)
          fullUrl = publicUrl.publicUrl
        }
      } else {
        const result = await generateGeminiImage({
          prompt: image.prompt,
          aspectRatio: orientationToAspect('square'),
        })

        const imageBuffer = Buffer.from(result.base64Data, 'base64')
        const ext = result.mimeType.includes('png') ? 'png' : 'webp'
        const fileName = `gemini/hd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: uploadError } = await adminClient.storage
          .from('lb-images')
          .upload(fileName, imageBuffer, {
            contentType: result.mimeType,
            upsert: false,
          })

        if (!uploadError) {
          const { data: publicUrl } = adminClient.storage
            .from('lb-images')
            .getPublicUrl(fileName)
          fullUrl = publicUrl.publicUrl
        }
      }
    } catch (hdError) {
      console.error('HD generation failed, approving with preview only:', hdError)
      // Still approve even if HD fails — user has the preview
    }

    const additionalCost = image.provider === 'dalle3' ? 8 : 2

    const { data, error } = await adminClient
      .from('lb_image_generations')
      .update({
        status: 'approved',
        full_url: fullUrl,
        cost_cents: image.cost_cents + additionalCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: { image: data } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Image approve/reject error:', e)
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

    // Fetch image to get storage paths
    const { data: image } = await adminClient
      .from('lb_image_generations')
      .select('preview_url, full_url')
      .eq('id', params.id)
      .single()

    // Delete DB record
    const { error } = await adminClient
      .from('lb_image_generations')
      .delete()
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Clean up storage (best-effort)
    if (image) {
      const pathsToDelete: string[] = []
      if (image.preview_url) {
        const match = image.preview_url.match(/lb-images\/(.+)$/)
        if (match) pathsToDelete.push(match[1])
      }
      if (image.full_url) {
        const match = image.full_url.match(/lb-images\/(.+)$/)
        if (match) pathsToDelete.push(match[1])
      }
      if (pathsToDelete.length > 0) {
        await adminClient.storage.from('lb-images').remove(pathsToDelete)
      }
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
