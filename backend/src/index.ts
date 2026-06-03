import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { config } from './config';
import { logger } from './utils/logger';
import { apiRouter } from './api/routes';
import { startGeyserStream, geyserStream } from './geyser/stream';
import { jitoTipMonitor } from './jito/tipMonitor';
import { lifecycleTracker } from './lifecycle/tracker';
import { bundleOrchestrator } from './queue/orchestrator';
import { getNetworkStats } from './redis/client';

// ── Ensure logs directory exists ─────────────────────────────────────────────
if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);

const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests',
  })
);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Socket.IO real-time events ────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`WebSocket client connected: ${socket.id}`);

  // Send current state on connect
  getNetworkStats().then((stats) => {
    if (stats) socket.emit('networkStats', stats);
  });

  socket.on('disconnect', () => {
    logger.debug(`WebSocket client disconnected: ${socket.id}`);
  });

  // Manual bundle submission via socket
  socket.on('submitBundle', async (data: { faultInject?: string }) => {
    try {
      const result = await bundleOrchestrator.submitBundle({
        faultInject: data.faultInject as any,
      });
      socket.emit('bundleResult', result);
    } catch (err: any) {
      socket.emit('bundleError', { error: err.message });
    }
  });
});

// ── Forward events to all socket clients ─────────────────────────────────────
geyserStream.on('slot', (slotData) => {
  io.emit('slotUpdate', slotData);
});

geyserStream.on('tipUpdate', (snapshot) => {
  io.emit('tipUpdate', snapshot);
});

geyserStream.on('connected', () => {
  io.emit('geyserStatus', { connected: true, timestamp: Date.now() });
});

geyserStream.on('disconnected', () => {
  io.emit('geyserStatus', { connected: false, timestamp: Date.now() });
});

lifecycleTracker.on('stageUpdate', (bundle) => {
  io.emit('bundleStageUpdate', bundle);
});

lifecycleTracker.on('landed', (bundle) => {
  io.emit('bundleLanded', bundle);
  logger.info(`📡 Broadcast: Bundle #${bundle.bundleNumber} LANDED`);
});

lifecycleTracker.on('failed', (bundle) => {
  io.emit('bundleFailed', bundle);
});

lifecycleTracker.on('retried', (bundle) => {
  io.emit('bundleRetried', bundle);
});

bundleOrchestrator.on('bundleSubmitted', (data) => {
  io.emit('bundleSubmitted', data);
});

// ── Periodic network stats broadcast ─────────────────────────────────────────
setInterval(async () => {
  try {
    const stats = {
      lastSlot: geyserStream.getLastSlot(),
      slotVelocity: geyserStream.getSlotVelocity(),
      geyserConnected: geyserStream.isConnected(),
      timestamp: Date.now(),
    };
    io.emit('networkStats', stats);
  } catch {}
}, 2000);

// ── Startup ───────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  logger.info('');
  logger.info('██████╗ ██████╗ ██╗███████╗███╗   ███╗ █████╗      █████╗ ██╗');
  logger.info('██╔══██╗██╔══██╗██║██╔════╝████╗ ████║██╔══██╗    ██╔══██╗██║');
  logger.info('██████╔╝██████╔╝██║███████╗██╔████╔██║███████║    ███████║██║');
  logger.info('██╔═══╝ ██╔══██╗██║╚════██║██║╚██╔╝██║██╔══██║    ██╔══██║██║');
  logger.info('██║     ██║  ██║██║███████║██║ ╚═╝ ██║██║  ██║    ██║  ██║██║');
  logger.info('╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝');
  logger.info('');
  logger.info('AI-Powered Tip Oracle | Real-Time Slot Intelligence');
  logger.info(`Network: ${config.network.toUpperCase()} | Port: ${config.port}`);
  logger.info('');

  // Start Geyser stream
  startGeyserStream();

  // Start Jito tip monitor
  await jitoTipMonitor.start();

  // Start HTTP server
  httpServer.listen(config.port, () => {
    logger.info(`✅ PrismaAI server running on port ${config.port}`);
    logger.info(`   API:       http://localhost:${config.port}/api`);
    logger.info(`   Health:    http://localhost:${config.port}/api/health`);
    logger.info(`   WebSocket: ws://localhost:${config.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down PrismaAI...');
  geyserStream.shutdown();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
}

start().catch((err) => {
  logger.error('Failed to start PrismaAI', { err });
  process.exit(1);
});
