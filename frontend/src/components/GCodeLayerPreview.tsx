import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'

interface LayerPoint {
  x: number
  y: number
}

interface LayerData {
  layer_count: number
  layers: LayerPoint[][]
  bounds: {
    min_x: number
    max_x: number
    min_y: number
    max_y: number
  }
}

interface Props {
  fileId: number | null | undefined
  currentLayer: number | null | undefined
  layerCount: number | null | undefined
}

const CANVAS_SIZE = 280

export default function GCodeLayerPreview({ fileId, currentLayer, layerCount }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [data, setData] = useState<LayerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // Layer-Daten laden (einmalig pro fileId)
  useEffect(() => {
    if (!fileId) { setData(null); return }
    setLoading(true)
    setError(false)
    api.get(`/files/${fileId}/layers`)
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [fileId])

  // Canvas neu zeichnen wenn Daten oder aktueller Layer sich ändern
  useEffect(() => {
    if (!data || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { min_x, max_x, min_y, max_y } = data.bounds
    const rangeX = max_x - min_x || 1
    const rangeY = max_y - min_y || 1
    const scale = (CANVAS_SIZE - 16) / Math.max(rangeX, rangeY)
    const offsetX = (CANVAS_SIZE - rangeX * scale) / 2
    const offsetY = (CANVAS_SIZE - rangeY * scale) / 2

    const toCanvasX = (wx: number) => offsetX + (wx - min_x) * scale
    const toCanvasY = (wy: number) => CANVAS_SIZE - (offsetY + (wy - min_y) * scale)

    const drawLayer = (points: LayerPoint[], color: string, lineWidth: number) => {
      if (points.length < 2) return
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.moveTo(toCanvasX(points[0].x), toCanvasY(points[0].y))
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(toCanvasX(points[i].x), toCanvasY(points[i].y))
      }
      ctx.stroke()
    }

    // Hintergrund
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Alle Layer hellgrau
    ctx.globalAlpha = 0.25
    for (let i = 0; i < data.layers.length; i++) {
      drawLayer(data.layers[i], '#6b7280', 0.8)
    }

    // Aktueller Layer blau hervorgehoben
    const curIdx = (currentLayer ?? 1) - 1
    if (curIdx >= 0 && curIdx < data.layers.length) {
      ctx.globalAlpha = 1
      drawLayer(data.layers[curIdx], '#2563eb', 1.5)
    }

    ctx.globalAlpha = 1
  }, [data, currentLayer])

  if (!fileId) return null

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        <div
          style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
          className="bg-gray-100 rounded-lg flex items-center justify-center"
        >
          <p className="text-xs text-gray-400">Lade Layer-Vorschau...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div
        style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
        className="bg-gray-100 rounded-lg flex items-center justify-center mx-auto"
      >
        <p className="text-xs text-gray-400">Keine Vorschau verfügbar</p>
      </div>
    )
  }

  const displayLayer = currentLayer ?? 1
  const displayTotal = layerCount ?? data.layer_count

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="rounded-lg border border-gray-200"
      />
      <p className="text-xs text-gray-500 font-mono">
        Layer {displayLayer} / {displayTotal}
      </p>
    </div>
  )
}
