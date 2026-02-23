// Market Intelligence Report — PDF/Print HTML Generator
// Generates a self-contained HTML document for browser print-to-PDF
import type { MarketIntelligenceResult } from '@/types/market-intelligence'

interface MIPdfOptions {
  keyword: string
  marketplace: string
  flagEmoji?: string
  date: string
  competitorCount: number
  modelUsed?: string
  tokensUsed?: number
  marketplaceDomain?: string
}

const esc = (s: string | undefined | null): string =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const stars = (rating: number): string => {
  const full = Math.round(rating)
  return '★'.repeat(full) + '☆'.repeat(5 - full)
}

// ─── Section builders ──────────────────────────────────────────

function sectionHeader(title: string): string {
  return `<h2 style="font-size:16px;font-weight:700;margin:32px 0 12px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${esc(title)}</h2>`
}

function buildExecutiveSummary(r: MarketIntelligenceResult): string {
  if (!r.executiveSummary) return ''
  return `
${sectionHeader('Executive Summary')}
<div style="background:#f0f4ff;border-left:4px solid #3b82f6;padding:16px 20px;border-radius:6px;font-size:14px;line-height:1.7;">
  ${esc(r.executiveSummary)}
</div>`
}

function buildSentimentAnalysis(r: MarketIntelligenceResult): string {
  if (!r.sentimentAnalysis) return ''
  const s = r.sentimentAnalysis
  const total = s.positive + s.painPoints + s.featureRequests || 100

  const bar = (label: string, value: number, color: string) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="width:120px;font-size:12px;font-weight:600;">${label}</span>
      <div style="flex:1;height:20px;background:#f3f4f6;border-radius:10px;overflow:hidden;">
        <div style="width:${(value / total * 100).toFixed(1)}%;height:100%;background:${color};border-radius:10px;"></div>
      </div>
      <span style="width:40px;text-align:right;font-size:12px;font-weight:600;">${value}%</span>
    </div>`

  let html = `${sectionHeader('Review Analysis')}
<div style="display:flex;gap:24px;margin-bottom:16px;">
  <span style="font-size:13px;"><strong>${s.totalReviews.toLocaleString()}</strong> reviews analyzed</span>
  <span style="font-size:13px;"><strong>${s.averageRating?.toFixed(1)}</strong> average rating</span>
</div>
<div style="max-width:500px;">
  ${bar('Positive', s.positive, '#22c55e')}
  ${bar('Pain Points', s.painPoints, '#ef4444')}
  ${bar('Feature Requests', s.featureRequests, '#3b82f6')}
</div>`

  // Theme lists
  const themeTable = (title: string, items: Array<{ theme: string; mentions: number }>, color: string) => {
    if (!items?.length) return ''
    return `
<div style="margin-top:16px;">
  <h4 style="font-size:13px;font-weight:600;color:${color};margin-bottom:8px;">${title}</h4>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    ${items.map(t => `<tr><td style="padding:3px 0;">${esc(t.theme)}</td><td style="text-align:right;color:#6b7280;padding:3px 0;">${t.mentions} mentions</td></tr>`).join('')}
  </table>
</div>`
  }

  html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">`
  html += themeTable('Top Positive Themes', r.topPositiveThemes, '#16a34a')
  html += themeTable('Pain Points', r.painPointsList, '#dc2626')
  html += themeTable('Feature Requests', r.featureRequestsList, '#2563eb')
  html += `</div>`

  return html
}

function buildPainPoints(r: MarketIntelligenceResult): string {
  if (!r.topPainPoints?.length) return ''
  return `${sectionHeader('Top Customer Pain Points')}
<div style="display:flex;flex-direction:column;gap:10px;">
  ${r.topPainPoints.map(pp => `
    <div style="border-left:4px solid #f87171;background:#fef2f2;padding:12px 16px;border-radius:6px;">
      <div style="font-weight:600;font-size:14px;color:#b91c1c;">${esc(pp.title)}</div>
      <div style="font-size:12px;color:#7f1d1d;margin-top:4px;">${esc(pp.description)}</div>
      <div style="font-size:11px;color:#ef4444;margin-top:4px;font-weight:600;">Impact: ~${pp.impactPercentage}% of reviews</div>
    </div>
  `).join('')}
</div>`
}

