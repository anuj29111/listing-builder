import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyzeProductPhotos } from '@/lib/claude'

// Allow up to 5 minutes for Claude vision photo analysis
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser()
    const body = await request.json()

    const { photo_urls, product_name, brand } = body as {
      photo_urls: string[]
      product_name: string
      brand: string
    }

    if (!photo_urls || photo_urls.length === 0) {
      return NextResponse.json(
        { error: 'photo_urls is required' },
        { status: 400 }
      )
    }

    if (!product_name) {
      return NextResponse.json(
        { error: 'product_name is required' },
        { status: 400 }
      )
    }

    const { descriptions, model, tokensUsed } = await analyzeProductPhotos({
      photoUrls: photo_urls,
      productName: product_name,
      brand: brand || '',
    })

    return NextResponse.json({
      data: { descriptions, model, tokensUsed },
    }, { status: 200 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    console.error('Analyze listing photos error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
