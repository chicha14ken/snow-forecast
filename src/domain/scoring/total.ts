/**
 * トータルスコア計算 + confidence 補正 + reasons 生成
 */

import { calcSubScores } from './scores'
import { PRESETS, REQUIRED_FIELDS, CONFIDENCE_BASE } from './scoreConfig'
import { clamp100 } from './normalize'
import type { DailyRepr, SubScores, ScorePackage, Preset } from '../../types'

// ======================================================
// Confidence 計算
// ======================================================

function calcConfidence(r: DailyRepr): number {
  const got = REQUIRED_FIELDS.filter(f => r[f] !== null).length
  return got / REQUIRED_FIELDS.length
}

// ======================================================
// Reasons 生成
// ======================================================

function buildReasons(r: DailyRepr, sub: SubScores): string[] {
  const reasons: string[] = []

  // 降雪
  if (r.fresh24cm !== null) {
    if (r.fresh24cm >= 20) reasons.push(`大雪 ${r.fresh24cm.toFixed(0)}cm`)
    else if (r.fresh24cm >= 5) reasons.push(`新雪 ${r.fresh24cm.toFixed(0)}cm`)
    else if (r.fresh24cm > 0) reasons.push(`降雪 ${r.fresh24cm.toFixed(1)}cm`)
    else reasons.push('新雪なし')
  }

  // 気温
  if (r.tempSummit !== null) {
    const t = r.tempSummit.toFixed(1)
    if (r.tempSummit <= -10) reasons.push(`超低温 ${t}℃`)
    else if (r.tempSummit <= -6) reasons.push(`サラサラ温度 ${t}℃`)
    else if (r.tempSummit <= 0) reasons.push(`山頂 ${t}℃`)
    else reasons.push(`暖 ${t}℃`)
  }

  // 風速
  if (r.windSummit !== null) {
    const w = r.windSummit.toFixed(1)
    if (r.windSummit >= 20) reasons.push(`強風 ${w}m/s ⚠️`)
    else if (r.windSummit >= 12) reasons.push(`やや強風 ${w}m/s`)
    else if (r.windSummit >= 6) reasons.push(`微風 ${w}m/s`)
    else reasons.push(`穏やか ${w}m/s`)
  }

  // 雲量
  if (r.cloud !== null) {
    const c = Math.round(r.cloud)
    if (c <= 15) reasons.push(`快晴 ${c}%`)
    else if (c <= 40) reasons.push(`晴れ ${c}%`)
    else if (c <= 70) reasons.push(`曇り ${c}%`)
    else reasons.push(`厚雲 ${c}%`)
  }

  // 午後降雪予報
  if (r.snowfallNext12 !== null && r.snowfallNext12 >= 2) {
    reasons.push(`午後 +${r.snowfallNext12.toFixed(0)}cm予報`)
  }

  return reasons
}

// ======================================================
// トータル計算
// ======================================================

/**
 * 日次代表値からスコアパッケージを計算する
 *
 * @param repr 正規化済み日次代表値
 * @param preset 'powder' | 'comfort'
 * @param debugId デバッグ用 (resort.id 等)
 */
export function calcScorePackage(
  repr: DailyRepr,
  preset: Preset,
  debugId?: string,
): ScorePackage {
  const weights = PRESETS[preset]
  const sub = calcSubScores(repr)
  const confidence = calcConfidence(repr)

  // 生トータル
  const rawTotal =
    sub.powder   * weights.powder +
    sub.bluebird * weights.bluebird +
    sub.comfort  * weights.comfort +
    sub.ops      * weights.ops

  // confidence 補正: 必須データが揃うほど信頼度が上がる
  const adjusted = rawTotal * (CONFIDENCE_BASE + (1 - CONFIDENCE_BASE) * confidence)
  const total = clamp100(adjusted)

  const reasons = buildReasons(repr, sub)

  if (import.meta.env.DEV && debugId) {
    console.debug(`[scoring] ${debugId} (${preset})`, {
      repr,
      sub,
      rawTotal: Math.round(rawTotal),
      confidence: confidence.toFixed(2),
      total,
    })
  }

  return { subScores: sub, total, confidence, reasons, repr }
}
