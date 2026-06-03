import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Network
  network: process.env.NETWORK || 'mainnet',
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // RPC
  heliusRpc: process.env.HELIUS_RPC_MAINNET!,
  heliusWs: process.env.HELIUS_WS_MAINNET!,
  heliusApiKey: process.env.HELIUS_API_KEY!,
  solinfraRpc: process.env.SOLINFRA_RPC_URL!,
  solinfraWs: process.env.SOLINFRA_WS_URL!,

  // Yellowstone gRPC
  yellowstoneEndpoint: process.env.YELLOWSTONE_GRPC_ENDPOINT!,
  yellowstoneToken: process.env.YELLOWSTONE_GRPC_TOKEN!,

  // Jito
  jitoBlockEngine: process.env.JITO_BLOCK_ENGINE_URL || 'https://mainnet.block-engine.jito.wtf',
  jitoBundleEndpoint: process.env.JITO_BUNDLE_ENDPOINT || 'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
  jitoTipStream: process.env.JITO_TIP_STREAM_URL || 'ws://bundles-api-mainnet.block-engine.jito.wtf/api/v1/bundles/tip_stream',

  // Jito tip accounts (official mainnet addresses)
  jitoTipAccounts: [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt13ieukZX',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  ],

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY!,
  openaiModel: 'gpt-4o',

  // Redis
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL!,
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN!,

  // CoinGecko
  coingeckoApiKey: process.env.COINGECKO_API_KEY!,

  // Wallet
  payerPrivateKey: process.env.PAYER_PRIVATE_KEY!,

  // Tuning
  maxTipSol: parseFloat(process.env.MAX_TIP_SOL || '0.01'),
  minTipSol: parseFloat(process.env.MIN_TIP_SOL || '0.0005'),
  bundleRetryAttempts: parseInt(process.env.BUNDLE_RETRY_ATTEMPTS || '3'),
  bundleRetryDelayMs: parseInt(process.env.BUNDLE_RETRY_DELAY_MS || '2000'),
  slotHistoryWindow: parseInt(process.env.SLOT_HISTORY_WINDOW || '150'),
  tipHistoryWindow: parseInt(process.env.TIP_HISTORY_WINDOW || '20'),
};

export default config;
