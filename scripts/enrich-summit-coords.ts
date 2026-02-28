/**
 * scripts/enrich-summit-coords.ts
 *
 * resorts_seed.json の各ゲレンデについて、
 * 山頂（最高点）座標を自動推定して resorts.json を生成する。
 *
 * 手順:
 * 1. Nominatim でゲレンデ中心点 (base) を取得
 * 2. Overpass で base 周辺 R=8km の natural=peak を探索
 *    → ele 最大の peak を summit として採用
 * 3. peak なし → スキー場オブジェクト自体の ele を採用 (resort_ele)
 * 4. ele もなし → base を fallback (fallback_base, needs_review=true)
 *
 * キャッシュ:
 * - scripts/cache/nominatim-{id}.json
 * - scripts/cache/overpass-{id}.json
 *
 * 使い方:
 *   npx tsx scripts/enrich-summit-coords.ts
 *   npx tsx scripts/enrich-summit-coords.ts --id niigata_naeba
 *
 * 出力: src/data/resorts.json, public/data/resorts.json
 *
 * 仮定:
 * - Nominatim: 1 req/sec ポリシー遵守
 * - Overpass: 1 req/2sec 間隔
 * - 既存の needs_review=false エントリは再実行しても上書きしない (--force で強制)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SEED_PATH  = path.join(ROOT, 'src', 'data', 'resorts_seed.json')
const OUTPUT_SRC = path.join(ROOT, 'src', 'data', 'resorts.json')
const OUTPUT_PUB = path.join(ROOT, 'public', 'data', 'resorts.json')
const CACHE_DIR  = path.join(ROOT, 'scripts', 'cache')

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OVERPASS_URL  = 'https://overpass-api.de/api/interpreter'

const OVERPASS_RADIUS_M = 8000 // 8km
const SLEEP_NOMINATIM_MS = 1200
const SLEEP_OVERPASS_MS  = 2000

// ============================================================
// 型定義
// ============================================================

type SummitSource = 'overpass_peak' | 'resort_ele' | 'fallback_base' | 'manual'

interface SeedEntry { name: string; pref: string }
interface Resort {
  id: string; name: string; pref: string
  base: { lat: number; lon: number }
  summit: { lat: number; lon: number; ele_m: number; source: SummitSource }
  needs_review: boolean
  aliases: string[]
  priority: number
}

// ============================================================
// キャッシュ
// ============================================================

async function readJsonCache<T>(key: string): Promise<T | null> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    const s = await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf-8')
    return JSON.parse(s) as T
  } catch { return null }
}

async function writeJsonCache(key: string, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data, null, 2), 'utf-8')
}

// ============================================================
// Nominatim ジオコーディング
// ============================================================

interface NominatimResult {
  lat: string; lon: string; display_name: string
  type: string; class: string; importance: number
}

const PREF_JA: Record<string, string> = {
  niigata: '新潟県', gunma: '群馬県', nagano: '長野県',
}

async function geocode(name: string, pref: string): Promise<{ lat: number; lon: number } | null> {
  const cacheKey = `nominatim-${name.replace(/[^a-z0-9\u3000-\u9fff]/gi, '_')}`
  const cached = await readJsonCache<NominatimResult[]>(cacheKey)

  let results: NominatimResult[]
  if (cached) {
    results = cached
  } else {
    await sleep(SLEEP_NOMINATIM_MS)
    const query = `${name} ${PREF_JA[pref] ?? ''}`
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '3')
    url.searchParams.set('accept-language', 'ja')

    try {
      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'snow-forecast-resort-builder/1.0',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
      results = await res.json() as NominatimResult[]
      await writeJsonCache(cacheKey, results)
    } catch (e) {
      console.warn(`    Nominatim failed for "${name}": ${e}`)
      return null
    }
  }

  if (!results.length) return null
  const r = results[0]
  return { lat: parseFloat(r.lat), lon: parseFloat(r.lon) }
}

// ============================================================
// Overpass ピーク探索
// ============================================================

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number; lon?: number
  tags?: { name?: string; ele?: string; natural?: string }
}
interface OverpassResult { elements: OverpassElement[] }

async function findNearestPeak(
  lat: number, lon: number, radiusM: number,
): Promise<{ lat: number; lon: number; ele_m: number } | null> {
  const cacheKey = `overpass-${lat.toFixed(4)}-${lon.toFixed(4)}`
  const cached = await readJsonCache<OverpassResult>(cacheKey)

  let result: OverpassResult
  if (cached) {
    result = cached
  } else {
    await sleep(SLEEP_OVERPASS_MS)
    const query = `
[out:json][timeout:25];
(
  node["natural"="peak"](around:${radiusM},${lat},${lon});
);
out body;`
    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: query,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'snow-forecast-resort-builder/1.0',
        },
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
      result = await res.json() as OverpassResult
      await writeJsonCache(cacheKey, result)
    } catch (e) {
      console.warn(`    Overpass failed: ${e}`)
      return null
    }
  }

  const nodes = result.elements.filter(
    e => e.type === 'node' && e.lat && e.lon && e.tags?.ele,
  )
  if (!nodes.length) return null

  // ele 最大のピークを採用 (= 最高点ルール)
  const best = nodes.reduce((a, b) => {
    const ea = parseFloat(a.tags?.ele ?? '0')
    const eb = parseFloat(b.tags?.ele ?? '0')
    return ea >= eb ? a : b
  })

  const ele = parseFloat(best.tags?.ele ?? '0')
  if (!ele || !best.lat || !best.lon) return null

  return { lat: best.lat, lon: best.lon, ele_m: Math.round(ele) }
}

// ============================================================
// ID 生成
// ============================================================

function makeId(name: string, pref: string): string {
  const normalized = name
    .replace(/スキー場|スキーリゾート|スノーリゾート|スノーパーク|スキーガーデン|温泉|高原|観光/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '_')
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `${pref}_${normalized}`.substring(0, 64)
}

// ============================================================
// スリープ
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ============================================================
// メイン
// ============================================================

async function main() {
  const args = process.argv.slice(2)
  const idFilter = args.find(a => a.startsWith('--id='))?.split('=')[1]
    ?? args[args.indexOf('--id') + 1]
  const force = args.includes('--force')

  // 既存 resorts.json を読み込む (既存エントリを保持)
  let existing: Resort[] = []
  try {
    existing = JSON.parse(await fs.readFile(OUTPUT_SRC, 'utf-8')) as Resort[]
  } catch { /* 新規 */ }

  const existingMap = new Map<string, Resort>(existing.map(r => [r.id, r]))

  // seed を読み込む
  const seed: SeedEntry[] = JSON.parse(await fs.readFile(SEED_PATH, 'utf-8')) as SeedEntry[]

  const filter = idFilter ? seed.filter(s => makeId(s.name, s.pref) === idFilter) : seed
  console.log(`\n山頂座標エンリッチ処理 (${filter.length} 件)`)
  if (force) console.log('  --force: 既存エントリも再処理')

  const results: Resort[] = []

  for (const entry of filter) {
    const id = makeId(entry.name, entry.pref)
    const existing_ = existingMap.get(id)

    // needs_review=false かつ manual/overpass_peak → スキップ (--force なしの場合)
    if (!force && existing_ && !existing_.needs_review && existing_.summit.source !== 'fallback_base') {
      console.log(`  ✓ [skip] ${id}`)
      results.push(existing_)
      continue
    }

    console.log(`  🔍 ${id} (${entry.name})`)

    // 1. Nominatim でジオコーディング
    const base = await geocode(entry.name, entry.pref)
    if (!base) {
      console.warn(`    → Nominatim 失敗。既存エントリを保持または fallback`)
      if (existing_) { results.push(existing_); continue }
      // 既存なければ仮座標でスキップ
      console.warn(`    → 座標不明のためスキップ`)
      continue
    }
    console.log(`    base: ${base.lat.toFixed(4)}, ${base.lon.toFixed(4)}`)

    // 2. Overpass でピーク探索
    const peak = await findNearestPeak(base.lat, base.lon, OVERPASS_RADIUS_M)

    let summit: Resort['summit']
    let needs_review: boolean

    if (peak) {
      console.log(`    summit (overpass_peak): ${peak.lat.toFixed(4)}, ${peak.lon.toFixed(4)}, ${peak.ele_m}m`)
      summit = { ...peak, source: 'overpass_peak' }
      needs_review = false
    } else {
      // フォールバック: base を summit として使用
      const existingEle = existing_?.summit.ele_m ?? 0
      console.warn(`    → peak 未発見。fallback_base${existingEle ? ` (既存ele: ${existingEle}m)` : ''}`)
      summit = {
        lat: base.lat, lon: base.lon,
        ele_m: existingEle || 1000,
        source: 'fallback_base',
      }
      needs_review = true
    }

    const resort: Resort = {
      id,
      name: entry.name,
      pref: entry.pref,
      base,
      summit,
      needs_review,
      aliases: existing_?.aliases ?? [],
      priority: existing_?.priority ?? 0,
    }
    results.push(resort)
  }

  // filter が全体でない場合は既存エントリとマージ
  const finalMap = new Map<string, Resort>(existing.map(r => [r.id, r]))
  for (const r of results) finalMap.set(r.id, r)
  const final = [...finalMap.values()]
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))

  const json = JSON.stringify(final, null, 2) + '\n'
  await fs.writeFile(OUTPUT_SRC, json, 'utf-8')
  await fs.mkdir(path.dirname(OUTPUT_PUB), { recursive: true })
  await fs.writeFile(OUTPUT_PUB, json, 'utf-8')

  console.log(`\n✅ 完了: ${final.length} 件`)
  console.log(`  src: ${OUTPUT_SRC}`)
  console.log(`  pub: ${OUTPUT_PUB}`)
  const needsReview = final.filter(r => r.needs_review)
  if (needsReview.length) {
    console.log(`\n📍 needs_review: ${needsReview.length} 件`)
    needsReview.forEach(r => console.log(`  - ${r.id}`))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
