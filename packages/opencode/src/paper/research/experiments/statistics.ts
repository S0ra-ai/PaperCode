/**
 * Welch's t-test for two independent samples.
 *
 * The manuscript gate refuses a baseline comparison that reports no significance test, and the
 * experiment runner already keeps per-trial samples. Rather than leaving the test to the author, the
 * analysis computes the standard one for unequal variances and reports it with the manuscript.
 */

/** Continued fraction for the regularized incomplete beta function (Numerical Recipes, 6.4). */
function betaContinuedFraction(a: number, b: number, x: number) {
  const maxIterations = 200
  const epsilon = 3e-12
  const tiny = 1e-300

  let qab = a + b
  let qap = a + 1
  let qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < epsilon) break
  }
  return h
}

/** Lanczos approximation, accurate to ~1e-10 for the arguments used here. */
function logGamma(value: number) {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2,
    -0.5395239384953e-5,
  ]
  let x = value
  let y = value
  let temp = x + 5.5
  temp -= (x + 0.5) * Math.log(temp)
  let series = 1.000000000190015
  for (const coefficient of coefficients) series += coefficient / ++y
  return -temp + Math.log((2.5066282746310005 * series) / x)
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(a: number, b: number, x: number) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const logFront =
    a * Math.log(x) + b * Math.log(1 - x) + logGamma(a + b) - logGamma(a) - logGamma(b)
  const front = Math.exp(logFront)
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function variance(values: number[]) {
  const average = mean(values)
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
}

/** Two-sided p-value of the t statistic with `df` degrees of freedom. */
export function studentTTwoSidedP(statistic: number, df: number) {
  if (!Number.isFinite(statistic) || !Number.isFinite(df) || df <= 0) return 1
  return incompleteBeta(df / 2, 0.5, df / (df + statistic ** 2))
}

export type WelchTestResult = {
  statistic: number
  df: number
  p: number
}

export function welchTTest(sampleA: number[], sampleB: number[]): WelchTestResult | undefined {
  if (sampleA.length < 2 || sampleB.length < 2) return undefined
  const meanA = mean(sampleA)
  const meanB = mean(sampleB)
  const varianceA = variance(sampleA)
  const varianceB = variance(sampleB)
  const standardErrorSquared = varianceA / sampleA.length + varianceB / sampleB.length
  if (standardErrorSquared <= 0) return undefined
  const statistic = (meanA - meanB) / Math.sqrt(standardErrorSquared)
  const df =
    standardErrorSquared ** 2 /
    ((varianceA / sampleA.length) ** 2 / (sampleA.length - 1) +
      (varianceB / sampleB.length) ** 2 / (sampleB.length - 1))
  return { statistic, df, p: studentTTwoSidedP(statistic, df) }
}

/**
 * Wilcoxon rank-sum (Mann-Whitney U), two-sided, normal approximation with tie and continuity
 * correction. Non-parametric metrics and small samples are common in systems papers, and a t-test
 * alone would overstate significance there.
 */
