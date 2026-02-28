/**
 * スコアリング設定 — 閾値・重みの一元管理
 *
 * 変更は必ずここだけで行う。スコア計算関数はここの値を参照する。
 */

// -------- PowderScore 閾値 --------
export const POWDER = {
  /** 降雪量: この値で満点 100 [cm] */
  SNOW_MAX_CM: 30,
  /** 気温: この値以下でドライパウダー [-℃ で表す; 正数が cold 側] */
  TEMP_DRY_C: -3,
  /** 気温: この値以下でサラサラパウダー */
  TEMP_GREAT_C: -6,
  /** 気温: この値以下で超サラサラ */
  TEMP_EPIC_C: -10,
  /** 気温スコアの最低値 (暖かい日) */
  TEMP_WARM_SCORE: 10,
  /** 風速: この値以上でパウダースコアにペナルティ開始 [m/s] */
  WIND_PENALTY_START_MS: 8,
  /** 風速: この値以上で最大ペナルティ [m/s] */
  WIND_PENALTY_MAX_MS: 18,
} as const

// -------- BluebirdScore 閾値 --------
export const BLUEBIRD = {
  /** 雲量: この値以下で快晴スコア高 [%] */
  CLOUD_CLEAR: 20,
  /** 雲量: この値以上で低スコア [%] */
  CLOUD_OVERCAST: 70,
  /** 風速: この値以上でブルーバードを阻害 [m/s] */
  WIND_PENALTY_START_MS: 6,
  /** 午後降雪ボーナス: この値以上で微加点 [cm/12h] */
  NEXT_SNOW_BONUS_CM: 1,
} as const

// -------- ComfortScore 閾値 --------
export const COMFORT = {
  /** 気温: スキー快適温度の中心 [℃] */
  TEMP_IDEAL_C: -3,
  /** 気温: この範囲内が快適 [±℃] */
  TEMP_RANGE_C: 7,
  /** 風速: この値以上で不快 [m/s] */
  WIND_DISCOMFORT_MS: 8,
  /** 風速: この値以上で最大不快 [m/s] */
  WIND_MAX_MS: 15,
} as const

// -------- OpsScore --------
export const OPS = {
  /** 風速: この値以上でリフト運休リスク大 [m/s] */
  LIFT_RISK_MS: 15,
  /** 風速: この値以上でリフト運休高確率 [m/s] */
  LIFT_SHUTDOWN_MS: 20,
} as const

// -------- Confidence --------
/** 必須フィールド: これらが揃うほど confidence が上がる */
export const REQUIRED_FIELDS = [
  'fresh24cm',
  'tempSummit',
  'windSummit',
  'cloud',
] as const satisfies readonly (keyof import('../../types').DailyRepr)[]

/** confidence 補正係数: TotalAdjusted = Total × (BASE + (1-BASE) × confidence) */
export const CONFIDENCE_BASE = 0.80

// -------- プリセット重み --------
export type PresetWeights = {
  powder: number
  bluebird: number
  comfort: number
  ops: number
}

export const PRESETS: Record<string, PresetWeights> = {
  powder: { powder: 0.55, bluebird: 0.15, comfort: 0.15, ops: 0.15 },
  comfort: { powder: 0.15, bluebird: 0.20, comfort: 0.30, ops: 0.35 },
} as const
