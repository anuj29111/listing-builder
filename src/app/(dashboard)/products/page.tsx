import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProductMapper } from '@/components/products/ProductMapper'

export default async function ProductsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [productsResult, categoriesResult] = await Promise.all([
    supabase
      .from('lb_products')
      .select('*')
      .order('category')
      .order('parent_name', { ascending: true, nullsFirst: false })
      .order('product_name')
      .limit(500),
    supabase
      .from('lb_products')
      .select('category')
      .order('category'),
  ])

  const products = productsResult.data || []
  const categories = Array.from(
    new Set((categoriesResult.data || []).map((r) => r.category))
  )

  return <ProductMapper initialProducts={products} categories={categories} />
}
