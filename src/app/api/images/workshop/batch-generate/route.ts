import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { generateAndStoreImage } from '@/lib/image-generation'
import type { BatchGenerateRequest, BatchGenerateResponse } from '@/types/api'
import type { LbImageGeneration } from '@/types/database'

const BATCH_SIZE = 3 // Max concurrent image generations

export async function POST(request: Request) {
  try {
    const { lbUser } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const body = (await request.json()) as BatchGenerateRequest

    const { workshop_id, prompts, provider, orientation, model_id, image_type } = body

    if (!workshop_id || !prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json(
        { error: 'workshop_id and at least one prompt are required' },
        { status: 400 }
      )
    }

    if (!provider || !['dalle3', 'gemini', 'higgsfield'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Verify workshop exists
    const { data: workshop } = await adminClient
      .from('lb_image_workshops')
      .select('id')
      .eq('id', workshop_id)
      .single()

    if (!workshop) {
      return NextResponse.json({ error: 'Workshop not found' }, { status: 404 })
    }

    const results: BatchGenerateResponse['results'] = []

    // Process in batches of BATCH_SIZE concurrent requests
    for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
      const batch = prompts.slice(i, i + BATCH_SIZE)
      const settled = await Promise.allSettled(
        batch.map(({ prompt, position }) =>
          generateAndStoreImage({
            prompt,
            provider,
            orientation: orientation || 'square',
            modelId: model_id,
            workshopId: workshop_id,
            imageType: image_type || 'main',
            position: position ?? null,
            createdBy: lbUser.id,
            adminClient,
          })
        )
      )

      for (let j = 0; j < settled.length; j++) {
        const result = settled[j]
        const label = batch[j].label
        if (result.status === 'fulfilled') {
          results.push({ label, image: result.value as LbImageGeneration, error: null })
        } else {
          const errorMsg = result.reason instanceof Error ? result.reason.message : 'Generation failed'
          console.error(`Batch image failed [${label}]:`, result.reason)
          results.push({ label, image: null, error: errorMsg })
        }
      }
    }

    const succeeded = results.filter((r) => r.image !== null).length
    const failed = results.filter((r) => r.image === null).length

    // Update workshop to step 2 after batch generation
    await adminClient
      .from('lb_image_workshops')
      .update({ step: 2, updated_at: new Date().toISOString() })
      .eq('id', workshop_id)

    return NextResponse.json({
      data: {
        results,
        total: results.length,
        succeeded,
        failed,
      } satisfies BatchGenerateResponse,
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Batch generation error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
