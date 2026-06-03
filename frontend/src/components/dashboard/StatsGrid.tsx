import React from 'react';
import { TrendingUp, Target, Zap, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Stats } from '../../hooks/useData';

interface StatsGridProps { stats: Stats | null; }

function StatCard({ icon: Icon, label, value, sub, color, glow }: any) {
  return (
    <div className="glass glass-hover" style={{
      padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{
          width: '30px', height: '30px', borderRadius: '8px',
          background: `rgba(${color},0.12)`,
          border: `1px solid rgba(${color},0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={`rgb(${color})`} />
        </div>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '1.6rem',
        color: `rgb(${color})`,
        textShadow: glow ? `0 0 20px rgba(${color},0.4)` : 'none',
        lineHeight: 1,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{sub}</div>}
    </div>
  );
}

export default function StatsGrid({ stats }: StatsGridProps) {
  if (!stats) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="glass" style={{ height: '110px', opacity: 0.4 }} />
      ))}
    </div>
  );

  const landingRateNum = parseFloat(stats.landingRate);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
      <StatCard
        icon={Target}
        label="Landing Rate"
        value={`${stats.landingRate}%`}
        sub={`${stats.landed} landed / ${stats.totalBundles} total`}
        color={landingRateNum >= 70 ? '16,185,129' : landingRateNum >= 50 ? '245,158,11' : '239,68,68'}
        glow
      />
      <StatCard
        icon={TrendingUp}
        label="Total Bundles"
        value={stats.totalBundles}
        sub={`${stats.failed} failed`}
        color="139,92,246"
        glow
      />
      <StatCard
        icon={Zap}
        label="Avg Tip"
        value={`${parseFloat(stats.avgTipSol).toFixed(5)}`}
        sub={`≈ $${stats.avgTipUsd} USD`}
        color="167,139,250"
      />
      <StatCard
        icon={Clock}
        label="Avg Latency"
        value={stats.avgLatencyMs > 0 ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
        sub="submission → finalized"
        color="6,182,212"
      />
      <StatCard
        icon={CheckCircle}
        label="P→C Delta"
        value={stats.avgProcessedConfirmedDeltaMs > 0 ? `${(stats.avgProcessedConfirmedDeltaMs / 1000).toFixed(1)}s` : '—'}
        sub="processed → confirmed"
        color="16,185,129"
      />
      <StatCard
        icon={AlertTriangle}
        label="Top Failure"
        value={Object.entries(stats.failureBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'}
        sub={`${Object.values(stats.failureBreakdown).reduce((a, b) => a + b, 0)} total failures`}
        color="239,68,68"
      />
    </div>
  );
}
