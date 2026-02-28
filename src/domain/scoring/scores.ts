/**
 * サブスコア計算
 *
 * 全て純関数。null 入力は 0 として扱う (呼び出し前に null guard する)。
 * 各スコアは 0-100 で返す。
 */

import { piecewise, linear, linearInv, clamp100 } from './normalize'
import { POWDER, BLUEBIRD, COMFORT, OPS } from './scoreConfig'
import type { DailyRepr, SubScores } from '../../types'

// ======================================================
// PowderScore — パウダー体験
// ======================================================

/** 気温からドライパウダー係数 (0-1) を計算 */
function tempPowderFactor(tempC: number): number {
  // -10℃以下=1.0, -6℃=0.8, -3℃=0.5, 0℃=0.2, +3℃以上=0
  return piecewise(tempC, [
    [POWDER.TEMP_EPIC_C, 100],
    [POWDER.TEMP_GREAT_C, 80],
    [POWDER.TEMP_DRY_C, 50],
    [0, 20],
    [3, 0],
  ]) / 100
}

/** 風によるパウダー体験ペナルティ (0-30点) */
function windPowderPenalty(windMs: number): number {
  return piecewise(windMs, [
    [POWDER.WIND_PENALTY_START_MS, 0],
    [POWDER.WIND_PENALTY_MAX_MS, 30],
  ])
}

export function calcPowderScore(r: DailyRepr): number {
  const snow = r.fresh24cm ?? 0
  const temp = r.tempSummit ?? 0
  const wind = r.windSummit ?? 0

  // 降雪量スコア (0-70点)
  const snowScore = Math.min(70, linear(snow, 0, POWDER.SNOW_MAX_CM) * 0.7)

  // 雪質係数 (温度で降雪スコアを補正)
  const qualityFactor = tempPowderFactor(temp)

  // 降雪なし時でも極低温ならベースパウダーとして加点
  const noSnowBase = snow === 0 ? 0 : snowScore * qualityFactor

  // 降雪がある場合: 降雪スコア × 雪質 + 補助温度点
  const powderBase = snow > 0
    ? Math.max(noSnowBase, snowScore * 0.4 + snowScore * 0.6 * qualityFactor)
    : 0

  // 気温単独スコア (降雪なしでも極低温は加点)
  const tempBonus = snow === 0 ? 0 : linear(-temp, -3, 12) * 0.3 // max 30

  const raw = powderBase + tempBonus - windPowderPenalty(wind)

  // 降雪量に応じた上限
  const snowCap = snow === 0 ? 20 : 100

  return clamp100(Math.min(raw, snowCap))
}

// ======================================================
// BluebirdScore — 快晴体験
// ======================================================

export function calcBluebirdScore(r: DailyRepr): number {
  const cloud = r.cloud ?? 80
  const wind = r.windSummit ?? 0
  const next12 = r.snowfallNext12 ?? 0

  // 雲量スコア (0-80点)
  const cloudScore = piecewise(cloud, [
    [BLUEBIRD.CLOUD_CLEAR, 80],
    [40, 50],
    [BLUEBIRD.CLOUD_OVERCAST, 10],
    [100, 0],
  ])

  // 風ペナルティ (0-20点)
  const windPenalty = piecewise(wind, [
    [BLUEBIRD.WIND_PENALTY_START_MS, 0],
    [12, 10],
    [18, 20],
  ])

  // 午後降雪ボーナス (次12hで少し降るのはブルーバード+パウダーで良い)
  const snowBonus = next12 >= BLUEBIRD.NEXT_SNOW_BONUS_CM
    ? Math.min(10, next12 * 2)
    : 0

  return clamp100(cloudScore - windPenalty + snowBonus)
}

// ======================================================
// ComfortScore — 快適性
// ======================================================

export function calcComfortScore(r: DailyRepr): number {
  const temp = r.tempSummit ?? 5
  const wind = r.windSummit ?? 0
  const cloud = r.cloud ?? 60

  // 気温快適スコア: -10〜+5℃が快適, -3℃ピーク
  const tempScore = piecewise(temp, [
    [-20, 20],
    [COMFORT.TEMP_IDEAL_C - COMFORT.TEMP_RANGE_C, 50], // -10℃
    [COMFORT.TEMP_IDEAL_C, 100],                        // -3℃ 最適
    [COMFORT.TEMP_IDEAL_C + COMFORT.TEMP_RANGE_C, 60], // +4℃
    [10, 20],
  ])

  // 風快適スコア
  const windScore = piecewise(wind, [
    [0, 100],
    [COMFORT.WIND_DISCOMFORT_MS, 60],
    [COMFORT.WIND_MAX_MS, 0],
  ])

  // 視界スコア (快適さに寄与)
  const visScore = linearInv(cloud, 0, 100)

  // 重み: 気温 40%, 風 40%, 視界 20%
  return clamp100(tempScore * 0.4 + windScore * 0.4 + visScore * 0.2)
}

// ======================================================
// OpsScore — リフト・運行状況
// ======================================================
// v1: リフトデータ未取得のため風速のみで推定
// v1.1: resorts.json に lift_total/lift_open を追加後にロジックを拡張できる
// 将来の拡張 IF は関数シグネチャを変更せず、引数を追加する形で対応

export function calcOpsScore(r: DailyRepr): number {
  const wind = r.windSummit ?? 0

  // 風速ベースのリフト運行リスク
  const windRiskScore = piecewise(wind, [
    [0, 100],
    [OPS.LIFT_RISK_MS, 60],     // 15 m/s: リスク開始
    [OPS.LIFT_SHUTDOWN_MS, 10], // 20 m/s: ほぼ運休
    [25, 0],
  ])

  return clamp100(windRiskScore)
}

// ======================================================
// 統合エントリーポイント
// ======================================================

export function calcSubScores(r: DailyRepr): SubScores {
  return {
    powder: calcPowderScore(r),
    bluebird: calcBluebirdScore(r),
    comfort: calcComfortScore(r),
    ops: calcOpsScore(r),
  }
}
