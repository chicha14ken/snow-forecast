/**
 * Open-Meteo 気象データプロバイダー
 *
 * 設計方針:
 * - Hourly データを使用し、06:00-10:00 の時間窓を精確に処理する
 * - 欠損データは 0 に潰さず null のまま返す
 * - 単位変換はここで完結させ、上位層に単位を意識させない
 *
 * 仮定:
 * - tempSummit は 06:00-10:00 の平均を採用
 *   (最低値は夜明け前=スキー時間前になりがちなため平均が妥当)
 * - windspeed は km/h → m/s に変換済みで返す
 * - snowfall は mm → cm に変換済みで返す
 * - snow_depth は m → cm に変換済みで返す
 */

import type { Resort, DailyRepr, RawHourly } from '../types'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const HOURLY_VARS = 'snowfall,temperature_2m,windspeed_10m,cloudcover,snow_depth'

/** JST タイムスタンプ文字列を作る */
function jstHour(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:00`
}

/** 配列から指定時刻範囲のインデックスを返す */
function rangeIdx(times: string[], from: string, to: string): number[] {
  const result: number[] = []
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= from && times[i] <= to) result.push(i)
  }
  return result
}

/** null を除いた平均 (すべて null なら null) */
function nullAvg(arr: (number | null)[], indices: number[]): number | null {
  const vals = indices.map(i => arr[i]).filter((v): v is number => v !== null)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/** null を除いた最大値 */
function nullMax(arr: (number | null)[], indices: number[]): number | null {
  const vals = indices.map(i => arr[i]).filter((v): v is number => v !== null)
  if (vals.length === 0) return null
  return Math.max(...vals)
}

/** null を除いた合計 */
function nullSum(arr: (number | null)[], indices: number[]): number | null {
  const vals = indices.map(i => arr[i]).filter((v): v is number => v !== null)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0)
}

/** km/h → m/s */
function kphToMs(v: number | null): number | null {
  return v === null ? null : Math.round(v / 3.6 * 10) / 10
}

/** mm → cm */
function mmToCm(v: number | null): number | null {
  return v === null ? null : Math.round(v / 10 * 10) / 10
}

/** m → cm */
function mToCm(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100)
}

/**
 * 1 ゲレンデの時系列を正規化された日次代表値に変換する
 * @param hourly Open-Meteo の hourly レスポンス
 * @param targetDate YYYY-MM-DD (JST)
 * @param nowJST 現在時刻の Date オブジェクト (JST)
 */
function extractDailyRepr(
  hourly: RawHourly,
  targetDate: string,
  nowJST: Date,
): DailyRepr {
  const { time } = hourly

  // 対象日の 00:00-23:00 (fresh24 = 当日の全降雪量)
  const dayIndices = rangeIdx(time, jstHour(targetDate, 0), jstHour(targetDate, 23))

  // 06:00-10:00 窓 (windSummit, tempSummit, cloud)
  const morningIndices = rangeIdx(time, jstHour(targetDate, 6), jstHour(targetDate, 10))

  // snowfallNext12: 現在時刻から 12 時間
  const nowStr = `${targetDate}T${String(nowJST.getHours()).padStart(2, '0')}:00`
  const futureEnd = new Date(nowJST.getTime() + 12 * 3600 * 1000)
  const futureEndStr = `${futureEnd.getFullYear()}-${String(futureEnd.getMonth() + 1).padStart(2, '0')}-${String(futureEnd.getDate()).padStart(2, '0')}T${String(futureEnd.getHours()).padStart(2, '0')}:00`
  const futureIndices = rangeIdx(time, nowStr, futureEndStr)

  // 積雪深: 対象日の最後の有効値
  const depthArr = hourly.snow_depth.map(mToCm)
  let snowDepthCm: number | null = null
  for (let i = depthArr.length - 1; i >= 0; i--) {
    if (depthArr[i] !== null && depthArr[i]! > 0) {
      snowDepthCm = depthArr[i]
      break
    }
  }

  // 降雪量: mm→cm 変換
  const snowfallCm = hourly.snowfall.map(mmToCm)

  // 風速: km/h→m/s 変換
  const windMs = hourly.windspeed_10m.map(kphToMs)

  return {
    fresh24cm: nullSum(snowfallCm, dayIndices),
    windSummit: nullMax(windMs, morningIndices),
    tempSummit: nullAvg(hourly.temperature_2m, morningIndices),
    cloud: nullAvg(hourly.cloudcover, morningIndices),
    snowfallNext12: nullSum(snowfallCm, futureIndices),
    snowDepthCm,
  }
}

/**
 * Open-Meteo からデータを取得し、正規化済み日次代表値を返す
 *
 * @param resort ゲレンデ情報 (summit 座標を使用)
 * @param targetDate YYYY-MM-DD (JST)
 * @returns DailyRepr (欠損は null)
 */
export async function fetchWeatherRepr(
  resort: Resort,
  targetDate: string,
): Promise<DailyRepr> {
  const { lat, lon } = resort.summit
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('elevation', String(resort.summit.ele_m))
  url.searchParams.set('hourly', HOURLY_VARS)
  url.searchParams.set('timezone', 'Asia/Tokyo')
  url.searchParams.set('past_days', '1')
  url.searchParams.set('forecast_days', '2')

  if (import.meta.env.DEV) {
    console.debug(`[openMeteo] fetch ${resort.id}: ${url}`)
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Open-Meteo API error ${res.status} for ${resort.id}`)
  }

  const data = await res.json() as {
    hourly: {
      time: string[]
      snowfall: (number | null)[]
      temperature_2m: (number | null)[]
      windspeed_10m: (number | null)[]
      cloudcover: (number | null)[]
      snow_depth: (number | null)[]
    }
  }

  const raw: RawHourly = {
    time: data.hourly.time,
    snowfall: data.hourly.snowfall,
    temperature_2m: data.hourly.temperature_2m,
    windspeed_10m: data.hourly.windspeed_10m,
    cloudcover: data.hourly.cloudcover,
    snow_depth: data.hourly.snow_depth,
  }

  // 現在 JST 時刻
  const nowJST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))

  const repr = extractDailyRepr(raw, targetDate, nowJST)

  if (import.meta.env.DEV) {
    console.debug(`[openMeteo] ${resort.id} repr:`, repr)
  }

  return repr
}
