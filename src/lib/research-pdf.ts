// Research Analysis Report — PDF/Print HTML Generator
// Generates self-contained HTML documents for browser print-to-PDF
import type {
  KeywordAnalysisResult,
  ReviewAnalysisResult,
  QnAAnalysisResult,
} from '@/lib/claude'

interface ResearchPdfOptions {
  analysisType: string
  source: string
  modelUsed?: string
  tokensUsed?: number
  date: string
}

const esc = (s: string | undefined | null): string =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmt = (n: number | undefined | null): string => (n ?? 0).toLocaleString()

// ─── Shared helpers ──────────────────────────────────────────

function sectionHeader(title: string): string {
  return `<h2 style="font-size:16px;font-weight:700;margin:32px 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${esc(title)}</h2>`
}

function executiveSummaryBlock(text?: string): string {
  if (!text) return ''
  return `
${sectionHeader('Executive Summary')}
<div style="background:#f0f4ff;border-left:4px solid #3b82f6;padding:16px 20px;border-radius:6px;font-size:14px;line-height:1.7;">
  ${esc(text)}
</div>`
}

function priorityBadge(priority: string): string {
  const colors: Record<string, string> = {
    CRITICAL: 'background:#fee2e2;color:#991b1b',
    HIGH: 'background:#ffedd5;color:#9a3412',
    MEDIUM: 'background:#fef9c3;color:#854d0e',
    LOW: 'background:#f3f4f6;color:#374151',
  }
  const style = colors[priority] || colors.LOW
  return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;${style}">${esc(priority)}</span>`
}

