import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ResearchPageClient } from '@/components/research/ResearchPageClient'

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: { category?: string; country?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const defaultCategoryId = searchParams.category || null
  const defaultCountryId = searchParams.country || null

  // Fetch all initial data in parallel
  const [categoriesResult, countriesResult, coverageResult, filesResult] =
    await Promise.all([
      supabase
        .from('lb_categories')
        .select('*')
        .order('brand')
        .order('name'),
      supabase
        .from('lb_countries')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('lb_research_files')
        .select('category_id, country_id, file_type'),
      defaultCategoryId && defaultCountryId
        ? supabase
            .from('lb_research_files')
            .select(
              '*, category:lb_categories(name, slug, brand), country:lb_countries(name, code, flag_emoji), uploader:lb_users!uploaded_by(full_name)'
            )
            .eq('category_id', defaultCategoryId)
            .eq('country_id', defaultCountryId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ])

  // Build coverage map for status matrix
  const coverage: Record<string, string[]> = {}
  for (const file of coverageResult.data || []) {
    const key = `${file.category_id}:${file.country_id}`
    if (!coverage[key]) coverage[key] = []
    if (!coverage[key].includes(file.file_type)) {
      coverage[key].push(file.file_type)
    }
  }

  const categories = categoriesResult.data || []
  const countries = countriesResult.data || []

  return (
    <ResearchPageClient
      categories={categories}
      countries={countries}
      coverage={coverage}
      initialFiles={(filesResult.data as never[]) || []}
      defaultCategoryId={defaultCategoryId}
      defaultCountryId={defaultCountryId}
    />
  )
}
