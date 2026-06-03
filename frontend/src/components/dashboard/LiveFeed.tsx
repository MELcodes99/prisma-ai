import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';

interface LiveFeedProps { events: any[]; }

const eventConfig: Record<string, { emoji: string; color: string; label: string }> = {
  submitted: { emoji: '🚀', color: '#a78bfa', label: 'SUBMITTED' },
  landed:    { emoji: '✅', color: '#6ee7b7', label: 'LANDED' },
  failed:    { emoji: '❌', color: '#fca5a5', label: 'FAILED' },
  retried:   { emoji: '🔄', color: '#fcd34d', label: 'RETRIED' },
  stage:     { emoji: '📈', color: '#67e8f9', label: 'STAGE' },
};

export default function LiveFeed({ events }: LiveFeedProps) {
  return (
    <div className="glass" style={{ padding: '22px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Activity size={14} color="var(--text-tertiary)" />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem' }}>Live Feed</div>
        {events.length > 0 && <span className="dot-live" style={{ marginLeft: 'auto' }} />}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {events.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', textAlign: 'center', paddingTop: '20px' }}>
            Waiting for events...
          </div>
        ) : events.map((ev, i) => {
          const cfg = eventConfig[ev.type] || { emoji: '•', color: 'var(--text-secondary)', label: ev.type };
          return (
            <div
              key={i}
              className="animate-slide-up"
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                background: 'rgba(7,7,15,0.6)',
                border: `1px solid rgba(${cfg.color === '#a78bfa' ? '139,92,246' : cfg.color === '#6ee7b7' ? '16,185,129' : cfg.color === '#fca5a5' ? '239,68,68' : '245,158,11'},0.15)`,
                animationDelay: `${i * 0.02}s`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '0.75rem' }}>{cfg.emoji}</span>
                  <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: cfg.color, letterSpacing: '0.06em' }}>
                    {cfg.label}
                  </span>
                  {ev.data?.bundleNumber && (
                    <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                      #{ev.data.bundleNumber}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
                </span>
              </div>
              {ev.data?.tipSol && (
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                  tip: <span style={{ color: '#a78bfa' }}>{ev.data.tipSol?.toFixed?.(6)} SOL</span>
                </div>
              )}
              {ev.data?.outcome && (
                <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {ev.data.stages?.map((s: any) => s.stage).join(' → ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
