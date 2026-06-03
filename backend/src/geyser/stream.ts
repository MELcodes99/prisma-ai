import WebSocket from 'ws';
import { config } from '../config';
import { logger } from '../utils/logger';
import { saveNetworkStats } from '../redis/client';
import { EventEmitter } from 'events';

export interface SlotData {
  slot: number;
  parent: number;
  root: number;
  timestamp: number;
}

export interface TipAccountSnapshot {
  account: string;
  balance: number;
  slot: number;
  timestamp: number;
}

export interface GeyserStreamState {
  connected: boolean;
  lastSlot: number;
  slotVelocity: number; // slots per second
  recentSlots: SlotData[];
  tipSnapshots: TipAccountSnapshot[];
  reconnectCount: number;
}

class GeyserStreamManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private slotBuffer: SlotData[] = [];
  private slotTimestamps: number[] = [];
  private isShuttingDown = false;

  public state: GeyserStreamState = {
    connected: false,
    lastSlot: 0,
    slotVelocity: 0,
    recentSlots: [],
    tipSnapshots: [],
    reconnectCount: 0,
  };

  connect(): void {
    if (this.isShuttingDown) return;

    try {
      // Use SolInfra WebSocket for Yellowstone-compatible slot streaming
      const wsUrl = config.heliusWs;
      logger.info(`Connecting to Geyser stream: ${wsUrl.split('?')[0]}`);

      this.ws = new WebSocket(wsUrl, {
        handshakeTimeout: 10000,
        headers: {
          'x-token': config.yellowstoneToken,
        },
      });

      this.ws.on('open', () => {
        logger.info('✅ Geyser stream connected');
        this.state.connected = true;
        this.reconnectDelay = 1000; // Reset backoff
        this.emit('connected');

        // Subscribe to slot notifications
        this.ws!.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'slotSubscribe',
          })
        );

        // Subscribe to Jito tip account changes
        config.jitoTipAccounts.slice(0, 3).forEach((account, i) => {
          this.ws!.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 100 + i,
              method: 'accountSubscribe',
              params: [account, { encoding: 'base64', commitment: 'confirmed' }],
            })
          );
        });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (err) => {
        logger.error('Geyser WebSocket error', { message: err.message });
        this.state.connected = false;
      });

      this.ws.on('close', (code, reason) => {
        logger.warn(`Geyser stream closed: ${code} ${reason}`);
        this.state.connected = false;
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      // Heartbeat ping
      const pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);

    } catch (err) {
      logger.error('Geyser connect error', { err });
      this.scheduleReconnect();
    }
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      // Slot notification
      if (msg.method === 'slotNotification' && msg.params?.result) {
        const { slot, parent, root } = msg.params.result;
        const slotData: SlotData = { slot, parent, root, timestamp: Date.now() };
        this.onSlotUpdate(slotData);
      }

      // Account notification (tip account balance change)
      if (msg.method === 'accountNotification' && msg.params?.result) {
        const { value, context } = msg.params.result;
        if (value?.lamports !== undefined) {
          this.onTipAccountUpdate(context.slot, value.lamports);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private onSlotUpdate(slotData: SlotData): void {
    this.state.lastSlot = slotData.slot;

    // Maintain rolling slot buffer
    this.slotBuffer.push(slotData);
    this.slotTimestamps.push(slotData.timestamp);
    if (this.slotBuffer.length > config.slotHistoryWindow) {
      this.slotBuffer.shift();
      this.slotTimestamps.shift();
    }

    // Calculate slot velocity (slots per second over last 10 slots)
    if (this.slotTimestamps.length >= 10) {
      const recent = this.slotTimestamps.slice(-10);
      const elapsed = (recent[recent.length - 1] - recent[0]) / 1000;
      this.state.slotVelocity = elapsed > 0 ? 9 / elapsed : 0;
    }

    this.state.recentSlots = this.slotBuffer.slice(-20);
    this.emit('slot', slotData);

    // Save to Redis periodically (every 10 slots)
    if (slotData.slot % 10 === 0) {
      this.persistStats();
    }
  }

  private onTipAccountUpdate(slot: number, lamports: number): void {
    const snapshot: TipAccountSnapshot = {
      account: 'jito-tip',
      balance: lamports / 1e9,
      slot,
      timestamp: Date.now(),
    };
    this.state.tipSnapshots.push(snapshot);
    if (this.state.tipSnapshots.length > 100) {
      this.state.tipSnapshots.shift();
    }
    this.emit('tipUpdate', snapshot);
  }

  private async persistStats(): Promise<void> {
    await saveNetworkStats({
      lastSlot: this.state.lastSlot,
      slotVelocity: this.state.slotVelocity,
      connected: this.state.connected,
      reconnectCount: this.state.reconnectCount,
      timestamp: Date.now(),
    });
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    logger.info(`Reconnecting in ${this.reconnectDelay}ms...`);
    this.state.reconnectCount++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  getSlotVelocity(): number {
    return this.state.slotVelocity;
  }

  getLastSlot(): number {
    return this.state.lastSlot;
  }

  isConnected(): boolean {
    return this.state.connected;
  }

  shutdown(): void {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
  }
}

// Singleton instance
export const geyserStream = new GeyserStreamManager();

export function startGeyserStream(): void {
  geyserStream.connect();
}
