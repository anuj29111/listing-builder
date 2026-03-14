import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProductCatalogPage } from '@/components/products/ProductCatalogPage'

export default async function ProductsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [productsResult, categoriesResult, countriesResult] = await Promise.all([
    supabase
      .from('lb_products')
      .select('*')
      .order('display_order', { ascending: true })
      .order('parent_name', { ascending: true, nullsFirst: false })
      .order('product_name')
      .limit(500),
    supabase
      .from('lb_products')
      .select('category')
      .order('category'),
    supabase
      .from('lb_countries')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ])

  const products = productsResult.data || []
  const categories = Array.from(
    new Set((categoriesResult.data || []).map((r) => r.category))
  )
  const countries = countriesResult.data || []

  return (
    <ProductCatalogPage
      initialProducts={products}
      categories={categories}
      countries={countries}
    />
  )
}
