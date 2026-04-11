import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface ReportResponse {
  content: string
  generated_at: string
  graph_html_exists: boolean
}

function renderMarkdown(md: string) {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let inCode = false
  let codeLines: string[] = []
  let key = 0

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={key++} style={{ background: '#f3f4f6', borderRadius: 8, padding: '10px 14px', fontSize: 11, fontFamily: 'var(--mono)', overflowX: 'auto', margin: '4px 0' }}>
            {codeLines.join('\n')}
          </pre>
        )
        codeLines = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) { codeLines.push(line); continue }

    if (line.startsWith('# ')) {
      elements.push(<h2 key={key++} style={{ fontSize: 15, fontWeight: 900, margin: '16px 0 6px', borderBottom: '1.5px solid var(--border)', paddingBottom: 4 }}>{line.slice(2)}</h2>)
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={key++} style={{ fontSize: 13, fontWeight: 800, margin: '12px 0 4px', color: 'var(--text)' }}>{line.slice(3)}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={key++} style={{ fontSize: 12, fontWeight: 700, margin: '8px 0 3px', color: 'var(--text2)' }}>{line.slice(4)}</h4>)
    } else if (line.match(/^\d+\. /)) {
      elements.push(<p key={key++} style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0', lineHeight: 1.5 }}>{line}</p>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<p key={key++} style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0 2px 12px', lineHeight: 1.5 }}>• {line.slice(2)}</p>)
    } else if (line.startsWith('|')) {
      elements.push(<p key={key++} style={{ fontSize: 11, color: 'var(--text3)', margin: '1px 0', fontFamily: 'var(--mono)' }}>{line}</p>)
    } else if (line.trim() === '') {
      elements.push(<div key={key++} style={{ height: 4 }} />)
    } else {
      elements.push(<p key={key++} style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0', lineHeight: 1.6 }}>{line}</p>)
    }
  }
  return elements
}

export default function GraphifyTab() {
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rendering, setRendering] = useState(false)
  const [renderMsg, setRenderMsg] = useState('')

  const load = () => {
    setLoading(true)
    api.get('/admin/graphify/report')
      .then(r => setReport(r.data))
      .catch(e => setError(e.response?.data?.detail ?? 'Fehler beim Laden'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const renderHtml = async () => {
    setRendering(true)
    setRenderMsg('')
    try {
      const r = await api.post('/admin/graphify/render')
      setRenderMsg(r.data.message)
      load()
    } catch (e: any) {
      setRenderMsg(e.response?.data?.detail ?? 'Fehler')
    } finally {
      setRendering(false)
    }
  }

  if (loading) return <p style={{ fontSize: 13, color: 'var(--text3)' }}>Lade Graph-Report...</p>
  if (error) return <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>
  if (!report) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Knowledge Graph</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            Generiert: {new Date(report.generated_at).toLocaleString('de-DE')}
          </span>
          <button
            onClick={renderHtml}
            disabled={rendering}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 7, cursor: 'pointer', border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontFamily: 'inherit' }}
          >
            {rendering ? 'Generiere...' : '↺ HTML neu generieren'}
          </button>
        </div>
      </div>

      {renderMsg && <p style={{ fontSize: 11, color: 'var(--text3)' }}>{renderMsg}</p>}

      {/* Interactive Graph iframe */}
      {report.graph_html_exists ? (
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <iframe
            src="/graphify/graph.html"
            style={{ width: '100%', height: 520, border: 'none', display: 'block' }}
            title="Knowledge Graph"
          />
        </div>
      ) : (
        <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>Noch keine HTML-Visualisierung vorhanden.</p>
          <button
            onClick={renderHtml}
            disabled={rendering}
            className="btn-lime"
            style={{ fontSize: 13, padding: '8px 20px' }}
          >
            {rendering ? 'Generiere...' : 'Graph HTML generieren'}
          </button>
        </div>
      )}

      {/* Report Text */}
      <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '16px 20px' }}>
        {renderMarkdown(report.content)}
      </div>
    </div>
  )
}
