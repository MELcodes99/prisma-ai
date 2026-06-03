import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { NetworkState } from '../../hooks/useData';

interface TipChartProps { network: NetworkState | null; }

const MAX_POINTS = 40;

export default function TipChart({ network }: TipChartProps) {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!network?.tipPercentiles) return;
    const t = network.tipPercentiles;
    setHistory(prev => {
      const next = [...prev, {
        time: new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        p10: +(t.p10 * 1000).toFixed(4),
        p50: +(t.p50 * 1000).toFixed(4),
        p75: +(t.p75 * 1000).toFixed(4),
        p90: +(t.p90 * 1000).toFixed(4),
      }];
      return next.slice(-MAX_POINTS);
    });
  }, [network?.tipPercentiles?.timestamp]);

  const currentTip = network?.tipPercentiles;

  return (
    <div className="glass" style={{ padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            Live Tip Percentiles
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            mSOL per slot — source: {currentTip?.source || 'fetching...'}
          </div>
        </div>
        {currentTip && (
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { label: 'p50', value: currentTip.p50, color: '#a78bfa' },
              { label: 'p75', value: currentTip.p75, color: '#67e8f9' },
              { label: 'p90', value: currentTip.p90, color: '#6ee7b7' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem', color }}>{value.toFixed(6)}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>SOL</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {history.length > 1 ? (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gp90" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gp75" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#67e8f9" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#67e8f9" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gp50" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: '#6b6580', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#6b6580', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#111127', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px', fontFamily: 'JetBrains Mono', fontSize: '11px' }}
              labelStyle={{ color: '#a09ab8' }}
              formatter={(val: any) => [`${val} mSOL`, '']}
            />
            <Area type="monotone" dataKey="p90" stroke="#6ee7b7" strokeWidth={1.5} fill="url(#gp90)" dot={false} />
            <Area type="monotone" dataKey="p75" stroke="#67e8f9" strokeWidth={1.5} fill="url(#gp75)" dot={false} />
            <Area type="monotone" dataKey="p50" stroke="#a78bfa" strokeWidth={2} fill="url(#gp50)" dot={false} />
            <Area type="monotone" dataKey="p10" stroke="#6b6580" strokeWidth={1} fill="none" dot={false} strokeDasharray="4 4" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
          Accumulating tip data...
        </div>
      )}

      {/* Velocity indicator */}
      {network?.tipVelocity && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>VELOCITY TREND</div>
          <span className={`badge ${network.tipVelocity.trend === 'rising' ? 'badge-red' : network.tipVelocity.trend === 'falling' ? 'badge-green' : 'badge-amber'}`}>
            {network.tipVelocity.trend === 'rising' ? '↑' : network.tipVelocity.trend === 'falling' ? '↓' : '→'} {network.tipVelocity.trend}
          </span>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
            {network.tipVelocity.solPerSlot.toFixed(6)} SOL/slot
          </div>
        </div>
      )}
    </div>
  );
}
