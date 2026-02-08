import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser()
    const supabase = createClient()

    // Get the file record for storage path
    const { data: file, error: fetchError } = await supabase
      .from('lb_research_files')
      .select('storage_path')
      .eq('id', params.id)
      .single()

    if (fetchError || !file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('lb-research-files')
      .remove([file.storage_path])

    if (storageError) {
      console.error('Storage delete warning:', storageError.message)
      // Continue with DB delete even if storage fails
    }

    // Delete DB record
    const { error: dbError } = await supabase
      .from('lb_research_files')
      .delete()
      .eq('id', params.id)

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    if (message === 'Not authenticated') {
      return NextResponse.json({ error: message }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
