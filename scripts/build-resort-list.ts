/**
 * scripts/build-resort-list.ts
 *
 * 県別のスキー場一覧ページからゲレンデ名を収集し、
 * resorts_seed.json を生成する。
 *
 * 設計:
 * - 2ソース以上からスクレイピングし、HTML変化への耐性を高める
 * - 取得失敗時は fallback リストにフォールバック
 * - 重複排除、"スキー場" 接尾辞の正規化を行う
 *
 * 使い方:
 *   npx tsx scripts/build-resort-list.ts
 *   npx tsx scripts/build-resort-list.ts --pref nagano
 *
 * 出力: src/data/resorts_seed.json
 *       public/data/resorts_seed.json  (参考)
 *
 * 仮定:
 * - HTML 構造が変わった場合はソースリストを更新する
 * - Nominatim ポリシーに従い User-Agent を設定する
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SEED_PATH = path.join(ROOT, 'src', 'data', 'resorts_seed.json')
const CACHE_DIR = path.join(ROOT, 'scripts', 'cache')

type Pref = 'niigata' | 'gunma' | 'nagano'
type SeedEntry = { name: string; pref: Pref }

// ============================================================
// フォールバック (ネットワーク失敗時)
// ============================================================

const FALLBACK: SeedEntry[] = [
  // 新潟
  { name: '苗場スキー場', pref: 'niigata' },
  { name: 'かぐらスキー場', pref: 'niigata' },
  { name: 'GALA湯沢スキー場', pref: 'niigata' },
  { name: '石打丸山スキー場', pref: 'niigata' },
  { name: '舞子スノーリゾート', pref: 'niigata' },
  { name: '上越国際スキー場', pref: 'niigata' },
  { name: '妙高杉ノ原スキー場', pref: 'niigata' },
  { name: '赤倉観光リゾートスキー場', pref: 'niigata' },
  { name: 'ロッテアライリゾート', pref: 'niigata' },
  { name: 'キューピットバレイスキー場', pref: 'niigata' },
  // 群馬
  { name: '草津温泉スキー場', pref: 'gunma' },
  { name: '万座温泉スキー場', pref: 'gunma' },
  { name: '川場スキー場', pref: 'gunma' },
  { name: '丸沼高原スキー場', pref: 'gunma' },
  { name: 'ホワイトワールド尾瀬岩鞍', pref: 'gunma' },
  // 長野
  { name: '白馬八方尾根スキー場', pref: 'nagano' },
  { name: 'エイブル白馬五竜&HAKUBA47', pref: 'nagano' },
  { name: '白馬コルチナスキー場', pref: 'nagano' },
  { name: '栂池高原スキー場', pref: 'nagano' },
  { name: '野沢温泉スキー場', pref: 'nagano' },
  { name: '志賀高原 横手山スキー場', pref: 'nagano' },
  { name: '竜王スキーパーク', pref: 'nagano' },
  { name: '菅平高原スノーリゾート', pref: 'nagano' },
]

// ============================================================
// スクレイピングソース定義
// ============================================================

interface Source {
  url: string
  pref: Pref
  parse: (html: string) => string[]
}

const SOURCES: Source[] = [
  {
    url: 'https://www.snowjapan.com/ski-resort-overview/region/niigata',
    pref: 'niigata',
    parse: (html) => extractFromSnowJapan(html),
  },
  {
    url: 'https://www.snowjapan.com/ski-resort-overview/region/gunma',
    pref: 'gunma',
    parse: (html) => extractFromSnowJapan(html),
  },
  {
    url: 'https://www.snowjapan.com/ski-resort-overview/region/nagano',
    pref: 'nagano',
    parse: (html) => extractFromSnowJapan(html),
  },
]

function extractFromSnowJapan(html: string): string[] {
  // SnowJapan のリゾート名は h2/h3 タグや特定クラスに含まれる
  // 複数パターンで試みる
  const patterns = [
    /<h[23][^>]*class="[^"]*resort[^"]*"[^>]*>([^<]+)<\/h[23]>/gi,
    /<a[^>]*href="\/[^"]*ski-resort[^"]*"[^>]*>([^<]+)<\/a>/gi,
    /class="resort-name"[^>]*>([^<]+)</gi,
  ]
  const names = new Set<string>()
  for (const pat of patterns) {
    let m: RegExpExecArray | null
    while ((m = pat.exec(html)) !== null) {
      const n = m[1].trim()
      if (n.length > 2) names.add(n)
    }
  }
  return [...names]
}

// ============================================================
// 名称正規化
// ============================================================

function normalizeName(name: string): string {
  return name
    .trim()
    // 全角スペース→半角
    .replace(/\u3000/g, ' ')
    // 前後の記号除去
    .replace(/^[・\s]+|[・\s]+$/g, '')
}

function dedupe(entries: SeedEntry[]): SeedEntry[] {
  const seen = new Set<string>()
  return entries.filter(e => {
    const key = e.name.replace(/スキー場|スキーリゾート|スノーリゾート|スノーパーク/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ============================================================
// キャッシュ
// ============================================================

async function readCache(key: string): Promise<string | null> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    return await fs.readFile(path.join(CACHE_DIR, `${key}.html`), 'utf-8')
  } catch { return null }
}

async function writeCache(key: string, data: string): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(path.join(CACHE_DIR, `${key}.html`), data, 'utf-8')
}

async function fetchWithCache(url: string, key: string): Promise<string | null> {
  const cached = await readCache(key)
  if (cached) { console.log(`  [cache hit] ${key}`); return cached }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'snow-forecast-resort-builder/1.0 (https://github.com/chicha14ken/snow-forecast)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    await writeCache(key, text)
    return text
  } catch (e) {
    console.warn(`  [fetch fail] ${url}: ${e}`)
    return null
  }
}

// ============================================================
// メイン
// ============================================================

async function main() {
  const args = process.argv.slice(2)
  const prefFilter = args.find(a => a.startsWith('--pref='))?.split('=')[1]
    ?? args[args.indexOf('--pref') + 1]

  const sources = prefFilter
    ? SOURCES.filter(s => s.pref === prefFilter)
    : SOURCES

  console.log(`\nゲレンデリスト生成 (対象: ${sources.map(s => s.pref).join(', ')})`)
  console.log(`キャッシュ: ${CACHE_DIR}\n`)

  const collected: SeedEntry[] = []

  for (const source of sources) {
    console.log(`📥 ${source.pref}: ${source.url}`)
    const cacheKey = `resort-list-${source.pref}`
    const html = await fetchWithCache(source.url, cacheKey)

    if (html) {
      const names = source.parse(html)
      console.log(`  → ${names.length} 件取得`)
      for (const name of names) {
        const normalized = normalizeName(name)
        if (normalized) collected.push({ name: normalized, pref: source.pref })
      }
    } else {
      // フォールバック
      console.warn(`  ⚠️ 取得失敗 → フォールバック使用`)
      const fb = FALLBACK.filter(e => e.pref === source.pref)
      collected.push(...fb)
      console.log(`  → フォールバック ${fb.length} 件`)
    }

    // レート制限: 1秒待機
    await new Promise(r => setTimeout(r, 1000))
  }

  const deduped = dedupe(collected)
  console.log(`\n合計: ${deduped.length} 件 (重複除去後)`)

  // 既存 seed と合算してから更新
  let existing: SeedEntry[] = []
  try {
    existing = JSON.parse(await fs.readFile(SEED_PATH, 'utf-8')) as SeedEntry[]
  } catch { /* 新規作成 */ }

  const merged = dedupe([...deduped, ...existing])
  console.log(`既存 ${existing.length} + 新規 → マージ後 ${merged.length} 件`)

  await fs.writeFile(SEED_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  console.log(`✅ 書き出し: ${SEED_PATH}`)
}

main().catch(e => { console.error(e); process.exit(1) })
