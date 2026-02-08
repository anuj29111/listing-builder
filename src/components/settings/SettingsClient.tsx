'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoriesTab } from '@/components/settings/CategoriesTab'
import { UsersTab } from '@/components/settings/UsersTab'
import { AdminSettingsTab } from '@/components/settings/AdminSettingsTab'
import type { LbUser, LbCategory, LbAdminSetting } from '@/types'

interface SettingsClientProps {
  currentUser: LbUser
  categories: LbCategory[]
  users: LbUser[]
  settings: LbAdminSetting[]
}

export function SettingsClient({
  currentUser,
  categories,
  users,
  settings,
}: SettingsClientProps) {
  const isAdmin = currentUser.role === 'admin'

  return (
    <Tabs defaultValue="categories">
      <TabsList>
        <TabsTrigger value="categories">Categories</TabsTrigger>
        {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
        {isAdmin && <TabsTrigger value="admin-settings">Admin Settings</TabsTrigger>}
      </TabsList>

      <TabsContent value="categories">
        <CategoriesTab initialCategories={categories} />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="users">
          <UsersTab initialUsers={users} currentUserId={currentUser.id} />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="admin-settings">
          <AdminSettingsTab initialSettings={settings} />
        </TabsContent>
      )}
    </Tabs>
  )
}
