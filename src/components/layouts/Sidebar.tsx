'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import {
  LayoutDashboard,
  Search,
  FileText,
  Image,
  Sparkles,
  Package,
  Store,
  ScanSearch,
  Bot,
  Settings,
  ChevronLeft,
  Shield,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/research', label: 'Research', icon: Search },
  { href: '/listings', label: 'Listings', icon: FileText },
  { href: '/images', label: 'Images', icon: Image },
  { href: '/aplus', label: 'A+ Content', icon: Sparkles },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/seller-pull', label: 'Seller Pull', icon: Store },
  { href: '/asin-lookup', label: 'ASIN Lookup', icon: ScanSearch },
  { href: '/rufus-qna', label: 'Rufus Q&A', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  userRole: 'admin' | 'user'
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()
  const { sidebarOpen, toggleSidebar } = useUIStore()

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      <div className="flex items-center justify-between h-14 px-4 border-b">
        {sidebarOpen && <span className="text-lg font-bold">LB</span>}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-accent"
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform',
              !sidebarOpen && 'rotate-180'
            )}
          />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname?.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'sidebar-link',
                isActive && 'sidebar-link-active'
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {userRole === 'admin' && sidebarOpen && (
        <div className="p-3 border-t">
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>Admin</span>
          </div>
        </div>
      )}
    </aside>
  )
}
