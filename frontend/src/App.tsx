import React, { useState, useCallback } from 'react';
import Header from './components/dashboard/Header';
import StatsGrid from './components/dashboard/StatsGrid';
import TipChart from './components/dashboard/TipChart';
import SubmitPanel from './components/dashboard/SubmitPanel';
import LifecycleTable from './components/dashboard/LifecycleTable';
import AgentPanel from './components/dashboard/AgentPanel';
import LiveFeed from './components/dashboard/LiveFeed';
import { useSocket, useNetwork, useLifecycleLogs, useStats, useWallet } from './hooks/useData';

export default function App() {
  const { connected, lastSlot, geyserConnected, liveEvents } = useSocket();
  const { data: network, refetch: refetchNetwork } = useNetwork();
  const { logs, loading: logsLoading, refetch: refetchLogs } = useLifecycleLogs();
  const { stats, refetch: refetchStats } = useStats();
  const wallet = useWallet();

  const handleSubmitted = useCallback(() => {
    setTimeout(() => {
      refetchLogs();
      refetchStats();
      refetchNetwork();
    }, 800);
  }, [refetchLogs, refetchStats, refetchNetwork]);

  return (
    <div className="noise" style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="mesh-bg" />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Header
          lastSlot={lastSlot}
          geyserConnected={geyserConnected}
          socketConnected={connected}
          solPrice={network?.solPrice || stats?.solPrice || 0}
        />

        <main style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Hero title */}
          <div style={{ paddingTop: '8px', paddingBottom: '4px' }}>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
              lineHeight: 1.1,
              marginBottom: '8px',
            }}>
              <span className="text-shimmer">Tip Oracle</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 300 }}> — Real-Time Slot Intelligence</span>
            </h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', maxWidth: '600px', lineHeight: 1.6 }}>
              PrismaAI analyzes live Jito tip percentiles, slot velocity, and historical bundle outcomes to compute the optimal tip for every submission. Every decision is reasoned, logged, and cross-referenceable on-chain.
            </p>
          </div>

          {/* Stats row */}
          <StatsGrid stats={stats} />

          {/* Main content grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>

            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <TipChart network={network} />
              <LifecycleTable logs={logs} loading={logsLoading} />
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <SubmitPanel
                onSubmitted={handleSubmitted}
                walletBalance={wallet?.balance}
                walletAddress={wallet?.address}
              />
              <AgentPanel logs={logs} />
              <LiveFeed events={liveEvents} />
            </div>
          </div>

          {/* Footer */}
          <footer style={{
            padding: '20px 0 8px',
            borderTop: '1px solid rgba(139,92,246,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              PrismaAI · Powered by Jito · SolInfra · OpenAI · Helius
            </div>
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              All fees paid by backend wallet · Users pay nothing
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
