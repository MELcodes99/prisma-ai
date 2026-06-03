import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { BundleLog } from '../../hooks/useData';

interface LifecycleTableProps { logs: BundleLog[]; loading: boolean; }

function CommitmentBadge({ label, slot, ts, color }: { label: string; slot?: number; ts?: number; color: string }) {
  return slot ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
        {slot.toLocaleString()}
      </span>
      {ts && <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {new Date(ts).toLocaleTimeString('en', { hour12: false })}
      </span>}
    </div>
  ) : (
    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>—</span>
  );
}

function BundleRow({ log }: { log: BundleLog }) {
  const [expanded, setExpanded] = useState(false);

  const outcomeColor = log.outcome === 'landed' ? '#6ee7b7'
    : log.outcome === 'failed' ? '#fca5a5'
    : log.outcome === 'retried' ? '#fcd34d'
    : '#a78bfa';

  const strategyColor = log.agentStrategy === 'aggressive' || log.agentStrategy === 'ultra-aggressive'
    ? '#fca5a5' : log.agentStrategy === 'moderate' ? '#67e8f9' : '#a78bfa';

  return (
    <>
      <tr
        onClick={() => setExpanded(v => !v)}
        style={{
          borderBottom: '1px solid rgba(139,92,246,0.08)',
          cursor: 'pointer',
          transition: 'background 0.15s',
          background: expanded ? 'rgba(139,92,246,0.05)' : 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = expanded ? 'rgba(139,92,246,0.05)' : 'transparent')}
      >
        <td style={{ padding: '10px 12px', width: '28px' }}>
          {expanded ? <ChevronDown size={12} color="var(--text-tertiary)" /> : <ChevronRight size={12} color="var(--text-tertiary)" />}
        </td>
        <td style={{ padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          #{log.bundleNumber}
        </td>
        <td style={{ padding: '10px 8px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: outcomeColor, fontWeight: 600, textTransform: 'uppercase' }}>
            {log.outcome === 'landed' ? '✅' : log.outcome === 'failed' ? '❌' : log.outcome === 'retried' ? '🔄' : '⏳'} {log.outcome}
          </span>
        </td>
        <td style={{ padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#a78bfa' }}>
          {log.tipSol.toFixed(6)}
        </td>
        <td style={{ padding: '10px 8px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: strategyColor, textTransform: 'uppercase' }}>
            {log.agentStrategy}
          </span>
        </td>
        <td style={{ padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#67e8f9' }}>
          {(log.agentConfidence * 100).toFixed(0)}%
        </td>
        <td style={{ padding: '10px 8px' }}>
          <CommitmentBadge label="PROC" slot={log.processedSlot} ts={log.processedAt} color="#a78bfa" />
        </td>
        <td style={{ padding: '10px 8px' }}>
          <CommitmentBadge label="CONF" slot={log.confirmedSlot} ts={log.confirmedAt} color="#67e8f9" />
        </td>
        <td style={{ padding: '10px 8px' }}>
          <CommitmentBadge label="FINAL" slot={log.finalizedSlot} ts={log.finalizedAt} color="#6ee7b7" />
        </td>
        <td style={{ padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
          {log.deltaProcessedConfirmedMs ? `${(log.deltaProcessedConfirmedMs / 1000).toFixed(1)}s` : '—'}
        </td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {log.failureType ? <span style={{ color: '#fca5a5' }}>{log.failureType}</span> : '—'}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'rgba(7,7,15,0.6)' }}>
          <td colSpan={11} style={{ padding: '14px 20px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  🤖 Agent Reasoning
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{log.agentReasoning}"
                </div>
              </div>
              <div>
                {log.failureReason && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#fca5a5', marginBottom: '4px', textTransform: 'uppercase' }}>
                      ❌ Failure Reason
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#fca5a5', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
                      {log.failureReason}
                    </div>
                  </div>
                )}
                {log.postMortem && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#fcd34d', marginBottom: '4px', textTransform: 'uppercase' }}>
                      🔍 Post-Mortem
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5, fontStyle: 'italic' }}>
                      "{log.postMortem}"
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Bundle ID', value: log.bundleId.slice(0, 16) + '...' },
                    { label: 'Submitted Slot', value: log.submittedSlot?.toLocaleString() },
                    { label: 'Total Latency', value: log.totalLatencyMs ? `${(log.totalLatencyMs / 1000).toFixed(2)}s` : '—' },
                    { label: 'Retry Count', value: log.retryCount },
                    { label: 'Retry Tip', value: log.retryTipSol ? `${log.retryTipSol.toFixed(6)} SOL` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</div>
                    </div>
                  ))}
                </div>
                {/* Explorer link */}
                {log.outcome === 'landed' && log.submittedSlot && (
                  <a
                    href={`https://explorer.solana.com/block/${log.submittedSlot}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#67e8f9', textDecoration: 'none' }}
                  >
                    <ExternalLink size={10} /> View on Explorer
                  </a>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function LifecycleTable({ logs, loading }: LifecycleTableProps) {
  return (
    <div className="glass" style={{ padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem' }}>
            Lifecycle Log
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {logs.length} bundles tracked — click row to expand agent reasoning
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-green">submitted</span>
          <span className="badge badge-purple">processed</span>
          <span className="badge badge-cyan">confirmed</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              {['', '#', 'Outcome', 'Tip (SOL)', 'Strategy', 'Confidence', 'Processed', 'Confirmed', 'Finalized', 'P→C Δ', 'Failure'].map(h => (
                <th key={h} style={{ padding: '8px 8px 10px', textAlign: 'left', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                No bundles submitted yet — click Submit Bundle to begin
              </td></tr>
            ) : (
              logs.map(log => <BundleRow key={log.bundleId} log={log} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
