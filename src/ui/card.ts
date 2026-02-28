/**
 * ゲレンデカード HTML 生成
 */

import type { RankEntry } from '../types'

const PREF_LABEL: Record<string, string> = {
  niigata: '新潟',
  gunma: '群馬',
  nagano: '長野',
}

/** パウダー質ラベル */
function powderQualityLabel(temp: number | null, snow: number | null): { label: string; color: string } {
  if (!snow || snow <= 0) return { label: '新雪なし', color: 'var(--muted)' }
  const t = temp ?? 0
  if (t <= -10) return { label: '🥶 超サラサラパウダー', color: '#81d4fa' }
  if (t <= -6) return { label: '❄️ サラサラパウダー', color: '#4fc3f7' }
  if (t <= -3) return { label: '🌨️ ドライパウダー', color: '#b3e5fc' }
  if (t <= 0) return { label: '💧 やや湿雪', color: '#ffd54f' }
  return { label: '💦 重い湿雪', color: '#ff8a65' }
}

/** 天気バナー情報 */
function wxBanner(cloud: number | null, snow: number | null, wind: number | null): {
  icon: string; label: string; bg: string; badges: string[]
} {
  const c = cloud ?? 80, s = snow ?? 0, w = wind ?? 0
  let icon: string, label: string, bg: string
  if (w >= 15 && c >= 70) { icon = '🌪️'; label = '吹雪・強風'; bg = 'rgba(239,83,80,.12)' }
  else if (s >= 20) { icon = '🌨️'; label = '大雪'; bg = 'rgba(79,195,247,.15)' }
  else if (s >= 5) { icon = '❄️'; label = '降雪あり'; bg = 'rgba(79,195,247,.10)' }
  else if (c <= 15) { icon = '☀️'; label = '快晴'; bg = 'rgba(255,213,79,.12)' }
  else if (c <= 40) { icon = '🌤️'; label = '晴れ時々曇り'; bg = 'rgba(255,213,79,.07)' }
  else if (c <= 70) { icon = '⛅'; label = '曇り'; bg = 'rgba(176,190,197,.08)' }
  else if (s >= 1) { icon = '🌨️'; label = '雪模様'; bg = 'rgba(79,195,247,.10)' }
  else { icon = '☁️'; label = '曇り'; bg = 'rgba(176,190,197,.06)' }

  const badges: string[] = []
  if (s >= 15) badges.push('<span class="badge badge-powder">🔥パウダー</span>')
  else if (s >= 5) badges.push('<span class="badge badge-snow">❄️新雪あり</span>')
  if (c !== null && c <= 25 && w < 8) badges.push('<span class="badge badge-sun">👁️視界良好</span>')
  if (w >= 20) badges.push('<span class="badge badge-danger">🚨リフト危険</span>')
  else if (w >= 15) badges.push('<span class="badge badge-warn">⚠️リフト注意</span>')
  else if (w >= 8) badges.push('<span class="badge badge-wind">💨強風注意</span>')

  return { icon, label, bg, badges }
}

/** スコアバーの色 */
function scoreColor(score: number): string {
  if (score >= 80) return 'var(--green)'
  if (score >= 60) return 'var(--accent)'
  if (score >= 40) return 'var(--orange)'
  return 'var(--red)'
}

/** サブスコアバー1つ */
function subBar(name: string, val: number): string {
  const color = scoreColor(val)
  return `<div class="bd-item">
    <div class="bd-name">${name}</div>
    <div class="bd-num" style="color:${color}">${val}<span class="bd-unit">/100</span></div>
    <div class="bd-bar"><div class="bd-fill" style="width:${val}%;background:${color}"></div></div>
  </div>`
}

