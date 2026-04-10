import { Link } from 'react-router-dom'
import { formatBalance } from '../stores/authStore'

export default function BalanceChip({ balance_cents }: { balance_cents: number }) {
  return (
    <Link
      to="/guthaben"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        border: '1.5px solid var(--lime)',
        background: 'var(--lime-bg)',
        borderRadius: 999,
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--text)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--emerald)',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {formatBalance(balance_cents)}
    </Link>
  )
}
