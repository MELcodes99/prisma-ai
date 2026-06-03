import React from 'react';
import { Brain, TrendingUp, Shield, Zap } from 'lucide-react';
import type { BundleLog } from '../../hooks/useData';

interface AgentPanelProps { logs: BundleLog[]; }

const strategyIcons: Record<string, any> = {
  conservative: Shield,
  moderate: TrendingUp,
  aggressive: Zap,
  'ultra-aggressive': Zap,
  retry: Brain,
};

const strategyColors: Record<string, string> = {
  conservative: '#6ee7b7',
  moderate: '#67e8f9',
  aggressive: '#fcd34d',
  'ultra-aggressive': '#fca5a5',
  retry: '#a78bfa',
};

export default function AgentPanel({ logs }: AgentPanelProps) {
  const recent = logs.slice(0, 5);
  const latest = logs[0];

  // Accuracy: landed bundles where confidence was high
  const highConfidence = logs.filter(l => l.agentConfidence >= 0.75);
  const highConfLanded = highConfidence.filter(l => l.outcome === 'landed');
  const accuracy = highConfidence.length > 0
    ? ((highConfLanded.length / highConfidence.length) * 100).toFixed(0)
    : '—';

  return (
    <div className="glass" style={{ padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: 'linear-gradient(135deg, rgba(107,63,203,0.4), rgba(6,182,212,0.2))',
          border: '1px solid rgba(139,92,246,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Brain size={14} color="#a78bfa" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem' }}>PrismaAI Agent</div>
          <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginTop: '1px' }}>
            High-conf accuracy: {accuracy}%
          </div>
        </div>
      </div>

      {/* Latest decision highlight */}
      {latest && (
        <div style={{
          padding: '14px', marginBottom: '16px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(107,63,203,0.12), rgba(6,182,212,0.06))',
          border: '1px solid rgba(139,92,246,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Latest Decision — Bundle #{latest.bundleNumber}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>TIP</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: '#a78bfa' }}>
                {latest.tipSol.toFixed(6)} <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>SOL</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>CONFIDENCE</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: latest.agentConfidence >= 0.75 ? '#6ee7b7' : '#fcd34d' }}>
                {(latest.agentConfidence * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>STRATEGY</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, color: strategyColors[latest.agentStrategy] || '#a78bfa', textTransform: 'uppercase' }}>
                {latest.agentStrategy}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.6, fontStyle: 'italic' }}>
            "{latest.agentReasoning}"
          </div>
        </div>
      )}

      {/* Recent decisions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {recent.map((log, i) => {
          const Icon = strategyIcons[log.agentStrategy] || Brain;
          const color = strategyColors[log.agentStrategy] || '#a78bfa';
          return (
            <div key={log.bundleId} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '8px',
              background: 'rgba(7,7,15,0.5)',
              border: '1px solid rgba(139,92,246,0.08)',
              opacity: i === 0 ? 1 : 0.75 - i * 0.1,
            }}>
              <Icon size={12} color={color} />
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', minWidth: '28px' }}>
                #{log.bundleNumber}
              </span>
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#a78bfa', minWidth: '80px' }}>
                {log.tipSol.toFixed(6)}
              </span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color, textTransform: 'uppercase', minWidth: '80px' }}>
                {log.agentStrategy}
              </span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: log.agentConfidence >= 0.75 ? '#6ee7b7' : '#fcd34d' }}>
                {(log.agentConfidence * 100).toFixed(0)}%
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                {log.outcome === 'landed' ? '✅' : log.outcome === 'failed' ? '❌' : log.outcome === 'retried' ? '🔄' : '⏳'}
              </span>
            </div>
          );
        })}
        {recent.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            No agent decisions yet
          </div>
        )}
      </div>
    </div>
  );
}
