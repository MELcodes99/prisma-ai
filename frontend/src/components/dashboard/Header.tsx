import React from 'react';
import { Activity, Zap, Cpu } from 'lucide-react';

interface HeaderProps {
  lastSlot: number;
  geyserConnected: boolean;
  socketConnected: boolean;
  solPrice: number;
}

export default function Header({ lastSlot, geyserConnected, socketConnected, solPrice }: HeaderProps) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(3,3,8,0.85)',
      backdropFilter: 'blur(24px)',
      borderBottom: '1px solid rgba(139,92,246,0.12)',
      padding: '0 24px',
      height: '64px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'linear-gradient(135deg, #6b3fcb, #06b6d4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(107,63,203,0.4)',
        }}>
          <Cpu size={18} color="#fff" />
        </div>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.15rem',
            background: 'linear-gradient(90deg, #a78bfa, #67e8f9)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>PrismaAI</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '-2px' }}>
            TIP ORACLE v1.0
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* SOL price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>SOL</span>
          <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#a78bfa' }}>
            ${solPrice > 0 ? solPrice.toFixed(2) : '—'}
          </span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(139,92,246,0.2)' }} />

        {/* Slot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={12} color="var(--text-tertiary)" />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            SLOT
          </span>
          <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {lastSlot > 0 ? lastSlot.toLocaleString() : '—'}
          </span>
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(139,92,246,0.2)' }} />

        {/* Geyser */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={geyserConnected ? 'dot-live' : 'dot-dead'} />
          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: geyserConnected ? '#6ee7b7' : '#fca5a5' }}>
            GEYSER
          </span>
        </div>

        {/* WS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={socketConnected ? 'dot-live' : 'dot-dead'} />
          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: socketConnected ? '#6ee7b7' : '#fca5a5' }}>
            WS
          </span>
        </div>

        {/* Network badge */}
        <div style={{
          padding: '4px 12px', borderRadius: '20px',
          background: 'rgba(107,63,203,0.15)',
          border: '1px solid rgba(107,63,203,0.3)',
          fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
          fontWeight: 600, letterSpacing: '0.08em',
          color: 'var(--purple-300)',
        }}>
          MAINNET
        </div>
      </div>
    </header>
  );
}
