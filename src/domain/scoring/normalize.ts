/**
 * 0-100 正規化ユーティリティ
 *
 * 全て純関数。null 入力は 0 を返す (外部から guard すること)。
 */

/** 線形クランプ: val が lo のとき 0, hi のとき 100 */
export function linear(val: number, lo: number, hi: number): number {
  if (hi === lo) return 0
  return Math.min(100, Math.max(0, ((val - lo) / (hi - lo)) * 100))
}

/** 逆線形: val が hi のとき 0, lo のとき 100 */
export function linearInv(val: number, lo: number, hi: number): number {
  return 100 - linear(val, lo, hi)
}

/**
 * 区分線形 (piecewise):
 * breakpoints はソート済みの [(input, output)] ペアの配列
 */
export function piecewise(val: number, pts: [number, number][]): number {
  if (pts.length === 0) return 0
  if (val <= pts[0][0]) return pts[0][1]
  if (val >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (val >= x0 && val <= x1) {
      const t = (val - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return 0
}

/** 結果を [0, 100] に丸めてクランプ */
export function clamp100(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}
