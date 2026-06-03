import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

const API_BASE = '/_/backend/api';
const SOCKET_URL = window.location.origin;;

// ── Types ──────────────────────────────────────────────────────────────────
export interface NetworkState {
  slot: number;
  slotVelocity: number;
  geyserConnected: boolean;
  tipPercentiles: {
    p10: number; p25: number; p50: number;
    p75: number; p90: number; p95: number;
    source: string; timestamp: number;
  };
  tipVelocity: { solPerSlot: number; trend: string };
  solPrice: number;
  timestamp: number;
}

export interface BundleLog {
  bundleId: string;
  bundleNumber: number;
  submittedAt: number;
  submittedSlot: number;
  processedAt?: number;
  processedSlot?: number;
  confirmedAt?: number;
  confirmedSlot?: number;
  finalizedAt?: number;
  finalizedSlot?: number;
  tipSol: number;
  agentReasoning: string;
  agentConfidence: number;
  agentStrategy: string;
  outcome: 'pending' | 'landed' | 'failed' | 'retried';
  failureType?: string;
  failureReason?: string;
  retryCount: number;
  retryTipSol?: number;
  postMortem?: string;
  deltaProcessedConfirmedMs?: number;
  deltaConfirmedFinalizedMs?: number;
  totalLatencyMs?: number;
}

export interface Stats {
  totalBundles: number;
  landed: number;
  failed: number;
  landingRate: string;
  avgTipSol: string;
  avgTipUsd: string;
  avgLatencyMs: number;
  avgProcessedConfirmedDeltaMs: number;
  failureBreakdown: Record<string, number>;
  solPrice: number;
  geyserConnected: boolean;
  lastSlot: number;
}

// ── Socket hook ────────────────────────────────────────────────────────────
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSlot, setLastSlot] = useState<number>(0);
  const [geyserConnected, setGeyserConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('slotUpdate', (data: any) => {
      setLastSlot(data.slot);
    });

    socket.on('networkStats', (data: any) => {
      if (data.lastSlot) setLastSlot(data.lastSlot);
      if (typeof data.geyserConnected === 'boolean') setGeyserConnected(data.geyserConnected);
    });

    socket.on('geyserStatus', (data: any) => {
      setGeyserConnected(data.connected);
    });

    const addEvent = (type: string, data: any) => {
      setLiveEvents(prev => [{ type, data, timestamp: Date.now() }, ...prev].slice(0, 50));
    };

    socket.on('bundleSubmitted', (d) => addEvent('submitted', d));
    socket.on('bundleLanded', (d) => addEvent('landed', d));
    socket.on('bundleFailed', (d) => addEvent('failed', d));
    socket.on('bundleRetried', (d) => addEvent('retried', d));
    socket.on('bundleStageUpdate', (d) => addEvent('stage', d));

    return () => { socket.disconnect(); };
  }, []);

  const submitBundle = useCallback((faultInject?: string) => {
    socketRef.current?.emit('submitBundle', { faultInject });
  }, []);

  return { connected, lastSlot, geyserConnected, liveEvents, submitBundle, socket: socketRef.current };
}

// ── API hooks ──────────────────────────────────────────────────────────────
export function useNetwork() {
  const [data, setData] = useState<NetworkState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/network`);
      setData(res.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 3000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { data, loading, refetch: fetch };
}

export function useLifecycleLogs() {
  const [logs, setLogs] = useState<BundleLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/logs/lifecycle?limit=50`);
      setLogs(res.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 4000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { logs, loading, refetch: fetch };
}

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  const fetch = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`);
      setStats(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { stats, refetch: fetch };
}

export function useWallet() {
  const [wallet, setWallet] = useState<{ address: string; balance: number } | null>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/wallet`).then(r => setWallet(r.data)).catch(() => {});
  }, []);

  return wallet;
}

// ── Bundle submission ──────────────────────────────────────────────────────
export async function submitBundle(faultInject?: string) {
  const endpoint = faultInject === 'expired_blockhash'
    ? `${API_BASE}/bundle/inject/expired-blockhash`
    : faultInject === 'low_fee'
    ? `${API_BASE}/bundle/inject/low-fee`
    : `${API_BASE}/bundle/submit`;

  const res = await axios.post(endpoint, {});
  return res.data;
}
