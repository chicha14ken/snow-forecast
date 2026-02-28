// ============================================================
// 型定義
// ============================================================

/** 都道府県 */
export type Pref = 'niigata' | 'gunma' | 'nagano'

/** スコアプリセット */
export type Preset = 'powder' | 'comfort'

/** ゲレンデデータ (resorts.json スキーマ) */
export interface Resort {
  id: string
  name: string
  pref: Pref
  base: { lat: number; lon: number }
  summit: {
    lat: number
    lon: number
    ele_m: number
    source: 'overpass_peak' | 'resort_ele' | 'fallback_base' | 'manual'
  }
  needs_review: boolean
  aliases: string[]
  priority: number
}

// -------- Open-Meteo 応答 --------

/** Open-Meteo hourly 生データ (1ゲレンデ分) */
export interface RawHourly {
  time: string[]            // ISO8601 (Asia/Tokyo) e.g. "2024-01-15T06:00"
  snowfall: (number | null)[]      // mm
  temperature_2m: (number | null)[]// ℃
  windspeed_10m: (number | null)[] // km/h → m/s に変換後
  cloudcover: (number | null)[]    // %
  snow_depth: (number | null)[]    // m
}

/** 正規化済み日次代表値 (null = データ欠損) */
export interface DailyRepr {
  /** 対象日の 00:00-23:00 降雪量合計 [cm] */
  fresh24cm: number | null
  /** 対象日の 06:00-10:00 最大風速 [m/s] */
  windSummit: number | null
  /** 対象日の 06:00-10:00 平均気温 [℃] */
  tempSummit: number | null
  /** 対象日の 06:00-10:00 平均雲量 [%] */
  cloud: number | null
  /** 現在時刻から 12 時間の降雪量合計 [cm] (予報) */
  snowfallNext12: number | null
  /** 積雪深の最新有効値 [cm] (補助用) */
  snowDepthCm: number | null
}

// -------- スコア --------

/** サブスコア (各 0-100) */
export interface SubScores {
  powder: number
  bluebird: number
  comfort: number
  ops: number
}

/** 1 ゲレンデの完全なスコアパッケージ */
export interface ScorePackage {
  subScores: SubScores
  total: number           // confidence 補正済み 0-100
  confidence: number      // 0.0-1.0
  reasons: string[]       // 表示用テキスト
  repr: DailyRepr         // デバッグ用
}

/** ランキング 1 件 */
export interface RankEntry {
  resort: Resort
  score: ScorePackage
  rank: number
}

/** UI 状態 */
export interface AppState {
  date: string          // YYYY-MM-DD (JST)
  pref: Pref | 'all'
  preset: Preset
  isLoading: boolean
  error: string | null
  entries: RankEntry[]
}