export function renderCard(entry: RankEntry): string {
  const { resort, score, rank } = entry
  const { subScores, total, confidence, reasons, repr } = score
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
  const rankClass = rank <= 3 ? `r${rank}` : 'rN'

  const wx = wxBanner(repr.cloud, repr.fresh24cm, repr.windSummit)
  const pq = powderQualityLabel(repr.tempSummit, repr.fresh24cm)

  const tempStr = repr.tempSummit !== null ? `${repr.tempSummit.toFixed(1)}℃` : '--℃'
  const windStr = repr.windSummit !== null ? `${repr.windSummit.toFixed(1)}m/s` : '--m/s'
  const cloudStr = repr.cloud !== null ? `${Math.round(repr.cloud)}%` : '--%'
  const snowStr = repr.fresh24cm !== null ? `${repr.fresh24cm.toFixed(1)}cm` : '--cm'
  const next12Str = repr.snowfallNext12 !== null && repr.snowfallNext12 > 0
    ? `+${repr.snowfallNext12.toFixed(0)}cm`
    : '--'

  const confidencePct = Math.round(confidence * 100)
  const lowConf = confidence < 0.75
  const needsReviewHtml = resort.needs_review
    ? `<span class="review-badge" title="座標を要確認">📍要確認</span>`
    : ''
  const lowConfHtml = lowConf
    ? `<span class="conf-badge">データ不完全 ${confidencePct}%</span>`
    : ''

  const reasonsHtml = reasons.map(r => `<span class="reason-chip">${r}</span>`).join('')

  return `<div class="card ${rankClass}" data-id="${resort.id}">
    <div class="wx-banner" style="background:${wx.bg}">
      <div class="wx-icon">${wx.icon}</div>
      <div>
        <div class="wx-label">${wx.label}</div>
        <div class="wx-sub">${tempStr} &nbsp;·&nbsp; 雲${cloudStr} &nbsp;·&nbsp; 風${windStr}</div>
      </div>
      ${wx.badges.length ? `<div class="wx-badges">${wx.badges.join('')}</div>` : ''}
    </div>

    <div class="card-body">
      <div class="card-head">
        <div class="rank-num">${medal}</div>
        <div class="resort-info">
          <div class="resort-name">${resort.name}${needsReviewHtml}${lowConfHtml}</div>
          <div class="resort-sub">
            <span class="pref-chip">${PREF_LABEL[resort.pref] || resort.pref}</span>
            TOP ${resort.summit.ele_m.toLocaleString()}m
          </div>
        </div>
      </div>

      <div class="score-row">
        <div class="score-val" style="color:${scoreColor(total)}">${total}</div>
        <div class="score-bar-bg">
          <div class="score-bar-fill" style="width:${total}%;background:${scoreColor(total)}"></div>
        </div>
        <div class="score-label">/ 100</div>
      </div>

      <div class="metrics">
        <div class="metric hl">
          <div class="metric-val" style="color:#81d4fa">${snowStr}</div>
          <div class="metric-label">当日新雪</div>
        </div>
        <div class="metric hl">
          <div class="metric-val" style="color:#4fc3f7">${next12Str}</div>
          <div class="metric-label">次12h予報</div>
        </div>
        <div class="metric">
          <div class="metric-val">${tempStr}</div>
          <div class="metric-label">山頂気温</div>
        </div>
        <div class="metric">
          <div class="metric-val" style="color:${(repr.windSummit ?? 0) >= 15 ? 'var(--red)' : 'inherit'}">${windStr}</div>
          <div class="metric-label">風速(朝)</div>
        </div>
      </div>

      <div class="snow-quality" style="color:${pq.color}">${pq.label}</div>

      <div class="reasons">${reasonsHtml}</div>

      <div class="bd-toggle" onclick="this.nextElementSibling.classList.toggle('open'); this.querySelector('.chevron').textContent = this.nextElementSibling.classList.contains('open') ? '▲' : '▼'">
        スコア内訳 <span class="chevron">▼</span>
      </div>
      <div class="bd-panel">
        <div class="bd-grid">
          ${subBar('🌨️ パウダー', subScores.powder)}
          ${subBar('☀️ 快晴', subScores.bluebird)}
          ${subBar('🧊 快適性', subScores.comfort)}
          ${subBar('🚡 運行', subScores.ops)}
        </div>
        <div class="conf-row">
          データ信頼度: <strong>${confidencePct}%</strong>
          ${resort.summit.source !== 'overpass_peak' ? `&nbsp;·&nbsp; 座標: <em>${resort.summit.source}</em>` : ''}
        </div>
      </div>
    </div>
  </div>`
}