function buildMotivations(r: MarketIntelligenceResult): string {
  if (!r.primaryMotivations?.length) return ''
  return `${sectionHeader('Primary Customer Motivations')}
<div style="display:flex;flex-direction:column;gap:10px;">
  ${r.primaryMotivations.map(m => `
    <div style="border-left:4px solid #4ade80;background:#f0fdf4;padding:12px 16px;border-radius:6px;">
      <div style="font-weight:600;font-size:14px;color:#15803d;">${esc(m.title)}</div>
      <div style="font-size:12px;color:#166534;margin-top:4px;">${esc(m.description)}</div>
      <div style="font-size:11px;color:#22c55e;margin-top:4px;font-weight:600;">Frequency: ${esc(m.frequencyDescription)}</div>
    </div>
  `).join('')}
</div>`
}

function buildBuyingFactors(r: MarketIntelligenceResult): string {
  if (!r.buyingDecisionFactors?.length) return ''
  return `${sectionHeader('Critical Buying Decision Factors')}
<div style="display:flex;flex-direction:column;gap:10px;">
  ${r.buyingDecisionFactors.map(f => `
    <div style="border-left:4px solid #60a5fa;background:#eff6ff;padding:12px 16px;border-radius:6px;display:flex;align-items:flex-start;gap:12px;">
      <span style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#1d4ed8;">${f.rank}</span>
      <div>
        <div style="font-weight:600;font-size:14px;color:#1d4ed8;">${esc(f.title)}</div>
        <div style="font-size:12px;color:#1e40af;margin-top:4px;">${esc(f.description)}</div>
      </div>
    </div>
  `).join('')}
</div>`
}

function buildCustomerSegments(r: MarketIntelligenceResult): string {
  if (!r.customerSegments?.length) return ''
  return `${sectionHeader('Customer Segments')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
  ${r.customerSegments.map(seg => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <div style="font-weight:600;font-size:14px;">${esc(seg.name)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Age ${esc(seg.ageRange)}, ${esc(seg.occupation)}</div>
      <ul style="margin-top:8px;padding-left:16px;font-size:12px;color:#374151;">
        ${seg.traits.map(t => `<li style="margin-bottom:3px;">${esc(t)}</li>`).join('')}
      </ul>
    </div>
  `).join('')}
</div>`
}

function buildCompetitorProducts(
  competitorsData: Array<Record<string, unknown>>,
  marketplaceDomain?: string,
): string {
  const products = competitorsData.filter(c => !c.error)
  if (!products.length) return ''

  const domain = marketplaceDomain || 'amazon.com'

  return `
