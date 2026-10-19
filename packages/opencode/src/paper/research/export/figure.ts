import { deflateSync } from "node:zlib"
import type { ResultReport } from "../experiments"

export type PaperFigureSeries = {
  label: string
  value: number
  std?: number
}

export type PaperFigureSpec = {
  caption: string
  metric: string
  series: PaperFigureSeries[]
}

/** Build the figure the manuscript shows: the primary metric, proposed first, then baselines. */
export function figureSpecFromReport(report: Pick<ResultReport, "primary_metric" | "proposed" | "best_baseline" | "statistics">) {
  if (!report.proposed) return undefined
  const proposedStatistics = report.statistics?.find(
    (item) => item.experiment_id === report.proposed!.experiment_id && item.environment === "host",
  )
  const baselineStatistics = report.best_baseline
    ? report.statistics?.find(
        (item) => item.experiment_id === report.best_baseline!.experiment_id && item.environment === "host",
      )
    : undefined
  const series: PaperFigureSeries[] = [
    {
      label: report.proposed.experiment_id,
      value: report.proposed.value,
      std: proposedStatistics?.std,
    },
  ]
  if (report.best_baseline) {
    series.push({
      label: report.best_baseline.experiment_id,
      value: report.best_baseline.value,
      std: baselineStatistics?.std,
    })
  }
  return {
    caption: `${report.primary_metric} across methods (left to right: ${series.map((item) => item.label).join(", ")})`,
    metric: report.primary_metric,
    series,
  }
}

/**
 * A dependency-free RGB chart writer. The export pipeline needs a real image file - a manuscript
 * that references a figure which does not exist fails in the LaTeX step - and pulling in a plotting
 * library for two bars would dwarf the rest of the pipeline. The drawing surface is 8-bit RGBA.
 */
const WIDTH = 900
const HEIGHT = 520
const MARGIN = { left: 90, right: 40, top: 50, bottom: 110 }

/** 5x7 glyphs for the characters a metric axis needs; other characters are drawn as spaces. */
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "%": ["11001", "11010", "00100", "00100", "01000", "01011", "10011"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}

type Rgba = { data: Uint8Array; width: number; height: number }

function canvas(width: number, height: number): Rgba {
  const data = new Uint8Array(width * height * 4).fill(255)
  return { data, width, height }
}

function setPixel(image: Rgba, x: number, y: number, color: [number, number, number]) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  const index = (y * image.width + x) * 4
  image.data[index] = color[0]
  image.data[index + 1] = color[1]
  image.data[index + 2] = color[2]
  image.data[index + 3] = 255
}

function fillRect(image: Rgba, x: number, y: number, width: number, height: number, color: [number, number, number]) {
  for (let row = Math.round(y); row < Math.round(y + height); row++) {
    for (let column = Math.round(x); column < Math.round(x + width); column++) {
      setPixel(image, column, row, color)
    }
  }
}

function drawLine(
  image: Rgba,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: [number, number, number],
  thickness = 1,
) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1)
  for (let step = 0; step <= steps; step++) {
    const x = x1 + ((x2 - x1) * step) / steps
    const y = y1 + ((y2 - y1) * step) / steps
    fillRect(image, x - thickness / 2, y - thickness / 2, thickness, thickness, color)
  }
}

function drawText(image: Rgba, x: number, y: number, text: string, scale: number, color: [number, number, number]) {
  let cursor = x
  for (const character of text) {
    const glyph = GLYPHS[character] ?? GLYPHS[" "]
    for (let row = 0; row < glyph.length; row++) {
      for (let column = 0; column < glyph[row].length; column++) {
        if (glyph[row][column] === "1") {
          fillRect(image, cursor + column * scale, y + row * scale, scale, scale, color)
        }
      }
    }
    cursor += 6 * scale
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function encodePng(image: Rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height)
  for (let row = 0; row < image.height; row++) {
    raw[row * (image.width * 4 + 1)] = 0
    Buffer.from(image.data.buffer, image.data.byteOffset + row * image.width * 4, image.width * 4).copy(
      raw,
      row * (image.width * 4 + 1) + 1,
    )
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array()),
    ]),
  )
}

function formatValue(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude >= 100) return value.toFixed(0)
  if (magnitude >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

/** Render the primary-metric comparison as a PNG bar chart, with error bars when std is known. */
export function renderMetricChartPng(spec: PaperFigureSpec) {
  const image = canvas(WIDTH, HEIGHT)
  const plot = {
    x: MARGIN.left,
    y: MARGIN.top,
    width: WIDTH - MARGIN.left - MARGIN.right,
    height: HEIGHT - MARGIN.top - MARGIN.bottom,
  }
  const values = spec.series.flatMap((item) => [item.value, item.value + (item.std ?? 0)])
  const max = Math.max(...values, 0.0001)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const toY = (value: number) => plot.y + plot.height - ((value - min) / span) * plot.height

  // Axes and gridlines with numeric labels, so the image is readable without the caption.
  const axis: [number, number, number] = [60, 60, 60]
  drawLine(image, plot.x, plot.y, plot.x, plot.y + plot.height, axis, 2)
  drawLine(image, plot.x, plot.y + plot.height, plot.x + plot.width, plot.y + plot.height, axis, 2)
  for (let tick = 0; tick <= 4; tick++) {
    const value = min + (span * tick) / 4
    const y = toY(value)
    drawLine(image, plot.x - 8, y, plot.x, y, axis)
    drawText(image, 10, y - 7, formatValue(value), 2, axis)
  }

  const slot = plot.width / spec.series.length
  const barWidth = Math.min(120, slot * 0.5)
  spec.series.forEach((item, index) => {
    const center = plot.x + slot * (index + 0.5)
    const top = toY(Math.max(item.value, 0))
    const bottom = toY(Math.min(item.value, 0))
    const color: [number, number, number] = index === 0 ? [31, 90, 166] : [150, 150, 150]
    fillRect(image, center - barWidth / 2, top, barWidth, Math.max(bottom - top, 2), color)
    drawText(image, center - formatValue(item.value).length * 6, top - 22, formatValue(item.value), 2, axis)
    if (item.std !== undefined && item.std > 0) {
      const upper = toY(item.value + item.std)
      const lower = toY(item.value - item.std)
      drawLine(image, center, upper, center, lower, axis, 2)
      drawLine(image, center - 12, upper, center + 12, upper, axis, 2)
      drawLine(image, center - 12, lower, center + 12, lower, axis, 2)
    }
  })
  return encodePng(image)
}
