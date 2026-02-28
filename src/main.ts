/**
 * アプリケーションエントリーポイント
 */

import './style.css'
import type { Resort, AppState, RankEntry, Pref, Preset } from './types'
import { fetchWeatherRepr } from './providers/openMeteo'
import { calcScorePackage } from './domain/scoring/total'
import { renderFilters } from './ui/filters'
import { renderLoading, renderError, renderEmpty, renderRanking } from './ui/ranking'

// ============================================================
// 状態
// ============================================================

function todayJST(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let state: AppState = {
  date: todayJST(),
  pref: 'all',
  preset: 'powder',
  isLoading: false,
  error: null,
  entries: [],
}

let allResorts: Resort[] = []

// ============================================================
// DOM ヘルパー
// ============================================================

function $(id: string): HTMLElement | null {
  return document.getElementById(id)
}

function getApp(): HTMLElement {
  return document.getElementById('app')!
}

// ============================================================
// レンダリング
// ============================================================

function render() {
  const app = getApp()

  const filtersHtml = renderFilters(state)

  let resultsHtml: string
  if (state.isLoading) {
    resultsHtml = `<div class="results-wrap">${renderLoading(0, 0)}</div>`
  } else if (state.error) {
    resultsHtml = `<div class="results-wrap">${renderError(state.error)}</div>`
  } else if (state.entries.length === 0) {
    resultsHtml = `<div class="results-wrap">${renderEmpty()}</div>`
  } else {
    const filtered = state.pref === 'all'
      ? state.entries
      : state.entries.filter(e => e.resort.pref === state.pref)
    const total = state.pref === 'all'
      ? allResorts.length
      : allResorts.filter(r => r.pref === state.pref).length
    resultsHtml = `<div class="results-wrap">${renderRanking(filtered, state.preset, state.date, total)}</div>`
  }

  app.innerHTML = `
  <header>
    <h1>❄️ <span>Snow</span> Forecast</h1>
    <p>新潟・群馬・長野 63スキー場 — 体験スコアでランキング</p>
  </header>
  ${filtersHtml}
  <div id="resultsContainer">${resultsHtml}</div>`

  bindEvents()
}

function updateResults() {
  const container = document.getElementById('resultsContainer')
  if (!container) return

  if (state.isLoading) {
    container.innerHTML = `<div class="results-wrap">${renderLoading(0, 0)}</div>`
    return
  }

  const filtered = state.pref === 'all'
    ? state.entries
    : state.entries.filter(e => e.resort.pref === state.pref)
  const total = state.pref === 'all'
    ? allResorts.length
    : allResorts.filter(r => r.pref === state.pref).length

  if (state.error) {
    container.innerHTML = `<div class="results-wrap">${renderError(state.error)}</div>`
  } else if (state.entries.length === 0 && !state.isLoading) {
    container.innerHTML = `<div class="results-wrap">${renderEmpty()}</div>`
  } else {
    container.innerHTML = `<div class="results-wrap">${renderRanking(filtered, state.preset, state.date, total)}</div>`
  }
}

function setLoadingProgress(done: number, total: number) {
  const wrap = document.querySelector('.results-wrap')
  if (!wrap) return
  wrap.innerHTML = renderLoading(done, total)
}

// ============================================================
// イベントバインド
// ============================================================

function bindEvents() {
  // 日付
  const dateEl = $('targetDate') as HTMLInputElement | null
  if (dateEl) {
    dateEl.addEventListener('change', () => {
      state.date = dateEl.value
    })
  }

  // エリアフィルター
  const prefEl = $('prefFilter') as HTMLSelectElement | null
  if (prefEl) {
    prefEl.addEventListener('change', () => {
      state.pref = prefEl.value as Pref | 'all'
      updateResults()
    })
  }

  // プリセットボタン
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = (btn as HTMLElement).dataset.preset as Preset
      state.preset = preset
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      // スコアを再計算せず並び替えだけ反映したい場合は entries を再ソート
      if (state.entries.length > 0) {
        rebuildEntries()
      }
    })
  })

  // 検索ボタン
  const searchBtn = $('searchBtn')
  if (searchBtn) {
    searchBtn.addEventListener('click', fetchAndRank)
  }
}

// ============================================================
// エントリー再計算 (プリセット切替時)
// ============================================================

// 最後に取得した repr キャッシュ
const reprCache = new Map<string, import('./types').DailyRepr>()

function rebuildEntries() {
  const entries: RankEntry[] = []
  for (const [id, repr] of reprCache.entries()) {
    const resort = allResorts.find(r => r.id === id)
    if (!resort) continue
    const score = calcScorePackage(repr, state.preset, id)
    entries.push({ resort, score, rank: 0 })
  }
  entries.sort((a, b) => b.score.total - a.score.total)
  entries.forEach((e, i) => { e.rank = i + 1 })
  state.entries = entries
  updateResults()
}

// ============================================================
// メイン取得・スコアリング
// ============================================================

async function fetchAndRank() {
  const dateEl = $('targetDate') as HTMLInputElement | null
  const date = dateEl?.value ?? state.date
  if (!date) { alert('日付を選択してください'); return }

  state.date = date
  state.isLoading = true
  state.error = null
  state.entries = []
  reprCache.clear()

  // ボタン無効化
  const searchBtn = $('searchBtn')
  if (searchBtn) (searchBtn as HTMLButtonElement).disabled = true

  const container = document.getElementById('resultsContainer')
  if (container) container.innerHTML = `<div class="results-wrap">${renderLoading(0, allResorts.length)}</div>`

  let done = 0
  const total = allResorts.length

  const settled = await Promise.allSettled(
    allResorts.map(resort =>
      fetchWeatherRepr(resort, date).then(repr => {
        done++
        setLoadingProgress(done, total)
        return { resort, repr }
      }),
    ),
  )

  // スコア計算
  const entries: RankEntry[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const { resort, repr } = result.value
      reprCache.set(resort.id, repr)
      const score = calcScorePackage(repr, state.preset, resort.id)
      entries.push({ resort, score, rank: 0 })
    }
  }

  const failed = settled.filter(r => r.status === 'rejected').length
  if (failed > 0) console.warn(`[app] ${failed} resorts failed to fetch`)

  // ランク付け
  entries.sort((a, b) => b.score.total - a.score.total)
  entries.forEach((e, i) => { e.rank = i + 1 })

  state.entries = entries
  state.isLoading = false
  state.error = entries.length === 0 ? 'データを取得できませんでした' : null

  updateResults()

  if (searchBtn) (searchBtn as HTMLButtonElement).disabled = false
}

// ============================================================
// 起動
// ============================================================

async function init() {
  const app = getApp()
  app.innerHTML = `
  <header>
    <h1>❄️ <span>Snow</span> Forecast</h1>
    <p>新潟・群馬・長野 63スキー場 — 体験スコアでランキング</p>
  </header>
  <div class="results-wrap">${renderEmpty()}</div>`

  // resorts.json 読み込み
  // public/data/resorts.json を BASE_URL 経由で取得
  // scripts/build-resorts.ts の出力先と統一
  const base = import.meta.env.BASE_URL
  const resortsRes = await fetch(`${base}data/resorts.json`)
  if (!resortsRes.ok) throw new Error(`resorts.json の取得に失敗しました (${resortsRes.status})`)
  allResorts = (await resortsRes.json()) as Resort[]

  render()
}

init()
