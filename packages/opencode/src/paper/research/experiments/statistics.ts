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
