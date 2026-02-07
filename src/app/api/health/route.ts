import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'listing-builder',
    version: '0.0.0',
    timestamp: new Date().toISOString(),
  })
}
