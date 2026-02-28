/**
 * scripts/build-resorts.ts
 *
 * ワンコマンドで resorts.json を生成するマスタースクリプト。
 * 以下を順番に実行する:
 *   1. build-resort-list.ts  → resorts_seed.json を更新
 *   2. enrich-summit-coords.ts → resorts.json を生成
 *
 * 使い方:
 *   npx tsx scripts/build-resorts.ts
 *   npx tsx scripts/build-resorts.ts --skip-list     # seed 更新をスキップ
 *   npx tsx scripts/build-resorts.ts --skip-enrich   # enrich をスキップ
 *   npx tsx scripts/build-resorts.ts --force         # 既存エントリも再処理
 *
 * 所要時間目安 (63件):
 *   build-resort-list:     1-2分  (ネットワーク依存)
 *   enrich-summit-coords: 10-15分 (Nominatim + Overpass レート制限)
 *   合計: 約15分
 *
 * キャッシュを使うと 2回目以降は大幅に短縮される。
 * キャッシュは scripts/cache/*.json に保存。
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function run(cmd: string) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' })
}

async function main() {
  const args = process.argv.slice(2)
  const skipList   = args.includes('--skip-list')
  const skipEnrich = args.includes('--skip-enrich')
  const forceFlag  = args.includes('--force') ? ' --force' : ''

  console.log('='.repeat(60))
  console.log('Snow Forecast — resorts.json ビルドパイプライン')
  console.log('='.repeat(60))

  if (!skipList) {
    console.log('\n[Step 1/2] ゲレンデリスト収集')
    run('npx tsx scripts/build-resort-list.ts')
  } else {
    console.log('\n[Step 1/2] スキップ (--skip-list)')
  }

  if (!skipEnrich) {
    console.log('\n[Step 2/2] 山頂座標エンリッチ')
    run(`npx tsx scripts/enrich-summit-coords.ts${forceFlag}`)
  } else {
    console.log('\n[Step 2/2] スキップ (--skip-enrich)')
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ resorts.json のビルドが完了しました')
  console.log('='.repeat(60))
  console.log(`
次のステップ:
  1. public/data/resorts.json の内容を確認する
  2. needs_review=true のエントリを手動で確認・修正する (任意)
  3. git add public/data/resorts.json src/data/resorts.json
  4. git commit -m "resorts: update resort data"
  5. git push → GitHub Pages に自動デプロイ
`)
}

main().catch(e => { console.error(e); process.exit(1) })
