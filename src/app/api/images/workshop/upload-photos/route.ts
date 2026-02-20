import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const formData = await request.formData()
    const workshopId = formData.get('workshop_id') as string
    const files = formData.getAll('photos') as File[]

    if (!workshopId) {
      return NextResponse.json(
        { error: 'workshop_id is required' },
        { status: 400 }
      )
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'At least one photo is required' },
        { status: 400 }
      )
    }

    if (files.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 photos allowed' },
        { status: 400 }
      )
    }

    // Upload each photo to Supabase Storage
    const photoUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `product-photos/${workshopId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: uploadError } = await adminClient.storage
        .from('lb-images')
        .upload(fileName, buffer, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      const { data: urlData } = adminClient.storage
        .from('lb-images')
        .getPublicUrl(fileName)

      if (urlData?.publicUrl) {
        photoUrls.push(urlData.publicUrl)
      }
    }

    if (photoUrls.length === 0) {
      return NextResponse.json(
        { error: 'Failed to upload any photos' },
        { status: 500 }
      )
    }

    // Get existing photos and append
    const { data: workshop } = await adminClient
      .from('lb_image_workshops')
      .select('product_photos')
      .eq('id', workshopId)
      .single()

    const existingPhotos = (workshop?.product_photos as string[]) || []
    const allPhotos = [...existingPhotos, ...photoUrls]

    // Update workshop with new photo URLs
    const { error: updateError } = await adminClient
      .from('lb_image_workshops')
      .update({
        product_photos: allPhotos,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workshopId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: {
        photo_urls: photoUrls,
        all_photos: allPhotos,
      },
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Upload photos error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
