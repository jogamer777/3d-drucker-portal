import { useParams, useLocation, Link } from 'react-router-dom'

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—'
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`
}

export default function PrintSuccess() {
  const { id: printerId } = useParams<{ id: string }>()
  const { state } = useLocation() as {
    state: { filename?: string; cost?: number; duration?: number | null; grams?: number } | null
  }

  const filename = state?.filename ?? 'Unbekannte Datei'
  const cost = state?.cost ?? 0
  const duration = state?.duration ?? null
  const grams = state?.grams ?? 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        {/* Success circle */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'var(--lime)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
          Druck gestartet!
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, margin: '0 0 24px' }}>
          Dein Druckauftrag wurde erfolgreich gestartet.
        </p>

        {/* Details card */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '0.5px solid var(--border)',
          padding: '16px 20px',
          textAlign: 'left',
          marginBottom: 20,
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filename}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {duration && duration > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text2)' }}>Druckzeit ca.</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{formatDuration(duration)}</span>
              </div>
            )}
            {grams > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text2)' }}>Filament</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{grams.toFixed(1)} g</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
              <span style={{ fontWeight: 700 }}>Kosten</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 900 }}>
                {cost === 0 ? 'kostenlos' : `${(cost / 100).toFixed(2)} €`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            to={`/drucker/${printerId}`}
            className="btn-secondary"
            style={{ flex: 1, padding: '11px 16px', fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Drucker-Details
          </Link>
          <Link
            to="/"
            className="btn-lime"
            style={{ flex: 1, padding: '11px 16px', fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Zum Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
