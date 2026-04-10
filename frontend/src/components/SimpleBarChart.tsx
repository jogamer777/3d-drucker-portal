interface DataPoint {
  label: string
  value: number
}

interface Props {
  data: DataPoint[]
  height?: number
  color?: string
  formatValue?: (v: number) => string
  emptyText?: string
}

export default function SimpleBarChart({
  data,
  height = 140,
  color = '#2563eb',
  formatValue = (v) => String(v),
  emptyText = 'Keine Daten',
}: Props) {
  if (!data.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded-lg"
      >
        {emptyText}
      </div>
    )
  }

  const maxVal = Math.max(...data.map(d => d.value), 1)
  const barPadding = 4
  const barWidth = Math.max(8, Math.floor((300 - barPadding * data.length) / data.length))
  const svgWidth = Math.max(300, (barWidth + barPadding) * data.length + barPadding)
  const labelHeight = 28
  const chartHeight = height - labelHeight
  const valueAreaHeight = chartHeight - 20

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgWidth}
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        style={{ minWidth: '100%' }}
      >
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.value / maxVal) * valueAreaHeight))
          const bx = barPadding + i * (barWidth + barPadding)
          const by = chartHeight - barH

          return (
            <g key={i}>
              {/* Balken */}
              <rect
                x={bx}
                y={by}
                width={barWidth}
                height={barH}
                fill={color}
                rx={2}
                opacity={0.85}
              />
              {/* Wert oben */}
              {d.value > 0 && (
                <text
                  x={bx + barWidth / 2}
                  y={by - 3}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#6b7280"
                >
                  {formatValue(d.value)}
                </text>
              )}
              {/* Label unten */}
              <text
                x={bx + barWidth / 2}
                y={chartHeight + 14}
                textAnchor="middle"
                fontSize={8}
                fill="#9ca3af"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
