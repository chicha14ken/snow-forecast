# ❄️ Snow Forecast — ゲレンデ体験ランキング

新潟・群馬・長野 **63スキー場以上**のリアルタイム気象データを取得し、
**パウダー / 快適性 / 運行** の体験スコアでランキングする静的 Web アプリです。

**公開 URL:** https://chicha14ken.github.io/snow-forecast/

---

## 特徴

- 🌨️ **PowderScore** — 降雪量・気温・風速を加味したパウダー体験スコア
- ☀️ **BluebirdScore** — 雲量・視界・午後降雪予報の快晴スコア
- 🧊 **ComfortScore** — 気温・風速の快適性スコア
- 🚡 **OpsScore** — リフト運行リスク推定（風速ベース v1）
- 📊 **Confidence** — データ取得率に応じた信頼度補正
- 📡 **Open-Meteo API** — 無料・APIキー不要のリアルタイム気象データ
- 📍 **山頂座標** — Nominatim + Overpass で最高点を自動推定
- 🗺️ **63スキー場** — 新潟 20 / 群馬 12 / 長野 31

---

## アーキテクチャ

```
snow-forecast/
├── index.html                  # Vite エントリーポイント
├── package.json
├── vite.config.ts              # base: '/snow-forecast/'
├── tsconfig.json
├── public/
│   └── data/
│       └── resorts.json        # ★ ゲレンデデータ (scripts で生成)
├── src/
│   ├── main.ts                 # アプリエントリー
│   ├── style.css
│   ├── types.ts                # 型定義
│   ├── data/
│   │   ├── resorts.json        # public/ と同じファイル
│   │   └── resorts_seed.json   # スクリプト用シード
│   ├── providers/
│   │   └── openMeteo.ts        # 気象データ取得・正規化
│   ├── domain/scoring/
│   │   ├── scoreConfig.ts      # 閾値・重み設定
│   │   ├── normalize.ts        # 0-100 正規化関数
│   │   ├── scores.ts           # 4サブスコア計算
│   │   └── total.ts            # トータル + confidence + reasons
│   └── ui/
│       ├── card.ts             # ゲレンデカード HTML
│       ├── filters.ts          # フィルターパネル HTML
│       └── ranking.ts          # ランキングリスト HTML
├── scripts/
│   ├── build-resort-list.ts    # 県別ゲレンデ名収集
│   ├── enrich-summit-coords.ts # 山頂座標自動推定
│   ├── build-resorts.ts        # 上2つをまとめて実行
│   └── cache/                  # APIキャッシュ (gitignore済み)
└── .github/workflows/
    └── deploy.yml              # GitHub Pages 自動デプロイ
```

---

## ローカル開発

```bash
# 依存関係インストール
npm install

# 開発サーバー起動 (http://localhost:5173/snow-forecast/)
npm run dev

# 本番ビルド
npm run build

# ビルド結果をプレビュー
npm run preview
```

---

## ゲレンデデータ更新 (`resorts.json` の再生成)

### 前提

- 外部ネットワーク接続が必要（Nominatim, Overpass API）
- 63件の処理に約 **15〜20分** かかる（API レート制限のため）
- `scripts/cache/` にキャッシュが保存され、2回目以降は大幅に短縮

### コマンド

```bash
# ゲレンデ名収集 → resorts_seed.json 更新
npm run build:resort-list

# 山頂座標エンリッチ → resorts.json 生成
npm run build:summits

# 上記を一括実行（推奨）
npm run build:resorts

# 既存エントリを強制再処理
npm run build:resorts -- --force

# 特定 ID のみ再処理
npx tsx scripts/enrich-summit-coords.ts --id niigata_naeba
```

### 出力ファイル

| ファイル | 説明 |
|--------|------|
| `src/data/resorts_seed.json` | ゲレンデ名のリスト（中間ファイル） |
| `src/data/resorts.json` | 完全なゲレンデデータ（ビルドに使用） |
| `public/data/resorts.json` | 上と同一（ランタイムに fetch） |

### needs_review フラグ

Nominatim + Overpass で山頂座標が自動取得できなかったゲレンデには
`"needs_review": true` が付与されます。

- アプリは `fallback_base` 座標でフォールバック動作する
- UI にも軽い警告表示がされる
- 手動で座標を確認・修正した後、`"source": "manual"` に変更して `"needs_review": false` にする

---

## スコアリング設計

### 代表値（Open-Meteo hourly）

| 変数 | 説明 | 集計方法 |
|-----|------|---------|
| `fresh24cm` | 当日降雪量 [cm] | 当日 00:00〜23:00 合計 |
| `windSummit` | 山頂風速 [m/s] | 当日 06:00〜10:00 最大 |
| `tempSummit` | 山頂気温 [℃] | 当日 06:00〜10:00 平均 |
| `cloud` | 雲量 [%] | 当日 06:00〜10:00 平均 |
| `snowfallNext12` | 午後降雪予報 [cm] | 現在時刻から 12h 合計 |

> **tempSummit は平均を採用。** 最低気温は夜明け前（スキー前）になりがちなため、
> 06:00〜10:00 のスキー時間帯平均の方が実態に近いと判断。

### サブスコア定義

| スコア | 主要入力 | 満点の目安 |
|--------|---------|-----------|
| PowderScore | fresh24cm, tempSummit, windSummit | 30cm降雪 + -10℃以下 + 無風 |
| BluebirdScore | cloud, windSummit, snowfallNext12 | 雲量5% + 無風 + 微少降雪ボーナス |
| ComfortScore | tempSummit, windSummit, cloud | -3℃ + 無風 + 快晴 |
| OpsScore | windSummit | 0 m/s（リフト全運行） |

### プリセット重み

| プリセット | Powder | Bluebird | Comfort | Ops |
|-----------|--------|----------|---------|-----|
| パウダー重視 | 0.55 | 0.15 | 0.15 | 0.15 |
| 快適重視 | 0.15 | 0.20 | 0.30 | 0.35 |

### Confidence 補正

```
必須フィールド: [fresh24cm, tempSummit, windSummit, cloud]
confidence = (取得できた必須数) / 4
TotalAdjusted = Total × (0.80 + 0.20 × confidence)
```

---

## GitHub Pages デプロイ

### 初回セットアップ

1. GitHub リポジトリ → **Settings → Pages**
2. Source: **GitHub Actions** を選択

### 自動デプロイ

`master` / `main` ブランチへ push すると `.github/workflows/deploy.yml` が動き、
自動的に `https://chicha14ken.github.io/snow-forecast/` に公開される。

### 手動デプロイ（gh-pages）

```bash
npm run build
npx gh-pages -d dist
```

---

## 設計上の仮定

1. **tempSummit は平均を採用** — スキー時間帯（06:00-10:00）の平均気温が最低気温より実態に近い
2. **OpsScore は v1 風速のみ** — リフト実運行データは未取得。将来 API が使えたら `calcOpsScore` を差し替え
3. **山頂座標のフォールバック** — Overpass で peak が見つからない場合は Nominatim 中心点を使用（`needs_review: true`）
4. **fresh24cm は当日分のみ** — 「直近24h」を「その日の全降雪量」と解釈。複数日比較の公平性を優先
5. **Overpass 探索半径 8km** — ゲレンデのリフト距離と山岳地形を考慮した経験値

---

## ライセンス

MIT
