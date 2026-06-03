import React, { useState } from 'react';
import { Send, Zap, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { submitBundle } from '../../hooks/useData';

interface SubmitPanelProps {
  onSubmitted: () => void;
  walletBalance?: number;
  walletAddress?: string;
}

export default function SubmitPanel({ onSubmitted, walletBalance, walletAddress }: SubmitPanelProps) {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [showFaults, setShowFaults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (faultInject?: string) => {
    setLoading(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await submitBundle(faultInject);
      setLastResult(result);
      onSubmitted();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass" style={{ padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem' }}>
            Bundle Control
          </div>
          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            AI-driven Jito bundle submission
          </div>
        </div>
        {walletBalance !== undefined && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>FEE PAYER</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600, color: walletBalance < 0.05 ? '#fca5a5' : '#a78bfa' }}>
              {walletBalance?.toFixed(4)} SOL
            </div>
            {walletAddress && (
              <div className="truncate-address" style={{ fontSize: '0.62rem' }}>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main submit button */}
      <button
        onClick={() => handleSubmit()}
        disabled={loading}
        style={{
          width: '100%', padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(139,92,246,0.4)',
          background: loading
            ? 'rgba(139,92,246,0.1)'
            : 'linear-gradient(135deg, rgba(107,63,203,0.35), rgba(139,92,246,0.2))',
          color: loading ? 'var(--text-tertiary)' : 'var(--purple-200)',
          fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.85rem',
          letterSpacing: '0.06em', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: 'all 0.2s',
          boxShadow: loading ? 'none' : '0 0 20px rgba(107,63,203,0.2)',
        }}
      >
        {loading ? (
          <>
            <RefreshCw size={15} style={{ animation: 'spin-slow 1s linear infinite' }} />
            AGENT COMPUTING...
          </>
        ) : (
          <>
            <Send size={15} />
            SUBMIT BUNDLE
          </>
        )}
      </button>

      {/* Fault injection toggle */}
      <div style={{ marginTop: '12px' }}>
        <button
          onClick={() => setShowFaults(v => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            color: 'var(--text-tertiary)', fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
            padding: '4px 0',
          }}
        >
          <AlertTriangle size={11} />
          FAULT INJECTION
          {showFaults ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showFaults && (
          <div className="animate-slide-up" style={{ marginTop: '10px', display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', padding: '8px', background: 'rgba(245,158,11,0.06)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.15)' }}>
              ⚠️ Inject failures to test AI agent recovery. Agent will detect, diagnose, and retry autonomously.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={() => handleSubmit('expired_blockhash')}
                disabled={loading}
                style={{
                  padding: '10px', borderRadius: '8px',
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#fca5a5', fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem', cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 600, letterSpacing: '0.04em',
                }}
              >
                💀 EXPIRED BLOCKHASH
              </button>
              <button
                onClick={() => handleSubmit('low_fee')}
                disabled={loading}
                style={{
                  padding: '10px', borderRadius: '8px',
                  border: '1px solid rgba(245,158,11,0.3)',
                  background: 'rgba(245,158,11,0.08)',
                  color: '#fcd34d', fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem', cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 600, letterSpacing: '0.04em',
                }}
              >
                🪙 LOW FEE BUNDLE
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Result display */}
      {lastResult && (
        <div className="animate-slide-up" style={{
          marginTop: '14px', padding: '12px',
          borderRadius: '10px',
          border: `1px solid ${lastResult.success ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          background: lastResult.success ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: lastResult.success ? '#6ee7b7' : '#fca5a5' }}>
              {lastResult.success ? '✅ SUBMITTED' : '❌ FAILED'}
            </span>
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              Bundle #{lastResult.bundleNumber}
            </span>
            {lastResult.retried && <span className="badge badge-amber">RETRIED</span>}
          </div>
          {lastResult.bundleId && (
            <div className="truncate-address" style={{ marginBottom: '6px' }}>
              {lastResult.bundleId.slice(0, 20)}...
            </div>
          )}
          <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            Tip: <span style={{ color: '#a78bfa' }}>{lastResult.tipSol?.toFixed(6)} SOL</span>
            {lastResult.finalTipSol && (
              <span style={{ color: '#fcd34d' }}> → {lastResult.finalTipSol?.toFixed(6)} SOL (retry)</span>
            )}
          </div>
          {lastResult.agentDecision?.reasoning && (
            <div style={{ marginTop: '8px', fontSize: '0.68rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', lineHeight: 1.5, fontStyle: 'italic' }}>
              "{lastResult.agentDecision.reasoning.substring(0, 160)}..."
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="animate-slide-up" style={{
          marginTop: '12px', padding: '10px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#fca5a5',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
