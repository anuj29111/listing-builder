import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AnalysisPageClient } from '@/components/research/AnalysisPageClient'

interface AnalysisPageProps {
  params: { categoryId: string; countryId: string }
}

export default async function AnalysisPage({ params }: AnalysisPageProps) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { categoryId, countryId } = params

  // Fetch category, country, files, and analyses in parallel
  const [catResult, countryResult, filesResult, analysesResult] = await Promise.all([
    supabase.from('lb_categories').select('*').eq('id', categoryId).single(),
    supabase.from('lb_countries').select('*').eq('id', countryId).single(),
    supabase
      .from('lb_research_files')
      .select('id, file_type, file_name, row_count, created_at')
      .eq('category_id', categoryId)
      .eq('country_id', countryId)
      .order('created_at', { ascending: false }),
    supabase
      .from('lb_research_analysis')
      .select('*')
      .eq('category_id', categoryId)
      .eq('country_id', countryId)
      .order('updated_at', { ascending: false }),
  ])

  if (!catResult.data || !countryResult.data) {
    redirect('/research')
  }

  const category = catResult.data
  const country = countryResult.data
  const files = filesResult.data || []
  const analyses = analysesResult.data || []

  // Get unique file types that have been uploaded
  const availableFileTypes = Array.from(new Set(files.map((f) => f.file_type)))

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href="/research" className="hover:text-foreground transition-colors">
            Research
          </Link>
          <span>/</span>
          <span>{category.name}</span>
          <span>/</span>
          <span>
            {country.flag_emoji} {country.name}
          </span>
        </div>
        <h1 className="text-2xl font-bold">
          {category.name} — {country.flag_emoji} {country.name}
        </h1>
        <p className="text-muted-foreground mt-1">
          Research analysis for {category.brand} / {category.name} in{' '}
          {country.name} ({country.code})
        </p>
      </div>

      {/* Files Summary */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold text-sm mb-2">Uploaded Research Files</h3>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No files uploaded yet.{' '}
            <Link
              href={`/research?category=${categoryId}&country=${countryId}`}
              className="text-primary hover:underline"
            >
              Upload files
            </Link>{' '}
            to get started.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['keywords', 'reviews', 'qna', 'rufus_qna'] as const).map((ft) => {
              const ftFiles = files.filter((f) => f.file_type === ft)
              const labels: Record<string, string> = {
                keywords: 'Keywords',
                reviews: 'Reviews',
                qna: 'Q&A',
                rufus_qna: 'Rufus Q&A',
              }
              return (
                <div
                  key={ft}
                  className={`rounded-lg border p-3 text-center ${ftFiles.length > 0 ? 'border-green-200 bg-green-50' : 'bg-muted/30'}`}
                >
                  <p className="text-xs text-muted-foreground">{labels[ft]}</p>
                  <p className="text-lg font-bold">{ftFiles.length}</p>
                  {ftFiles.length > 0 && ftFiles[0].row_count && (
                    <p className="text-xs text-muted-foreground">
                      {ftFiles[0].row_count.toLocaleString()} rows
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Analysis Panel (client component) */}
      <AnalysisPageClient
        categoryId={categoryId}
        countryId={countryId}
        initialAnalyses={analyses as never[]}
        availableFileTypes={availableFileTypes}
      />
    </div>
  )
}
