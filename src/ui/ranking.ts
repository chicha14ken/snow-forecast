/**
 * ランキングリスト HTML 生成
 */

import { renderCard } from './card'
import type { RankEntry, Preset } from '../types'

const PRESET_LABEL: Record<Preset, string> = {
  powder: '🌨️ パウダー重視',
  comfort: '⛷️ 快適重視',
}

/** ローディング表示 */
export function renderLoading(done: number, total: number): string {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return `
  <div class="loading-state">
    <div class="spinner"></div>
    <p class="loading-text">気象データを取得中… ${done}/${total}</p>
    <div class="prog-wrap">
      <div class="prog-bar" style="width:${pct}%"></div>
    </div>
  </div>`
}

/** エラー表示 */
export function renderError(msg: string): string {
  return `<div class="error-state">⚠️ ${msg}</div>`
}

/** 初期の空状態 */
export function renderEmpty(): string {
  return `<div class="empty-state">
    <div class="empty-icon">🏔️</div>
    <p>日付とモードを選んで「ゲレンデを探す」を押してください</p>
    <p class="empty-sub">新潟・群馬・長野 63スキー場を比較</p>
  </div>`
}

/** ランキングリスト */
export function renderRanking(
  entries: RankEntry[],
  preset: Preset,
  date: string,
  total: number,
): string {
  if (entries.length === 0) return renderError('データを取得できたゲレンデがありません')

  const dateStr = new Date(date + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  })

  const reviewCount = entries.filter(e => e.resort.needs_review).length

  let html = `
  <div class="results-hdr">
    <h2>${PRESET_LABEL[preset]} ランキング</h2>
    <span class="results-meta">📅 ${dateStr} &nbsp;·&nbsp; ${entries.length}/${total}件取得</span>
  </div>`

  if (reviewCount > 0) {
    html += `<div class="review-note">
      📍 ${reviewCount}件は座標が自動取得できなかったため推定値を使用しています（<em>needs_review</em>）。
      正確なデータは <code>npm run build:summits</code> で更新できます。
    </div>`
  }

  html += entries.map(e => renderCard(e)).join('')

  html += `<div class="footer-note">
    ★ 気象データは Open-Meteo (ERA5/GFS) の山頂座標付近のモデル推計値です。
    実際のゲレンデコンディションは各スキー場公式サイトをご確認ください。
  </div>`

  return html
}