function tableStart(headers: string[]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
    <thead><tr style="border-bottom:2px solid #e5e7eb;background:#f9fafb;">
      ${headers.map(h => `<th style="text-align:left;padding:8px;font-weight:600;">${h}</th>`).join('')}
    </tr></thead><tbody>`
}

function tableEnd(): string {
  return `</tbody></table>`
}

function tableRow(cells: string[], alignRight?: number[]): string {
  return `<tr style="border-bottom:1px solid #f3f4f6;">
    ${cells.map((c, i) => `<td style="padding:6px 8px;${alignRight?.includes(i) ? 'text-align:right;' : ''}">${c}</td>`).join('')}
  </tr>`
}

// ─── Keyword Analysis ────────────────────────────────────────

function buildKeywordHTML(data: KeywordAnalysisResult): string {
  let html = executiveSummaryBlock(data.executiveSummary)

  // Summary stats
  html += `<div style="display:flex;gap:16px;margin:20px 0;">
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Total Keywords</div>
      <div style="font-size:22px;font-weight:700;">${fmt(data.summary.totalKeywords)}</div>
    </div>
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Total Search Volume</div>
      <div style="font-size:22px;font-weight:700;">${fmt(data.summary.totalSearchVolume)}</div>
    </div>
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Data Quality</div>
      <div style="font-size:18px;font-weight:600;">${esc(data.summary.dataQuality)}</div>
    </div>
  </div>`

  // Keyword distribution
  if (data.keywordDistribution) {
    const d = data.keywordDistribution
    html += `<div style="display:flex;gap:12px;margin-bottom:20px;">
      <div style="flex:1;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#6b7280;">High (0.6+)</div>
        <div style="font-size:18px;font-weight:700;">${fmt(d.high.count)} kw</div>
        <div style="font-size:11px;color:#6b7280;">${fmt(d.high.totalVolume)} vol</div>
      </div>
      <div style="flex:1;border:1px solid #fde68a;background:#fefce8;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#6b7280;">Medium (0.4-0.6)</div>
        <div style="font-size:18px;font-weight:700;">${fmt(d.medium.count)} kw</div>
        <div style="font-size:11px;color:#6b7280;">${fmt(d.medium.totalVolume)} vol</div>
      </div>
      <div style="flex:1;border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#6b7280;">Low (&lt;0.4)</div>
        <div style="font-size:18px;font-weight:700;">${fmt(d.low.count)} kw</div>
        <div style="font-size:11px;color:#6b7280;">${fmt(d.low.totalVolume)} vol</div>
      </div>
    </div>`
  }

  // Market opportunity
  if (data.marketOpportunity) {
    const m = data.marketOpportunity
    html += `<div style="display:flex;gap:12px;margin-bottom:20px;">
      <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#6b7280;">Total Addressable Market</div>
        <div style="font-size:16px;font-weight:700;">${fmt(m.totalAddressableMarket)}</div>
      </div>
      <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#6b7280;">Primary Target</div>
        <div style="font-size:16px;font-weight:700;">${fmt(m.primaryTargetMarket)}</div>
      </div>
      <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#6b7280;">Competition</div>
        <div style="font-size:16px;font-weight:700;">${esc(m.competitionLevel)}</div>
      </div>
      <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#6b7280;">Growth</div>
        <div style="font-size:16px;font-weight:700;">${esc(m.growthPotential)}</div>
      </div>
    </div>`
  }

  // Keyword tables
  const buildKwTable = (title: string, keywords: KeywordAnalysisResult['highRelevancy'], showPlacement?: boolean) => {
    if (!keywords?.length) return ''
    let t = sectionHeader(title)
    const headers = ['#', 'Keyword', 'Search Vol', 'Relevancy', 'Strategic Value']
    if (showPlacement) headers.push('Placement')
    t += tableStart(headers)
    keywords.forEach((kw, i) => {
      const cells = [
        `${i + 1}`,
        `<strong>${esc(kw.keyword)}</strong>`,
        fmt(kw.searchVolume),
        (kw.relevancy ?? 0).toFixed(2),
        fmt(Math.round(kw.strategicValue ?? 0)),
      ]
      if (showPlacement) cells.push(esc(kw.strategicPlacement) || '')
      t += tableRow(cells, [2, 3, 4])
    })
    t += tableEnd()
    return t
  }

  html += buildKwTable('High Relevancy Keywords', data.highRelevancy, true)
  html += buildKwTable('Medium Relevancy Keywords', data.mediumRelevancy, true)
  if (data.lowRelevancy?.length) {
    html += buildKwTable('Low Relevancy Keywords', data.lowRelevancy)
  }

  // Keyword themes
  if (data.keywordThemes?.length) {
    html += sectionHeader('Keyword Themes')
    data.keywordThemes.forEach(dim => {
      html += `<p style="font-size:13px;font-weight:600;margin:12px 0 6px;">${esc(dim.dimension)}</p>`
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">`
      dim.themes.forEach(t => {
        html += `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;text-align:center;">
          <div style="font-size:11px;font-weight:500;">${esc(t.name)}</div>
          <div style="font-size:14px;font-weight:700;">${fmt(t.totalSearchVolume)}</div>
          <div style="font-size:10px;color:#6b7280;">${t.keywordCount} kw</div>
        </div>`
      })
      html += `</div>`
    })
  }

  // Customer intent patterns
  html += sectionHeader('Customer Intent Patterns')
  data.customerIntentPatterns.forEach(p => {
    html += `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:500;">${esc(p.category)} ${priorityBadge(p.priority)}</span>
        <span style="font-size:12px;color:#6b7280;">${fmt(p.totalSearchVolume)} vol / ${p.keywordCount} kw</span>
      </div>
      ${p.painPoints ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;"><strong>Pain Points:</strong> ${esc(p.painPoints)}</div>` : ''}
      ${p.opportunity ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;"><strong>Opportunity:</strong> ${esc(p.opportunity)}</div>` : ''}
    </div>`
  })

  // Feature demand
  if (data.featureDemand?.length) {
    html += sectionHeader('Feature Demand')
    html += tableStart(['Feature', 'Priority', 'Search Vol', 'Keywords'])
    data.featureDemand.forEach(f => {
      html += tableRow([esc(f.feature), priorityBadge(f.priority), fmt(f.totalSearchVolume), `${f.keywordCount}`], [2, 3])
    })
    html += tableEnd()
  }

  // Surface demand
  if (data.surfaceDemand?.length) {
    html += sectionHeader('Surface / Application Demand')
    html += `<div style="display:flex;flex-wrap:wrap;gap:10px;">`
    data.surfaceDemand.forEach(s => {
      html += `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px 14px;text-align:center;">
        <div style="font-size:13px;font-weight:500;">${esc(s.surfaceType)}</div>
        <div style="font-size:16px;font-weight:700;">${fmt(s.totalSearchVolume)}</div>
        <div style="font-size:10px;color:#6b7280;">${s.keywordCount} keywords</div>
      </div>`
    })
    html += `</div>`
  }

  // Competitive intelligence
  if (data.competitiveIntelligence) {
    html += sectionHeader('Competitive Intelligence')
    if (data.competitiveIntelligence.brandPresence?.length) {
      html += `<p style="font-size:13px;font-weight:600;margin-bottom:6px;">Brand Presence</p>`
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">`
      data.competitiveIntelligence.brandPresence.forEach(b => {
        html += `<span style="border:1px solid #e5e7eb;border-radius:4px;padding:2px 8px;font-size:11px;">${esc(b.brand)} (${fmt(b.searchVolume)} SV)</span>`
      })
      html += `</div>`
    }
    if (data.competitiveIntelligence.featureDifferentiation?.length) {
      html += `<p style="font-size:13px;font-weight:600;margin-bottom:6px;">Feature Differentiation</p>`
      data.competitiveIntelligence.featureDifferentiation.forEach(f => {
        html += `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;"><span style="color:#22c55e;">+</span> ${esc(f)}</div>`
      })
    }
    if (data.competitiveIntelligence.marketGaps?.length) {
      html += `<p style="font-size:13px;font-weight:600;margin:10px 0 6px;">Market Gaps</p>`
      data.competitiveIntelligence.marketGaps.forEach(g => {
        html += `<div style="font-size:12px;color:#6b7280;margin-bottom:2px;"><span style="color:#3b82f6;">&#9679;</span> ${esc(g)}</div>`
      })
    }
  }

  // Bullet keyword map
  if (data.bulletKeywordMap?.length) {
    html += sectionHeader('Bullet Point Keyword Strategy')
    data.bulletKeywordMap.forEach(b => {
      html += `<div style="display:flex;align-items:start;gap:10px;margin-bottom:8px;">
        <div style="width:28px;height:28px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#2563eb;flex-shrink:0;">${b.bulletNumber}</div>
        <div>
          <div style="font-size:13px;font-weight:500;">${esc(b.focus)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
            ${b.keywords.map(kw => `<span style="background:#f1f5f9;border-radius:4px;padding:1px 6px;font-size:10px;">${esc(kw)}</span>`).join('')}
          </div>
        </div>
      </div>`
    })
  }

  // Keyword recommendations
  html += sectionHeader('Keyword Placement Recommendations')
  const kwSection = (title: string, kws: string[], bg: string) => {
    if (!kws?.length) return ''
    return `<div style="margin-bottom:12px;">
      <p style="font-size:13px;font-weight:600;margin-bottom:6px;">${title}</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${kws.map(kw => `<span style="background:${bg};border-radius:4px;padding:2px 8px;font-size:11px;">${esc(kw)}</span>`).join('')}
      </div>
    </div>`
  }
  html += kwSection('Title Keywords', data.titleKeywords, '#dbeafe')
  html += kwSection('Bullet Keywords', data.bulletKeywords, '#f1f5f9')
  html += kwSection('Search Terms', data.searchTermKeywords, '#f9fafb')

  // Rufus question anticipation
  if (data.rufusQuestionAnticipation?.length) {
    html += sectionHeader('Rufus AI Question Anticipation')
    data.rufusQuestionAnticipation.forEach(q => {
      html += `<div style="font-size:12px;color:#6b7280;padding-left:12px;border-left:2px solid #93c5fd;margin-bottom:6px;">&ldquo;${esc(q)}&rdquo;</div>`
    })
  }

  return html
}

