const CONFIG: Record<string, { bg: string; cls: string }> = {
  idle:          { bg: '#10b981', cls: 'status-dot-ready'    },
  printing:      { bg: '#2563eb', cls: 'status-dot-printing' },
  paused:        { bg: '#f59e0b', cls: 'status-dot-warning'  },
  error:         { bg: '#ef4444', cls: 'status-dot-error'    },
  complete:      { bg: '#10b981', cls: 'status-dot-ready'    },
  offline:       { bg: '#ccc',    cls: 'status-dot-offline'  },
  pending_setup: { bg: '#ccc',    cls: 'status-dot-offline'  },
}

export default function StatusDot({ state, size = 8 }: { state: string; size?: number }) {
  const c = CONFIG[state] ?? CONFIG.offline
  return (
    <span
      className={c.cls}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: c.bg,
        flexShrink: 0,
      }}
    />
  )
}
