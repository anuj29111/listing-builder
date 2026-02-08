'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LbUser } from '@/types'

interface UsersTabProps {
  initialUsers: LbUser[]
  currentUserId: string
}

export function UsersTab({ initialUsers, currentUserId }: UsersTabProps) {
  const [users, setUsers] = useState<LbUser[]>(initialUsers)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdatingId(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update role')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, role: newRole as 'admin' | 'user' } : u
        )
      )
      toast.success(`Role updated to ${newRole}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Users</h3>
        <p className="text-sm text-muted-foreground">
          Manage user roles and access levels.
        </p>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users"
          description="Users will appear here after they log in."
          className="py-12"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3">User</th>
                <th className="text-left font-medium p-3">Email</th>
                <th className="text-left font-medium p-3">Role</th>
                <th className="text-left font-medium p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isCurrentUser = user.id === currentUserId
                return (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                            {(user.full_name || user.email)
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium flex items-center gap-1.5">
                            {user.full_name || 'No name'}
                            {isCurrentUser && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      {isCurrentUser ? (
                        <Badge
                          variant={
                            user.role === 'admin' ? 'default' : 'secondary'
                          }
                        >
                          {user.role}
                        </Badge>
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(val) =>
                            handleRoleChange(user.id, val)
                          }
                          disabled={updatingId === user.id}
                        >
                          <SelectTrigger className="w-24 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="user">user</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
