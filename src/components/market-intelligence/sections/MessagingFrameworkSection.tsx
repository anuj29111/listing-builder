'use client'

import { MessageCircle, Quote } from 'lucide-react'

interface MessagingFrameworkSectionProps {
  framework: {
    primaryMessage: string
    supportPoints: string[]
    proofPoints: string[]
    riskReversal: string
  }
  voicePhrases?: {
    positiveEmotional: string[]
    functional: string[]
    useCaseLanguage: string[]
  }
}

export function MessagingFrameworkSection({ framework, voicePhrases }: MessagingFrameworkSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-indigo-500" />
        Messaging Framework
      </h3>

      <div className="space-y-4">
        {/* Primary Message */}
        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-2">Primary Message</h4>
          <p className="text-base font-medium">{framework.primaryMessage}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Support Points */}
          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-sm font-semibold mb-2">Support Points</h4>
            <ul className="space-y-1.5">
              {framework.supportPoints.map((p, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Proof Points */}
          <div className="rounded-lg border bg-card p-4">
            <h4 className="text-sm font-semibold mb-2">Proof Points</h4>
            <ul className="space-y-1.5">
              {framework.proofPoints.map((p, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Risk Reversal */}
        <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <h4 className="text-sm font-semibold mb-1">Risk Reversal</h4>
          <p className="text-sm text-muted-foreground">{framework.riskReversal}</p>
        </div>
      </div>

      {/* Customer Voice Phrases */}
      {voicePhrases && (
        <div className="space-y-3 mt-6">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Quote className="h-4 w-4 text-muted-foreground" />
            Authentic Customer Voice
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {voicePhrases.positiveEmotional?.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-green-700 mb-2">Positive Emotional</h5>
                <div className="flex flex-wrap gap-1.5">
                  {voicePhrases.positiveEmotional.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs">&ldquo;{p}&rdquo;</span>
                  ))}
                </div>
              </div>
            )}
            {voicePhrases.functional?.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-blue-700 mb-2">Functional</h5>
                <div className="flex flex-wrap gap-1.5">
                  {voicePhrases.functional.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs">&ldquo;{p}&rdquo;</span>
                  ))}
                </div>
              </div>
            )}
            {voicePhrases.useCaseLanguage?.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-purple-700 mb-2">Use Case Language</h5>
                <div className="flex flex-wrap gap-1.5">
                  {voicePhrases.useCaseLanguage.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs">&ldquo;{p}&rdquo;</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
