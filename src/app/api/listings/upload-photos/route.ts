import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const formData = await request.formData()
    const files = formData.getAll('photos') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'At least one photo is required' },
        { status: 400 }
      )
    }

    if (files.length > 15) {
      return NextResponse.json(
        { error: 'Maximum 15 photos allowed' },
        { status: 400 }
      )
    }

    const photoUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `listing-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

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

    return NextResponse.json({
      data: { photo_urls: photoUrls },
    }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Upload listing photos error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
