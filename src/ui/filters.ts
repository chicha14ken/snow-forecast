/**
 * フィルター・コントロールパネル HTML 生成
 */

import type { AppState, Pref, Preset } from '../types'

export function renderFilters(state: AppState): string {
  const presets: { value: Preset; icon: string; label: string }[] = [
    { value: 'powder', icon: '🌨️', label: 'パウダー重視' },
    { value: 'comfort', icon: '⛷️', label: '快適重視' },
  ]

  const prefs: { value: Pref | 'all'; label: string }[] = [
    { value: 'all', label: '全エリア' },
    { value: 'niigata', label: '新潟' },
    { value: 'gunma', label: '群馬' },
    { value: 'nagano', label: '長野' },
  ]

  return `
  <div class="panel">
    <div class="panel-inner">
      <div class="row-2">
        <div class="field">
          <label>📅 日付</label>
          <input type="date" id="targetDate" value="${state.date}" />
        </div>
        <div class="field">
          <label>🏔️ エリア</label>
          <select id="prefFilter">
            ${prefs.map(p => `<option value="${p.value}"${state.pref === p.value ? ' selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div>
        <div class="field-label">🎯 モード</div>
        <div class="preset-row">
          ${presets.map(p => `
          <button class="preset-btn${state.preset === p.value ? ' active' : ''}" data-preset="${p.value}">
            <span class="preset-icon">${p.icon}</span>
            ${p.label}
          </button>`).join('')}
        </div>
      </div>

      <button class="search-btn" id="searchBtn" ${state.isLoading ? 'disabled' : ''}>
        ${state.isLoading ? '⏳ 取得中…' : '🔍 ゲレンデを探す'}
      </button>
    </div>
  </div>`
}