<div style="page-break-before:always;"></div>
${sectionHeader(`Competitor Products (${products.length})`)}
<div style="display:flex;flex-direction:column;gap:16px;">
  ${products.map((prod, i) => {
    const images = (prod.images as string[]) || []
    const title = (prod.title as string) || ''
    const brand = (prod.brand as string) || ''
    const asin = prod.asin as string
    const price = prod.price as number | null
    const priceInitial = prod.price_initial as number | null
    const currency = (prod.currency as string) || '$'
    const rating = (prod.rating as number) || 0
    const reviewsCount = (prod.reviews_count as number) || 0
    const isPrime = prod.is_prime_eligible as boolean
    const isAmazonChoice = prod.amazon_choice as boolean
    const salesVolume = (prod.sales_volume as string) || ''
    const salesRank = (prod.sales_rank as Array<{ rank?: number; ladder?: Array<{ name: string }> }>) || []
    const bsr = salesRank[0]
    const amazonUrl = `https://www.${domain}/dp/${asin}`
    const pageBreak = i > 0 && i % 4 === 0 ? 'page-break-before:always;' : ''

    return `
      <div style="${pageBreak}border:1px solid #e5e7eb;border-radius:8px;padding:14px;display:flex;gap:16px;">
        ${images[0] ? `<img src="${esc(images[0])}" alt="${esc(title)}" style="width:150px;height:150px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #f3f4f6;flex-shrink:0;" />` : '<div style="width:150px;height:150px;background:#f9fafb;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;">No Image</div>'}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;line-height:1.4;">${esc(title)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px;">
            ${brand ? `${esc(brand)} &middot; ` : ''}${asin}
          </div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            ${price != null ? `<span style="font-weight:700;font-size:15px;">${currency}${price.toFixed(2)}</span>` : ''}
            ${priceInitial != null && priceInitial !== price ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:12px;">${currency}${priceInitial.toFixed(2)}</span>` : ''}
            <span style="font-size:13px;color:#eab308;">${stars(rating)}</span>
            <span style="font-size:12px;color:#6b7280;">${rating.toFixed(1)} (${reviewsCount.toLocaleString()} reviews)</span>
          </div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;font-size:11px;">
            ${isPrime ? '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 6px;border-radius:4px;font-weight:600;">Prime</span>' : ''}
            ${isAmazonChoice ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:600;">Amazon\'s Choice</span>' : ''}
            ${salesVolume ? `<span style="background:#dcfce7;color:#166534;padding:2px 6px;border-radius:4px;">${esc(salesVolume)}</span>` : ''}
          </div>
          ${bsr?.rank ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">BSR #${bsr.rank.toLocaleString()}${bsr.ladder?.length ? ` in ${esc(bsr.ladder[bsr.ladder.length - 1]?.name || bsr.ladder[0]?.name)}` : ''}</div>` : ''}
          <div style="margin-top:8px;">
            <a href="${esc(amazonUrl)}" target="_blank" style="color:#2563eb;font-size:12px;text-decoration:underline;">${esc(amazonUrl)}</a>
          </div>
        </div>
      </div>`
  }).join('')}
</div>`
}

function buildQnASection(r: MarketIntelligenceResult): string {
  const parts: string[] = []
  const hasContent = r.topQuestions?.length || r.questionThemes?.length || r.buyerConcerns?.length

  if (!hasContent) return ''

  parts.push(sectionHeader('Questions & Answers Analysis'))

  // Question Themes
  if (r.questionThemes?.length) {
    parts.push(`<h4 style="font-size:13px;font-weight:600;margin:12px 0 8px;">Question Themes</h4>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
  ${r.questionThemes.map(t => `
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-weight:600;font-size:13px;">${esc(t.theme)}</span>
        <span style="font-size:10px;background:#f3f4f6;padding:2px 6px;border-radius:4px;">${t.count} questions</span>
      </div>
      <div style="font-size:11px;color:#6b7280;">${esc(t.description)}</div>
    </div>
  `).join('')}
</div>`)
  }

  // Buyer Concerns
  if (r.buyerConcerns?.length) {
    parts.push(`<h4 style="font-size:13px;font-weight:600;margin:16px 0 8px;">Pre-Purchase Concerns</h4>
<div style="display:flex;flex-direction:column;gap:8px;">
  ${r.buyerConcerns.map(c => `
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-weight:600;font-size:13px;">${esc(c.concern)}</span>
        <span style="font-size:10px;background:#f3f4f6;padding:2px 6px;border-radius:4px;">${esc(c.frequency)}</span>
      </div>
      <div style="font-size:11px;color:#6b7280;">${esc(c.resolution)}</div>
    </div>
  `).join('')}
</div>`)
  }

  // Content Gaps
  if (r.contentGaps?.length) {
    const importanceColor = (imp: string) => {
      if (imp === 'CRITICAL') return 'background:#fef2f2;color:#dc2626;'
      if (imp === 'HIGH') return 'background:#fff7ed;color:#ea580c;'
      return 'background:#fefce8;color:#ca8a04;'
    }
    parts.push(`<h4 style="font-size:13px;font-weight:600;margin:16px 0 8px;">Content Gaps</h4>
<div style="display:flex;flex-direction:column;gap:8px;">
  ${r.contentGaps.map(g => `
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;display:flex;align-items:flex-start;gap:10px;">
      <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;flex-shrink:0;${importanceColor(g.importance)}">${esc(g.importance)}</span>
      <div>
        <div style="font-weight:600;font-size:13px;">${esc(g.gap)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">${esc(g.recommendation)}</div>
      </div>
    </div>
  `).join('')}
</div>`)
  }

  // Top Questions
  if (r.topQuestions?.length) {
    parts.push(`<h4 style="font-size:13px;font-weight:600;margin:16px 0 8px;">Top Questions</h4>
<div style="display:flex;flex-direction:column;gap:8px;">
  ${r.topQuestions.slice(0, 10).map(q => `
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
      <div style="font-weight:600;font-size:13px;color:#1d4ed8;">Q: ${esc(q.question)}</div>
      <div style="font-size:12px;color:#374151;margin-top:4px;">${esc(q.answer)}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:4px;">
        <span style="background:#f3f4f6;padding:1px 5px;border-radius:3px;">${esc(q.category)}</span>
        ${q.votes > 0 ? `&middot; ${q.votes} votes` : ''}
        &middot; ${q.asin}
      </div>
    </div>
  `).join('')}
</div>`)
  }

  return parts.join('')
}

function buildImageRecommendations(r: MarketIntelligenceResult): string {
  if (!r.imageRecommendations?.length) return ''
  return `${sectionHeader('Image Recommendations')}
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
  <ol style="padding-left:20px;font-size:13px;line-height:1.8;">
    ${r.imageRecommendations.map(rec => `<li style="margin-bottom:4px;">${esc(rec)}</li>`).join('')}
  </ol>
</div>`
}

function buildCompetitiveLandscape(r: MarketIntelligenceResult): string {
  if (!r.competitiveLandscape?.length) return ''
  return `
<div style="page-break-before:always;"></div>
${sectionHeader('Competitive Landscape Analysis')}
<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb;">
  <thead>
    <tr style="background:#f9fafb;">
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;font-weight:600;">Brand</th>
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;font-weight:600;">Rating</th>
      <th style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-weight:600;">Reviews</th>
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;font-weight:600;">Category</th>
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;font-weight:600;">Key Features</th>
      <th style="text-align:right;padding:8px;border:1px solid #e5e7eb;font-weight:600;">Market Share</th>
    </tr>
  </thead>
  <tbody>
    ${r.competitiveLandscape.map(c => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;font-weight:500;">${esc(c.brand)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;"><span style="color:#eab308;">${stars(c.avgRating)}</span> ${c.avgRating.toFixed(1)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${c.reviewCount.toLocaleString()}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;color:#6b7280;">${esc(c.category)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;"><ul style="margin:0;padding-left:14px;font-size:11px;color:#6b7280;">${c.keyFeatures.slice(0, 3).map(f => `<li>${esc(f)}</li>`).join('')}</ul></td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:500;">${esc(c.marketShare)}</td>
      </tr>
    `).join('')}
  </tbody>
</table>`
}

function buildDetailedAvatars(r: MarketIntelligenceResult): string {
  if (!r.detailedAvatars?.length) return ''
  return `${sectionHeader('Detailed Customer Avatars')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
  ${r.detailedAvatars.map(a => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:40px;height:40px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#1d4ed8;">${esc(a.initials)}</div>
        <div>
          <div style="font-weight:600;font-size:14px;">${esc(a.name)}</div>
          <div style="font-size:11px;color:#6b7280;">${esc(a.role)} &middot; ${a.buyerPercentage}% of buyers</div>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px;">Demographics</div>
        <div style="font-size:11px;color:#374151;display:grid;grid-template-columns:1fr 1fr;gap:2px;">
          <span>Age: ${a.demographics.age}</span>
          <span>Location: ${esc(a.demographics.location)}</span>
          <span>Gender: ${esc(a.demographics.gender)}</span>
          <span>Income: ${esc(a.demographics.income)}</span>
          <span>Purchase: ${esc(a.demographics.purchaseFrequency)}</span>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px;">Psychographics</div>
        <div style="font-size:11px;color:#6b7280;">
          Lifestyle: ${esc(a.psychographics.lifestyle)}<br>
          Values: ${a.psychographics.values.map(v => esc(v)).join(', ')}<br>
          Interests: ${a.psychographics.interests.map(v => esc(v)).join(', ')}
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px;">Buying Behavior</div>
        <ul style="padding-left:16px;margin:0;font-size:11px;color:#374151;">
          ${a.buyingBehavior.map(b => `<li style="margin-bottom:2px;">${esc(b)}</li>`).join('')}
        </ul>
      </div>
      <div style="background:#eff6ff;border-radius:6px;padding:10px;">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px;">Key Motivations</div>
        <div style="font-size:11px;color:#6b7280;">${esc(a.keyMotivations)}</div>
      </div>
    </div>
  `).join('')}
</div>`
}

function buildKeyMarketInsights(r: MarketIntelligenceResult): string {
  if (!r.keyMarketInsights) return ''
  const i = r.keyMarketInsights
  return `${sectionHeader('Key Market Insights')}
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#f5f3ff;">
    <div style="font-weight:600;font-size:12px;color:#7c3aed;margin-bottom:8px;">Primary Target Market</div>
    <div style="font-weight:700;font-size:22px;color:#6d28d9;">${esc(i.primaryTargetMarket.priceRange)}</div>
    <div style="font-size:10px;color:#6b7280;margin-bottom:8px;">Optimal Price Range</div>
    <div style="font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
      <div><span style="color:#9ca3af;">Region:</span> <strong>${esc(i.primaryTargetMarket.region)}</strong></div>
      <div><span style="color:#9ca3af;">Income:</span> <strong>${esc(i.primaryTargetMarket.income)}</strong></div>
      <div style="grid-column:1/3;"><span style="color:#9ca3af;">Age:</span> <strong>${esc(i.primaryTargetMarket.ageRange)}</strong></div>
    </div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#f0fdf4;">
    <div style="font-weight:600;font-size:12px;color:#16a34a;margin-bottom:8px;">Growth Opportunity</div>
    <div style="font-weight:700;font-size:22px;color:#15803d;">${esc(i.growthOpportunity.growthRate)}</div>
    <div style="font-size:10px;color:#6b7280;margin-bottom:8px;">Annual Growth Rate</div>
    <div style="font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
      <div><span style="color:#9ca3af;">Focus:</span> <strong>${esc(i.growthOpportunity.focusArea)}</strong></div>
      <div><span style="color:#9ca3af;">Type:</span> <strong>${esc(i.growthOpportunity.marketType)}</strong></div>
    </div>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#fffbeb;">
    <div style="font-weight:600;font-size:12px;color:#ca8a04;margin-bottom:8px;">Feature Priority</div>
    <div style="font-weight:700;font-size:22px;color:#a16207;">${esc(i.featurePriority.importance)}</div>
    <div style="font-size:10px;color:#6b7280;margin-bottom:8px;">Feature Importance</div>
    <ul style="padding-left:16px;margin:0;font-size:11px;">
      ${i.featurePriority.features.map(f => `<li style="margin-bottom:2px;">${esc(f)}</li>`).join('')}
    </ul>
  </div>
</div>`
}

function buildStrategicRecommendations(r: MarketIntelligenceResult): string {
  if (!r.strategicRecommendations) return ''
  const panels = [
    { title: 'Pricing Strategy', items: r.strategicRecommendations.pricing, bg: '#f5f3ff', accent: '#7c3aed' },
    { title: 'Product Strategy', items: r.strategicRecommendations.product, bg: '#eff6ff', accent: '#2563eb' },
    { title: 'Marketing Strategy', items: r.strategicRecommendations.marketing, bg: '#f0fdf4', accent: '#16a34a' },
    { title: 'Operations Strategy', items: r.strategicRecommendations.operations, bg: '#fffbeb', accent: '#ca8a04' },
  ]
  return `${sectionHeader('Strategic Recommendations')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
  ${panels.map(p => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:${p.bg};">
      <div style="font-weight:600;font-size:13px;color:${p.accent};margin-bottom:8px;">${p.title}</div>
      <ul style="padding-left:16px;margin:0;font-size:12px;line-height:1.7;">
        ${(p.items || []).map(item => `<li style="margin-bottom:4px;">${esc(item)}</li>`).join('')}
      </ul>
    </div>
  `).join('')}
</div>`
}

function buildMessagingFramework(r: MarketIntelligenceResult): string {
  if (!r.messagingFramework) return ''
  const f = r.messagingFramework
  let html = `${sectionHeader('Messaging Framework')}
<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;margin-bottom:14px;">
  <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#4f46e5;margin-bottom:6px;">Primary Message</div>
  <div style="font-size:15px;font-weight:600;">${esc(f.primaryMessage)}</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Support Points</div>
    <ul style="padding-left:16px;margin:0;font-size:12px;line-height:1.7;">
      ${f.supportPoints.map(p => `<li style="margin-bottom:3px;">${esc(p)}</li>`).join('')}
    </ul>
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Proof Points</div>
    <ul style="padding-left:16px;margin:0;font-size:12px;line-height:1.7;">
      ${f.proofPoints.map(p => `<li style="margin-bottom:3px;">${esc(p)}</li>`).join('')}
    </ul>
  </div>
</div>
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;background:#fffbeb;">
  <div style="font-weight:600;font-size:13px;margin-bottom:4px;">Risk Reversal</div>
  <div style="font-size:12px;color:#6b7280;">${esc(f.riskReversal)}</div>
</div>`

  // Customer Voice Phrases
  if (r.customerVoicePhrases) {
    const vp = r.customerVoicePhrases
    const phraseGroup = (title: string, phrases: string[], color: string) => {
      if (!phrases?.length) return ''
      return `
        <div>
          <div style="font-size:11px;font-weight:600;color:${color};margin-bottom:6px;">${title}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${phrases.map(p => `<span style="background:#f3f4f6;padding:3px 8px;border-radius:12px;font-size:11px;">"${esc(p)}"</span>`).join('')}
          </div>
        </div>`
    }
    html += `<div style="margin-top:16px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;">Authentic Customer Voice</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${phraseGroup('Positive Emotional', vp.positiveEmotional, '#16a34a')}
        ${phraseGroup('Functional', vp.functional, '#2563eb')}
        ${phraseGroup('Use Case Language', vp.useCaseLanguage, '#7c3aed')}
      </div>
    </div>`
  }

  return html
}

function buildCompetitorPatterns(r: MarketIntelligenceResult): string {
  if (!r.competitorPatterns) return ''
  const p = r.competitorPatterns
  let html = `${sectionHeader('Competitor Patterns')}`

  // Title patterns + Bullet themes
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">`

  if (p.titlePatterns?.length) {
    html += `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;">Title Structure Patterns</div>
      ${p.titlePatterns.map(tp => `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="font-weight:500;">${esc(tp.pattern)}</span>
            <span style="color:#9ca3af;">${tp.frequency} competitors</span>
          </div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">e.g. "${esc(tp.example)}"</div>
        </div>
      `).join('')}
    </div>`
  }

  if (p.bulletThemes?.length) {
    html += `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px;">Common Bullet Themes</div>
      ${p.bulletThemes.map(bt => `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="font-weight:500;">${esc(bt.theme)}</span>
            <span style="color:#9ca3af;">${bt.frequency} competitors</span>
          </div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">e.g. "${esc(bt.example)}"</div>
        </div>
      `).join('')}
    </div>`
  }

  html += `</div>`

  // Pricing range
  if (p.pricingRange) {
    const pr = p.pricingRange
    html += `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Pricing Landscape</div>
      <div style="display:flex;gap:32px;font-size:13px;">
        <div><span style="color:#9ca3af;">Min:</span> <strong>${pr.currency}${pr.min.toFixed(2)}</strong></div>
        <div><span style="color:#9ca3af;">Avg:</span> <strong>${pr.currency}${pr.average.toFixed(2)}</strong></div>
        <div><span style="color:#9ca3af;">Median:</span> <strong>${pr.currency}${pr.median.toFixed(2)}</strong></div>
        <div><span style="color:#9ca3af;">Max:</span> <strong>${pr.currency}${pr.max.toFixed(2)}</strong></div>
      </div>
    </div>`
  }

  return html
}

// ─── Main generator ────────────────────────────────────────────

export function generateMIReportHTML(
  analysisResult: MarketIntelligenceResult,
  competitorsData: Array<Record<string, unknown>>,
  options: MIPdfOptions,
): string {
  const r = analysisResult
  const body = [
    buildExecutiveSummary(r),
    buildSentimentAnalysis(r),
    buildPainPoints(r),
    buildMotivations(r),
    buildBuyingFactors(r),
    buildCustomerSegments(r),
    buildCompetitorProducts(competitorsData, options.marketplaceDomain),
    buildQnASection(r),
    buildImageRecommendations(r),
    buildCompetitiveLandscape(r),
    buildDetailedAvatars(r),
    buildKeyMarketInsights(r),
    buildStrategicRecommendations(r),
    buildMessagingFramework(r),
    buildCompetitorPatterns(r),
  ].filter(Boolean).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Market Intelligence: ${esc(options.keyword)} — ${esc(options.marketplace)}</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 0; font-size: 13px; line-height: 1.5; }
    img { max-width: 100%; }
    a { color: #2563eb; }
    table { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div style="max-width:780px;margin:0 auto;padding:32px 20px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:22px;margin:0 0 6px;">${options.flagEmoji || ''} Market Intelligence Report</h1>
      <div style="font-size:18px;font-weight:700;color:#1d4ed8;margin-bottom:8px;">"${esc(options.keyword)}"</div>
      <div style="font-size:12px;color:#6b7280;">
        ${esc(options.marketplace)} &middot; ${options.competitorCount} competitors analyzed &middot; ${esc(options.date)}
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

// ─── Download trigger ──────────────────────────────────────────

export function downloadMIReport(html: string): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to download the PDF report.')
    return
  }

  printWindow.document.write(html)
  printWindow.document.close()

  // Wait for images to load before triggering print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }
}
