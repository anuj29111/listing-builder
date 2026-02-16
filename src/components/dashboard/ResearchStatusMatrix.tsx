'use client'

import { useRouter } from 'next/navigation'
import { FILE_TYPE_SHORT_LABELS } from '@/lib/constants'

// Only show raw data file types in the coverage matrix (not analysis files)
const MATRIX_FILE_TYPES = ['keywords', 'reviews', 'qna', 'rufus_qna'] as const

interface StatusMatrixProps {
  categories: Array<{
    id: string
    name: string
    slug: string
    brand: string
  }>
  countries: Array<{
    id: string
    name: string
    code: string
    flag_emoji: string | null
  }>
  coverage: Record<string, string[]>
}

const fileTypeColors: Record<string, string> = {
  keywords: 'bg-green-500',
  reviews: 'bg-blue-500',
  qna: 'bg-orange-500',
  rufus_qna: 'bg-purple-500',
}

const brandColors: Record<string, string> = {
  Chalkola: 'bg-blue-100 text-blue-800',
  Spedalon: 'bg-green-100 text-green-800',
  Funcils: 'bg-purple-100 text-purple-800',
  Other: 'bg-gray-100 text-gray-800',
}

export function ResearchStatusMatrix({
  categories,
  countries,
  coverage,
}: StatusMatrixProps) {
  const router = useRouter()

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        No categories created yet. Add categories in Settings to see the
        research coverage matrix.
      </div>
    )
  }

  function handleCellClick(categoryId: string, countryId: string) {
    router.push(`/research?category=${categoryId}&country=${countryId}`)
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Research Coverage</h3>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          {MATRIX_FILE_TYPES.map((key) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${fileTypeColors[key]}`}
              />
              {FILE_TYPE_SHORT_LABELS[key]}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3 sticky left-0 bg-muted/50 z-10 min-w-[160px]">
                Category
              </th>
              {countries.map((country) => (
                <th
                  key={country.id}
                  className="text-center font-medium p-3 min-w-[80px]"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{country.flag_emoji || country.code}</span>
                    <span className="text-xs">{country.code}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-b last:border-0">
                <td className="p-3 sticky left-0 bg-card z-10">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{category.name}</span>
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                        brandColors[category.brand] || brandColors.Other
                      }`}
                    >
                      {category.brand}
                    </span>
                  </div>
                </td>
                {countries.map((country) => {
                  const key = `${category.id}:${country.id}`
                  const types = coverage[key] || []
                  return (
                    <td
                      key={country.id}
                      className="p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        handleCellClick(category.id, country.id)
                      }
                    >
                      {types.length === 0 ? (
                        <span className="text-muted-foreground/30">-</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          {Object.keys(fileTypeColors).map((ft) => (
                            <span
                              key={ft}
                              className={`inline-block h-2.5 w-2.5 rounded-full ${
                                types.includes(ft)
                                  ? fileTypeColors[ft]
                                  : 'bg-muted'
                              }`}
                              title={FILE_TYPE_SHORT_LABELS[ft]}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
