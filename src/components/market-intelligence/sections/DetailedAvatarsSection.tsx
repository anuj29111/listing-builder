'use client'

import { UserCircle } from 'lucide-react'

interface DetailedAvatarsSectionProps {
  avatars: Array<{
    name: string
    initials: string
    role: string
    buyerPercentage: number
    demographics: { age: number; gender: string; location: string; income: string; purchaseFrequency: string }
    psychographics: { lifestyle: string; values: string[]; interests: string[] }
    buyingBehavior: string[]
    keyMotivations: string
  }>
}

export function DetailedAvatarsSection({ avatars }: DetailedAvatarsSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <UserCircle className="h-5 w-5 text-blue-500" />
        Detailed Customer Avatars
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {avatars.map((avatar, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-lg font-bold text-blue-700 dark:text-blue-300">
                {avatar.initials}
              </div>
              <div>
                <h4 className="font-semibold">{avatar.name}</h4>
                <p className="text-xs text-muted-foreground">{avatar.role} &middot; {avatar.buyerPercentage}% of buyers</p>
              </div>
            </div>

            {/* Demographics */}
            <div>
              <h5 className="text-sm font-semibold mb-1">Demographics</h5>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <span>Age: {avatar.demographics.age}</span>
                <span>Location: {avatar.demographics.location}</span>
                <span>Gender: {avatar.demographics.gender}</span>
                <span>Status: {avatar.demographics.purchaseFrequency}</span>
                <span>Income: {avatar.demographics.income}</span>
              </div>
            </div>

            {/* Psychographics */}
            <div>
              <h5 className="text-sm font-semibold mb-1">Psychographics</h5>
              <p className="text-xs text-muted-foreground">Lifestyle: {avatar.psychographics.lifestyle}</p>
              <p className="text-xs text-muted-foreground">Values: {avatar.psychographics.values.join(', ')}</p>
              <p className="text-xs text-muted-foreground">Interests: {avatar.psychographics.interests.join(', ')}</p>
            </div>

            {/* Buying Behavior */}
            <div>
              <h5 className="text-sm font-semibold mb-1">Buying Behavior</h5>
              <ul className="space-y-0.5">
                {avatar.buyingBehavior.map((b, j) => (
                  <li key={j} className="text-xs flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Key Motivations */}
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3">
              <h5 className="text-sm font-semibold mb-1">Key Motivations</h5>
              <p className="text-xs text-muted-foreground">{avatar.keyMotivations}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