// ─── Review Analysis ─────────────────────────────────────────

function buildReviewHTML(data: ReviewAnalysisResult): string {
  let html = executiveSummaryBlock(data.executiveSummary)

  // Summary stats
  html += `<div style="display:flex;gap:16px;margin:20px 0;">
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Total Reviews</div>
      <div style="font-size:22px;font-weight:700;">${fmt(data.summary.totalReviews)}</div>
    </div>
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Average Rating</div>
      <div style="font-size:22px;font-weight:700;">${(data.summary.averageRating ?? 0).toFixed(1)} / 5</div>
    </div>
    <div style="flex:1;border:1px solid #bbf7d0;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Positive (4-5 star)</div>
      <div style="font-size:22px;font-weight:700;color:#16a34a;">${(data.summary.positivePercent ?? 0).toFixed(1)}%</div>
    </div>
    <div style="flex:1;border:1px solid #fecaca;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Negative (1-2 star)</div>
      <div style="font-size:22px;font-weight:700;color:#dc2626;">${(data.summary.negativePercent ?? 0).toFixed(1)}%</div>
    </div>
  </div>`

  // Rating distribution
  html += sectionHeader('Rating Distribution')
  const sorted = [...data.ratingDistribution].sort((a, b) => b.stars - a.stars)
  sorted.forEach(r => {
    const color = r.stars >= 4 ? '#22c55e' : r.stars === 3 ? '#eab308' : '#ef4444'
    html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="width:50px;font-size:12px;font-weight:600;">${r.stars} star</span>
      <div style="flex:1;height:18px;background:#f3f4f6;border-radius:9px;overflow:hidden;">
        <div style="width:${r.percentage}%;height:100%;background:${color};border-radius:9px;"></div>
      </div>
      <span style="width:100px;text-align:right;font-size:11px;color:#6b7280;">${r.count} (${(r.percentage ?? 0).toFixed(1)}%)</span>
    </div>`
  })

  // Customer profiles
  if (data.customerProfiles?.length) {
    html += sectionHeader('Customer Profiles')
    html += `<div style="display:flex;flex-wrap:wrap;gap:10px;">`
    data.customerProfiles.forEach(p => {
      html += `<div style="flex:1;min-width:200px;border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
        <div style="display:flex;justify-content:space-between;"><strong style="font-size:13px;">${esc(p.profile)}</strong><span style="font-size:11px;color:#6b7280;">${fmt(p.mentions)} mentions</span></div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">${esc(p.description)}</div>
      </div>`
    })
    html += `</div>`
  }

  // Strengths & weaknesses
  html += `<div style="display:flex;gap:20px;margin-top:8px;">`
  // Strengths
  html += `<div style="flex:1;">`
  html += sectionHeader('Strengths')
  data.strengths.forEach((s, i) => {
    html += `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
      <span><strong style="color:#16a34a;">${i + 1}.</strong> ${esc(s.strength)}</span>
      <span style="color:#6b7280;">${s.mentions} mentions · <span style="color:#16a34a;">${esc(s.impact)}</span></span>
    </div>`
  })
  html += `</div>`
  // Weaknesses
  html += `<div style="flex:1;">`
  html += sectionHeader('Weaknesses')
  data.weaknesses.forEach((w, i) => {
    html += `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
      <span><strong style="color:#dc2626;">${i + 1}.</strong> ${esc(w.weakness)}</span>
      <span style="color:#6b7280;">${w.mentions} mentions · <span style="color:#dc2626;">${esc(w.impact)}</span></span>
    </div>`
  })
  html += `</div></div>`

  // Use cases
  html += sectionHeader('Customer Use Cases')
  html += tableStart(['#', 'Use Case', 'Frequency', 'Priority'])
  data.useCases.forEach((uc, i) => {
    html += tableRow([`${i + 1}`, esc(uc.useCase), fmt(uc.frequency), priorityBadge(uc.priority)], [2])
  })
  html += tableEnd()

  // Language analysis
  html += `<div style="display:flex;gap:20px;">`
  html += `<div style="flex:1;">`
  html += sectionHeader('Positive Language')
  html += tableStart(['Word', 'Frequency'])
  data.positiveLanguage.forEach(w => {
    html += tableRow([`<span style="color:#16a34a;font-weight:500;">${esc(w.word)}</span>`, fmt(w.frequency)], [1])
  })
  html += tableEnd()
  html += `</div>`
  html += `<div style="flex:1;">`
  html += sectionHeader('Negative Language')
  html += tableStart(['Word', 'Frequency'])
  data.negativeLanguage.forEach(w => {
    html += tableRow([`<span style="color:#dc2626;font-weight:500;">${esc(w.word)}</span>`, fmt(w.frequency)], [1])
  })
  html += tableEnd()
  html += `</div></div>`

  // Product nouns
  if (data.productNouns?.length) {
    html += sectionHeader('Product-Defining Nouns')
    html += tableStart(['Noun', 'Frequency', 'Listing Integration'])
    data.productNouns.forEach(n => {
      html += tableRow([`<strong>${esc(n.noun)}</strong>`, fmt(n.frequency), esc(n.listingIntegration)], [1])
    })
    html += tableEnd()
  }

  // Cross product analysis
  if (data.crossProductAnalysis?.length) {
    html += sectionHeader('Cross-Product Analysis')
    html += tableStart(['Product', 'Reviews', 'Positive %', 'Negative %', 'Rating'])
    data.crossProductAnalysis.forEach(p => {
      html += tableRow([
        `<code>${esc(p.productId)}</code>`,
        `${p.reviewCount}`,
        `<span style="color:#16a34a;">${(p.positiveRate ?? 0).toFixed(1)}%</span>`,
        `<span style="color:#dc2626;">${(p.negativeRate ?? 0).toFixed(1)}%</span>`,
        esc(p.performanceRating),
      ], [1, 2, 3])
    })
    html += tableEnd()
  }

  // Bullet strategy
  html += sectionHeader('Bullet Point Strategy')
  data.bulletStrategy.forEach(b => {
    html += `<div style="display:flex;align-items:start;gap:10px;margin-bottom:8px;">
      <div style="width:28px;height:28px;border-radius:50%;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#2563eb;flex-shrink:0;">${b.bulletNumber}</div>
      <div>
        <div style="font-size:13px;font-weight:500;">${esc(b.focus)} ${priorityBadge(b.priority)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">${esc(b.evidence)}</div>
        ${b.customerPainPoint ? `<div style="font-size:11px;color:#ea580c;margin-top:2px;">Pain point: ${esc(b.customerPainPoint)}</div>` : ''}
      </div>
    </div>`
  })

  // Image optimization
  if (data.imageOptimizationOpportunities?.length) {
    html += sectionHeader('Image Optimization Opportunities')
    data.imageOptimizationOpportunities.forEach((img, i) => {
      html += `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:600;">${i + 1}. ${esc(img.imageType)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">${esc(img.rationale)}</div>
        <div style="font-size:11px;color:#2563eb;margin-top:2px;">Evidence: ${esc(img.reviewEvidence)}</div>
      </div>`
    })
  }

  // Competitive positioning
  if (data.competitivePositioning) {
    html += sectionHeader('Competitive Positioning')
    if (data.competitivePositioning.marketGaps?.length) {
      html += tableStart(['Gap', 'Customer Need', 'Opportunity'])
      data.competitivePositioning.marketGaps.forEach(g => {
        html += tableRow([`<strong>${esc(g.gap)}</strong>`, esc(g.customerNeed), esc(g.opportunity)])
      })
      html += tableEnd()
    }
    const mf = data.competitivePositioning.messagingFramework
    html += `<div style="background:#f0f4ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:6px;margin-top:12px;">
      <p style="font-size:13px;font-weight:600;margin-bottom:6px;">Messaging Framework</p>
      <p style="font-size:12px;"><strong>Primary:</strong> ${esc(mf.primaryMessage)}</p>
      <p style="font-size:11px;color:#6b7280;margin-top:4px;"><strong>Support:</strong> ${mf.supportPoints.map(esc).join(' · ')}</p>
      <p style="font-size:11px;color:#6b7280;margin-top:2px;"><strong>Proof:</strong> ${mf.proofPoints.map(esc).join(' · ')}</p>
      <p style="font-size:11px;color:#ea580c;margin-top:2px;"><strong>Risk Reversal:</strong> ${esc(mf.riskReversal)}</p>
    </div>`
  }

  // Customer voice phrases
  if (data.customerVoicePhrases) {
    html += sectionHeader('Authentic Customer Voice')
    html += `<div style="display:flex;gap:20px;">`
    const voiceCol = (title: string, items: string[], color: string) => {
      if (!items?.length) return ''
      return `<div style="flex:1;">
        <p style="font-size:12px;font-weight:600;color:${color};margin-bottom:6px;">${title}</p>
        ${items.map(p => `<p style="font-size:11px;color:#6b7280;margin-bottom:3px;">&ldquo;${esc(p)}&rdquo;</p>`).join('')}
      </div>`
    }
    html += voiceCol('Positive Emotional', data.customerVoicePhrases.positiveEmotional, '#16a34a')
    html += voiceCol('Functional', data.customerVoicePhrases.functional, '#374151')
    html += voiceCol('Use Case Language', data.customerVoicePhrases.useCaseLanguage, '#2563eb')
    html += `</div>`
  }

  return html
}

// ─── Q&A Analysis ────────────────────────────────────────────

function buildQnAHTML(data: QnAAnalysisResult): string {
  let html = executiveSummaryBlock(data.executiveSummary)

  // Summary stats
  html += `<div style="display:flex;gap:16px;margin:20px 0;">
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Total Questions</div>
      <div style="font-size:22px;font-weight:700;">${fmt(data.summary.totalQuestions)}</div>
    </div>
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Top Concerns</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
        ${data.summary.topConcerns.map(c => `<span style="background:#f1f5f9;border-radius:4px;padding:1px 6px;font-size:10px;">${esc(c)}</span>`).join('')}
      </div>
    </div>
    ${data.rufusOptimizationScore ? `<div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#6b7280;">Rufus Optimization Score</div>
      <div style="font-size:22px;font-weight:700;">${data.rufusOptimizationScore.score} / ${data.rufusOptimizationScore.maxScore}</div>
    </div>` : ''}
  </div>`

  // SP Prompt Insights
  if (data.spPromptInsights) {
    const sp = data.spPromptInsights
    html += sectionHeader('Amazon SP Prompts Analysis')
    html += `<div style="display:flex;gap:12px;margin-bottom:16px;">
      <div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">Total Prompts</div>
        <div style="font-size:18px;font-weight:700;">${fmt(sp.totalPrompts)}</div>
      </div>
      <div style="flex:1;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:6px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">Relevant (Niche)</div>
        <div style="font-size:18px;font-weight:700;color:#16a34a;">${fmt(sp.relevantPrompts)}</div>
      </div>
      <div style="flex:1;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;padding:10px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;">Filtered Out</div>
        <div style="font-size:18px;font-weight:700;color:#6b7280;">${fmt(sp.filteredOut)}</div>
      </div>
    </div>`
    if (sp.topPerformingPrompts?.length) {
      html += `<p style="font-size:13px;font-weight:600;margin-bottom:6px;">Top Performing SP Prompts</p>`
      html += tableStart(['Prompt', 'Impressions', 'Clicks', 'CTR'])
      sp.topPerformingPrompts.forEach(p => {
        html += tableRow([
          `<em>&ldquo;${esc(p.prompt)}&rdquo;</em>`,
          fmt(p.impressions),
          fmt(p.clicks),
          typeof p.ctr === 'number' ? (p.ctr * 100).toFixed(1) + '%' : `${p.ctr}`,
        ], [1, 2, 3])
      })
      html += tableEnd()
    }
    if (sp.promptThemes?.length) {
      html += `<p style="font-size:13px;font-weight:600;margin:12px 0 6px;">Prompt Theme Clusters</p>`
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">`
      sp.promptThemes.forEach(t => {
        html += `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;min-width:150px;">
          <div style="display:flex;justify-content:space-between;"><strong style="font-size:12px;">${esc(t.theme)}</strong><span style="font-size:11px;color:#6b7280;">${t.count}</span></div>
          <div style="font-size:10px;color:#6b7280;">Avg ${fmt(Math.round(t.avgImpressions))} imp${t.hasClicks ? ' <span style="color:#16a34a;font-weight:600;">Has clicks</span>' : ''}</div>
        </div>`
      })
      html += `</div>`
    }
    if (sp.contentGapsFromPrompts?.length) {
      html += `<p style="font-size:13px;font-weight:600;margin:12px 0 6px;">Content Gaps from SP Prompts</p>`
      html += tableStart(['Prompt', 'Addressed?', 'Recommendation'])
      sp.contentGapsFromPrompts.forEach(g => {
        html += tableRow([
          `<em>&ldquo;${esc(g.prompt)}&rdquo;</em>`,
          g.addressed ? '<span style="color:#16a34a;font-weight:600;">Yes</span>' : '<span style="color:#dc2626;font-weight:600;">No</span>',
          esc(g.recommendation),
        ])
      })
      html += tableEnd()
    }
    if (sp.suggestedListingImprovements?.length) {
      html += `<p style="font-size:13px;font-weight:600;margin:12px 0 6px;">Suggested Listing Improvements</p>`
      sp.suggestedListingImprovements.forEach(s => {
        html += `<div style="font-size:12px;margin-bottom:3px;"><span style="color:#d97706;">&#9679;</span> ${esc(s)}</div>`
      })
    }
  }

  // Product specs confirmed
  if (data.productSpecsConfirmed?.length) {
    html += sectionHeader('Product Specs Confirmed from Q&A')
    html += tableStart(['Specification', 'Value', 'Source'])
    data.productSpecsConfirmed.forEach(s => {
      html += tableRow([`<strong>${esc(s.spec)}</strong>`, esc(s.value), esc(s.source)])
    })
    html += tableEnd()
  }

  // Contradictions
  if (data.contradictions?.length) {
    html += sectionHeader('Contradictions Detected')
    data.contradictions.forEach(c => {
      html += `<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:6px;padding:10px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:600;color:#991b1b;">${esc(c.topic)}</div>
        ${c.conflictingAnswers.map(a => `<div style="font-size:11px;color:#6b7280;padding-left:10px;border-left:2px solid #fca5a5;margin:4px 0;">${esc(a)}</div>`).join('')}
        <div style="font-size:11px;margin-top:6px;"><strong style="color:#991b1b;">Impact:</strong> ${esc(c.impact)}</div>
        <div style="font-size:11px;margin-top:2px;"><strong style="color:#16a34a;">Resolution:</strong> ${esc(c.resolution)}</div>
      </div>`
    })
  }

  // Question themes
  html += sectionHeader('Question Themes')
  data.themes.forEach(theme => {
    html += `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:500;">${esc(theme.theme)} ${priorityBadge(theme.priority)}</span>
        <span style="font-size:11px;color:#6b7280;">${theme.questionCount} questions${theme.percentageOfTotal != null ? ` (${theme.percentageOfTotal}%)` : ''}</span>
      </div>
      ${theme.sampleQuestions.map(q => `<div style="font-size:11px;color:#6b7280;padding-left:10px;border-left:2px solid #d1d5db;margin-bottom:3px;">${esc(q)}</div>`).join('')}
    </div>`
  })

  // Question type breakdown
  if (data.questionTypeBreakdown?.length) {
    html += sectionHeader('Question Type Breakdown')
    html += tableStart(['Pattern', 'Count', '%', 'Recommendation'])
    data.questionTypeBreakdown.forEach(qt => {
      html += tableRow([`&ldquo;${esc(qt.type)}&rdquo;`, `${qt.count}`, `${qt.percentage}%`, esc(qt.recommendation)], [1, 2])
    })
    html += tableEnd()
  }

  // Confirmed features
  if (data.confirmedFeatures) {
    html += `<div style="display:flex;gap:20px;">`
    html += `<div style="flex:1;">`
    html += sectionHeader('Confirmed Features')
    data.confirmedFeatures.positive.forEach(f => {
      html += `<div style="font-size:12px;margin-bottom:4px;"><span style="color:#22c55e;">&#10003;</span> <strong>${esc(f.feature)}</strong> <span style="color:#6b7280;">${esc(f.evidence)}</span></div>`
    })
    html += `</div><div style="flex:1;">`
    html += sectionHeader('Confirmed Limitations')
    data.confirmedFeatures.limitations.forEach(l => {
      html += `<div style="font-size:12px;margin-bottom:4px;"><span style="color:#ef4444;">&#10007;</span> <strong>${esc(l.limitation)}</strong> <span style="color:#6b7280;">${esc(l.evidence)}</span></div>`
    })
    html += `</div></div>`
  }

  // Customer concerns
  html += sectionHeader('Customer Concerns')
  html += tableStart(['Concern', 'Freq', 'In Listing?', 'Suggested Response'])
  data.customerConcerns.forEach(c => {
    html += tableRow([
      `<strong>${esc(c.concern)}</strong>`,
      `${c.frequency}`,
      c.addressInListing ? '<span style="color:#16a34a;font-weight:600;">Yes</span>' : '<span style="color:#6b7280;">No</span>',
      esc(c.suggestedResponse),
    ], [1])
  })
  html += tableEnd()

  // Content gaps
  html += sectionHeader('Content Gaps')
  html += tableStart(['Gap', 'Priority', 'Recommendation'])
  data.contentGaps.forEach(g => {
    html += tableRow([`<strong>${esc(g.gap)}</strong>`, priorityBadge(g.importance), esc(g.recommendation)])
  })
  html += tableEnd()

  // High risk questions
  if (data.highRiskQuestions?.length) {
    html += sectionHeader('High-Risk Questions')
    data.highRiskQuestions.forEach(q => {
      html += `<div style="border:1px solid #fed7aa;background:#fff7ed;border-radius:6px;padding:10px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:500;">&ldquo;${esc(q.question)}&rdquo;</div>
        <div style="font-size:11px;color:#9a3412;margin-top:4px;"><strong>Risk:</strong> ${esc(q.risk)}</div>
        <div style="font-size:11px;color:#16a34a;margin-top:2px;"><strong>Defense:</strong> ${esc(q.defensiveAction)}</div>
      </div>`
    })
  }

  // FAQ for description
  html += sectionHeader('FAQ for Description')
  data.faqForDescription.forEach(faq => {
    html += `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:500;">Q: ${esc(faq.question)}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">A: ${esc(faq.answer)}</div>
    </div>`
  })

  // Competitive defense
  if (data.competitiveDefense) {
    html += sectionHeader('Competitive Defense Strategy')
    html += `<div style="display:flex;gap:20px;">`
    html += `<div style="flex:1;">
      <p style="font-size:13px;font-weight:600;margin-bottom:6px;">Brand Protection</p>
      ${data.competitiveDefense.brandProtectionOpportunities.map(o => `<div style="font-size:12px;color:#6b7280;margin-bottom:3px;"><span style="color:#22c55e;">&#9679;</span> ${esc(o)}</div>`).join('')}
    </div>`
    html += `<div style="flex:1;">
      <p style="font-size:13px;font-weight:600;margin-bottom:6px;">Information Gap Advantages</p>
      ${data.competitiveDefense.informationGapAdvantages.map(a => `<div style="font-size:12px;color:#6b7280;margin-bottom:3px;"><span style="color:#3b82f6;">&#9679;</span> ${esc(a)}</div>`).join('')}
    </div>`
    html += `</div>`
  }

  // Rufus optimization score details
  if (data.rufusOptimizationScore) {
    html += sectionHeader(`Rufus AI Optimization Score: ${data.rufusOptimizationScore.score}/${data.rufusOptimizationScore.maxScore}`)
    html += `<div style="display:flex;gap:20px;">`
    html += `<div style="flex:1;">
      <p style="font-size:13px;font-weight:600;color:#16a34a;margin-bottom:6px;">Strengths</p>
      ${data.rufusOptimizationScore.strengths.map(s => `<div style="font-size:11px;color:#6b7280;margin-bottom:3px;"><span style="color:#22c55e;">&#10003;</span> ${esc(s)}</div>`).join('')}
    </div>`
    html += `<div style="flex:1;">
      <p style="font-size:13px;font-weight:600;color:#ea580c;margin-bottom:6px;">Needs Improvement</p>
      ${data.rufusOptimizationScore.improvements.map(im => `<div style="font-size:11px;color:#6b7280;margin-bottom:3px;"><span style="color:#ea580c;">!</span> ${esc(im)}</div>`).join('')}
    </div>`
    html += `</div>`
  }

  return html
}

// ─── Main generator ──────────────────────────────────────────

const TYPE_TITLES: Record<string, string> = {
  keyword_analysis: 'Keyword Analysis Report',
  review_analysis: 'Review Analysis Report',
  qna_analysis: 'Q&A Analysis Report',
}

const SOURCE_LABELS: Record<string, string> = {
  csv: 'CSV',
  file: 'Analysis File',
  merged: 'Merged',
}

export function generateResearchReportHTML(
  analysisType: string,
  result: Record<string, unknown>,
  options: ResearchPdfOptions
): string {
  let body = ''
  if (analysisType === 'keyword_analysis') {
    body = buildKeywordHTML(result as unknown as KeywordAnalysisResult)
  } else if (analysisType === 'review_analysis') {
    body = buildReviewHTML(result as unknown as ReviewAnalysisResult)
  } else if (analysisType === 'qna_analysis') {
    body = buildQnAHTML(result as unknown as QnAAnalysisResult)
  }

  const title = TYPE_TITLES[analysisType] || 'Research Analysis Report'
  const sourceLabel = SOURCE_LABELS[options.source] || options.source

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.5; }
    * { box-sizing: border-box; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    table { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div style="max-width:780px;margin:0 auto;padding:32px 20px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:22px;margin:0 0 6px;">${esc(title)}</h1>
      <div style="font-size:12px;color:#6b7280;">
        Source: ${esc(sourceLabel)} &middot; ${esc(options.date)}
        ${options.modelUsed ? ` &middot; ${esc(options.modelUsed)}` : ''}
        ${options.tokensUsed ? ` &middot; ${(options.tokensUsed / 1000).toFixed(0)}K tokens` : ''}
      </div>
    </div>
    <hr style="border:none;border-top:2px solid #e5e7eb;margin-bottom:8px;" />

    ${body}

    <!-- Footer -->
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#9ca3af;">
      Generated by Listing Builder &middot; ${esc(options.date)}
    </div>
  </div>
</body>
</html>`
}

export function downloadResearchReport(html: string): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to download the PDF report.')
    return
  }
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }
}