export function wilcoxonRankSum(sampleA: number[], sampleB: number[]): WelchTestResult | undefined {
  if (sampleA.length < 3 || sampleB.length < 3) return undefined
  const combined = [
    ...sampleA.map((value) => ({ value, group: "a" as const })),
    ...sampleB.map((value) => ({ value, group: "b" as const })),
  ].sort((left, right) => left.value - right.value)

  const ranks = new Map<number, number>()
  const ties: number[] = []
  let index = 0
  while (index < combined.length) {
    let end = index
    while (end + 1 < combined.length && combined[end + 1].value === combined[index].value) end++
    const tied = end - index + 1
    if (tied > 1) ties.push(tied)
    const averageRank = (index + 1 + end + 1) / 2
    for (let cursor = index; cursor <= end; cursor++) ranks.set(cursor, averageRank)
    index = end + 1
  }

  let rankSumA = 0
  combined.forEach((item, position) => {
    if (item.group === "a") rankSumA += ranks.get(position)!
  })
  const nA = sampleA.length
  const nB = sampleB.length
  const total = nA + nB
  const uA = rankSumA - (nA * (nA + 1)) / 2
  const u = Math.min(uA, nA * nB - uA)
  const meanU = (nA * nB) / 2
  const tieCorrection = ties.reduce((sum, size) => sum + size ** 3 - size, 0) / (total * (total - 1))
  const varianceU = ((nA * nB) / 12) * (total + 1 - tieCorrection)
  if (varianceU <= 0) return undefined
  // The continuity correction can push |U - E[U]| below zero, which would make z negative and the
  // two-sided p exceed 1; clamp at zero.
  const z = Math.max(0, (Math.abs(u - meanU) - 0.5) / Math.sqrt(varianceU))
  return { statistic: u, df: total, p: Math.min(1, 2 * (1 - normalCdf(z))) }
}

/** Standard normal CDF via the complementary error function. */
function normalCdf(value: number) {
  // Abramowitz & Stegun 7.1.26 on erf; accuracy ~1e-7, ample for a p-value.
  const x = Math.abs(value) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-x * x)
  const signed = value >= 0 ? erf : -erf
  return 0.5 * (1 + signed)
}

/**
 * Holm–Bonferroni adjustment. Comparing the proposed method against several baselines without it
 * inflates the chance of a false positive, which reviewers check for.
 */
export function holmAdjust(pValues: number[]) {
  const indexed = pValues.map((p, index) => ({ p, index })).sort((left, right) => left.p - right.p)
  const adjusted = new Array<number>(pValues.length)
  let running = 0
  indexed.forEach((item, rank) => {
    // Enforce monotonicity so an earlier, smaller p cannot end up less adjusted than a later one.
    running = Math.max(running, Math.min(1, (indexed.length - rank) * item.p))
    adjusted[item.index] = running
  })
  return adjusted
}

export type EffectMagnitude = "negligible" | "small" | "medium" | "large"

export type EffectSize = {
  name: "cohens_d" | "cliffs_delta"
  value: number
  magnitude: EffectMagnitude
}

/** Cohen's d with the pooled standard deviation. */
export function cohensD(sampleA: number[], sampleB: number[]): EffectSize | undefined {
  if (sampleA.length < 2 || sampleB.length < 2) return undefined
  const pooledVariance =
    ((sampleA.length - 1) * variance(sampleA) + (sampleB.length - 1) * variance(sampleB)) /
    (sampleA.length + sampleB.length - 2)
  if (pooledVariance <= 0) return undefined
  const value = (mean(sampleA) - mean(sampleB)) / Math.sqrt(pooledVariance)
  return { name: "cohens_d", value, magnitude: cohensMagnitude(Math.abs(value)) }
}

function cohensMagnitude(value: number): EffectMagnitude {
  if (value >= 0.8) return "large"
  if (value >= 0.5) return "medium"
  if (value >= 0.2) return "small"
  return "negligible"
}

/** Cliff's delta: non-parametric effect size, the natural companion to a rank test. */
export function cliffsDelta(sampleA: number[], sampleB: number[]): EffectSize | undefined {
  if (sampleA.length === 0 || sampleB.length === 0) return undefined
  let greater = 0
  let less = 0
  for (const a of sampleA) {
    for (const b of sampleB) {
      if (a > b) greater++
      else if (a < b) less++
    }
  }
  const value = (greater - less) / (sampleA.length * sampleB.length)
  return { name: "cliffs_delta", value, magnitude: cliffsMagnitude(Math.abs(value)) }
}

/** Romano et al. thresholds for Cliff's delta. */
function cliffsMagnitude(value: number): EffectMagnitude {
  if (value >= 0.474) return "large"
  if (value >= 0.33) return "medium"
  if (value >= 0.147) return "small"
  return "negligible"
}
