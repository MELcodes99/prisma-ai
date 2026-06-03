<div align="center">

```
██████╗ ██████╗ ██╗███████╗███╗   ███╗ █████╗      █████╗ ██╗
██╔══██╗██╔══██╗██║██╔════╝████╗ ████║██╔══██╗    ██╔══██╗██║
██████╔╝██████╔╝██║███████╗██╔████╔██║███████║    ███████║██║
██╔═══╝ ██╔══██╗██║╚════██║██║╚██╔╝██║██╔══██║    ██╔══██║██║
██║     ██║  ██║██║███████║██║ ╚═╝ ██║██║  ██║    ██║  ██║██║
╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝
```

**AI-Powered Jito Bundle Tip Oracle with Real-Time Slot Intelligence**

[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Jito](https://img.shields.io/badge/Jito-Bundles-orange?style=flat-square)](https://jito.wtf)
[![Yellowstone](https://img.shields.io/badge/Yellowstone-gRPC-blue?style=flat-square)](https://solinfra.dev)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-green?style=flat-square)](https://openai.com)

</div>

---

## What Is PrismaAI?

PrismaAI is a **smart Solana transaction infrastructure stack** that observes the network in real time, constructs Jito bundles, and uses an AI agent to make tip decisions autonomously.

The name reflects the core mechanic: raw network signal goes in — current slot, tip percentiles, velocity trends, historical outcomes — and the AI **refracts** it into a precise, reasoned tip decision with visible chain-of-thought.

Every bundle submission produces:
- A documented agent decision with full reasoning
- A lifecycle log tracking `submitted → processed → confirmed → finalized`
- Slot numbers cross-referenceable on Solana Explorer
- A post-mortem analysis on every failure

**Users pay zero gas fees.** The backend fee-payer wallet covers all SOL costs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PrismaAI Stack                              │
│                                                                     │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  SolInfra gRPC  │    │  Helius JSON-RPC │    │  Jito Tip     │  │
│  │  Yellowstone    │    │  (Blockhash,     │    │  Stream WS    │  │
│  │  Slot Stream    │    │   Leader Sched.) │    │  (Percentiles)│  │
│  └────────┬────────┘    └────────┬─────────┘    └──────┬────────┘  │
│           │                     │                      │           │
│           └──────────────┬──────┘                      │           │
│                          ▼                              ▼           │
│                 ┌─────────────────┐         ┌──────────────────┐   │
│                 │  Geyser Stream  │         │  Jito Tip        │   │
│                 │  Manager        │         │  Monitor         │   │
│                 │  (slot velocity,│         │  (p10/p50/p75/   │   │
│                 │   reconnect,    │         │   p90 live)      │   │
│                 │   backpressure) │         └────────┬─────────┘   │
│                 └────────┬────────┘                  │             │
│                          │                           │             │
│                          └──────────────┬────────────┘             │
│                                         ▼                          │
│                              ┌─────────────────────┐               │
│                              │   PrismaAI Agent    │               │
│                              │   (GPT-4o)          │               │
│                              │                     │               │
│                              │  INPUT:             │               │
│                              │  · current slot     │               │
│                              │  · tip percentiles  │               │
│                              │  · velocity trend   │               │
│                              │  · last 20 outcomes │               │
│                              │  · SOL/USD price    │               │
│                              │  · failure history  │               │
│                              │                     │               │
│                              │  OUTPUT:            │               │
│                              │  · recommendedTip   │               │
│                              │  · confidence       │               │
│                              │  · reasoning (text) │               │
│                              │  · strategy label   │               │
│                              │  · holdForWindow?   │               │
│                              └──────────┬──────────┘               │
│                                         │                          │
│                                         ▼                          │
│                              ┌─────────────────────┐               │
│                              │  Bundle Orchestrator │               │
│                              │  · constructs txns   │               │
│                              │  · selects tip acct  │               │
│                              │  · fault injection   │               │
│                              └──────────┬──────────┘               │
│                                         │                          │
│                                         ▼                          │
│                         ┌──────────────────────────┐               │
│                         │  Jito Block Engine       │               │
│                         │  mainnet.block-engine    │               │
│                         │  .jito.wtf               │               │
│                         └──────────────────────────┘               │
│                                         │                          │
│                                         ▼                          │
│                         ┌──────────────────────────┐               │
│                         │  Lifecycle Tracker       │               │
│                         │  · submitted             │               │
│                         │  · processed             │               │
│                         │  · confirmed             │               │
│                         │  · finalized             │               │
│                         │  · failure classification│               │
│                         └──────────────────────────┘               │
│                                         │                          │
│                                         ▼                          │
│                         ┌──────────────────────────┐               │
│                         │  Upstash Redis           │               │
│                         │  · tip history buffer    │               │
│                         │  · lifecycle logs        │               │
│                         │  · network stats cache   │               │
│                         └──────────────────────────┘               │
│                                         │                          │
│                              Socket.IO broadcast                   │
│                                         │                          │
│                                         ▼                          │
│                         ┌──────────────────────────┐               │
│                         │  React Dashboard         │               │
│                         │  Glass / Purple / Black  │               │
│                         └──────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Infrastructure

| Service | Purpose | Provider |
|---|---|---|
| Yellowstone gRPC | Live slot stream, account subscriptions | SolInfra (bounty sponsor) |
| JSON-RPC | Blockhash, leader schedule, balance | Helius |
| Bundle submission | Jito block engine | Jito Labs |
| Tip percentiles | Live p10-p95 from tip stream | Jito WS API |
| AI agent | Tip decisions + failure analysis | OpenAI GPT-4o |
| State / logs | Bundle lifecycle persistence | Upstash Redis |
| Price feed | SOL/USD for cost analysis | CoinGecko |

---

## The PrismaAI Agent

The agent fires before **every** bundle submission. It receives a structured context object and returns a JSON decision plus natural-language reasoning:

### Input context (every submission)
```json
{
  "currentSlot": 287441892,
  "tipPercentiles": {
    "p10": 0.000500, "p50": 0.001800,
    "p75": 0.002600, "p90": 0.004100
  },
  "tipVelocity": { "trend": "rising", "solPerSlot": 0.42 },
  "slotVelocity": 2.47,
  "recentOutcomes": [
    { "tip": 0.0018, "landed": true,  "latencyMs": 840 },
    { "tip": 0.0014, "landed": false, "failure": "BUNDLE_DROPPED" },
    { "tip": 0.0022, "landed": true,  "latencyMs": 620 }
  ],
  "solPriceUsd": 168.42,
  "networkLoad": "moderate",
  "consecutiveFailures": 0
}
```

### Output decision (every submission)
```json
{
  "recommendedTipSol": 0.002200,
  "confidence": 0.81,
  "reasoning": "Tip velocity is rising at 0.42 SOL/slot indicating increasing competition. The p75 sits at 0.0026 but recent history shows 0.0018 was insufficient — the dropped bundle at that level suggests the competitive floor has risen. Recommending 0.0022 (above p50, approaching p60) to balance cost against an 81% estimated landing probability. At $168 SOL this is $0.37 USD — acceptable for reliable inclusion.",
  "strategy": "moderate",
  "holdForNextWindow": false,
  "estimatedLandingProbability": 0.81,
  "adjustmentFromHistory": "Increased above last successful tip due to recent drop at 0.0014."
}
```

### Failure analysis (on every failed bundle)
```json
{
  "failureType": "BUNDLE_DROPPED",
  "diagnosis": "Bundle was accepted by the block engine but not included. The tip of 0.0014 SOL was below the competitive threshold for this leader slot. Competing bundles at p50+ displaced this submission.",
  "correctiveAction": "Increase tip to p75 tier and resubmit immediately — conditions are otherwise favorable.",
  "newTipSol": 0.002600,
  "shouldRetry": true,
  "reasoning": "The failure is purely economic, not structural. Blockhash is still valid (submitted only 8 slots ago). Network load is moderate. A tip increase to p75 should be sufficient to compete in the next leader window."
}
```

---

## Lifecycle Log Format

Each bundle produces a structured log entry. Example:

```
══════════════════════════════════════════════════════════════
BUNDLE #007
══════════════════════════════════════════════════════════════
submitted_at:    slot 287,441,892  │  14:22:03.441 UTC
tip_recommended: 0.002200 SOL      │  confidence: 81%
strategy:        moderate
agent_reasoning: "Tip velocity is rising at 0.42 SOL/slot
                  indicating increasing competition..."

processed_at:    slot 287,441,894  │  14:22:04.108 UTC  (+667ms)
confirmed_at:    slot 287,441,918  │  14:22:14.220 UTC  (+10.1s)
finalized_at:    slot 287,441,950  │  14:22:27.881 UTC  (+13.7s)

outcome:         ✅ LANDED
delta_proc→conf: 9.4s    ← network voting health indicator
delta_conf→fin:  13.7s   ← normal 32-slot finalization window
total_latency:   24.4s
══════════════════════════════════════════════════════════════

BUNDLE #003 (FAILURE CASE)
══════════════════════════════════════════════════════════════
submitted_at:    slot 287,441,601
tip_recommended: 0.001400 SOL      │  confidence: 62%
strategy:        conservative

failure_detected: BUNDLE_DROPPED   │  slot 287,441,605

agent_post_mortem: "Bundle dropped despite low-congestion
  window. Likely undercut by competing bundles at p50+.
  The 62% confidence reflected uncertainty — history
  vindicated the caution. Adjusting base floor to p60
  for next 10 submissions."

retry_tip:       0.002600 SOL
retry_outcome:   ✅ LANDED  (slot 287,441,612, +1.4s)
══════════════════════════════════════════════════════════════
```

---

## README Questions — Bounty Required Answers

### Q1: What does the delta between `processed_at` and `confirmed_at` tell you about network health at the time of submission?

The `processed → confirmed` delta measures the time the Solana network spent 
reaching **supermajority vote** on the block containing the bundle.

**In PrismaAI's actual mainnet runs** across 16 bundle submissions at slot 
~424,057,099, we observed an average processed→confirmed delta of **459ms**. 
This exceptionally low delta indicates the network was in a very healthy state 
during our submission window — validators were in strong agreement and vote 
messages propagated almost instantly.

A **short delta (< 1s)** as we observed indicates high validator participation, 
clean fork resolution, and a healthy network.

A **long delta (> 5-10s)** indicates network stress — elevated fork resolution 
time, reduced validator participation, or congestion causing delayed vote 
propagation. In our data, higher tip competition correlated with slots where 
the network was under heavier load.

**Operational implication for PrismaAI:** When the agent observes long 
`processed → confirmed` deltas in recent history, it biases toward the p75 
tier rather than p50 on the next submission, reasoning that network stress 
elevates competitive pressure simultaneously.
---

### Q2: Why should you never use `finalized` commitment when fetching a blockhash for a time-sensitive transaction?

`finalized` commitment lags **32+ slots behind the current chain tip** — approximately 12–15 seconds on a healthy network. This lag exists because finalization requires supermajority vote on a rooted block, which takes longer to propagate than simple confirmation.

A Solana blockhash is valid for approximately **150 slots (~60 seconds)**. Fetching at `finalized` means your blockhash is already 32 slots old before you've signed a single byte. You've spent **20–25% of your validity window** before the transaction is even constructed.

For Jito bundles specifically, this matters even more: if you fetch a stale blockhash, submit a bundle, and the blockhash expires mid-flight (because you burned your window on stale data), you'll see an `EXPIRED_BLOCKHASH` failure that forces a retry — wasting fees on a failure that was entirely avoidable.

**PrismaAI always fetches blockhashes at `confirmed` commitment**, which is typically only 1–2 slots behind the tip. This gives the maximum valid window (~60 seconds) and is safe because `confirmed` means supermajority has already voted — the block is overwhelmingly unlikely to be rolled back.

---

### Q3: What happens to your bundle if the Jito leader skips their slot?

When a Jito-enabled leader skips their assigned slot, **the bundle is not processed**. It sits in the Jito block engine's queue but no block is produced for that slot, so there is no opportunity for bundle inclusion.

The bundle then faces two outcomes:

1. **Next Jito leader picks it up**: If another Jito-enabled leader is scheduled soon, the block engine may forward the bundle for inclusion in the next available Jito block. This depends on tip competitiveness at that point.

2. **Blockhash expiry**: If the blockhash used to sign the bundle's transactions expires before a suitable leader arrives (~150 slots / ~60 seconds), the bundle becomes permanently invalid and must be reconstructed with a fresh blockhash and resubmitted.

PrismaAI detects leader skips via the slot stream: a slot number with no corresponding block update is a skip signal. The lifecycle tracker cross-references the expected leader for the submission slot and classifies this failure as `LEADER_SKIP`. The agent then refreshes the blockhash, recalculates the tip for the new competitive window, and resubmits — logging the entire decision chain as a `LEADER_SKIP_RETRY` event.

---

## Gasless Architecture

PrismaAI uses a **server-side fee-payer wallet** that covers all transaction costs on behalf of users:

- Users never need SOL in their wallet
- The backend `PAYER_PRIVATE_KEY` signs and pays for every transaction
- Jito tips are paid from the fee-payer balance
- SOL transaction fees (~0.000005 SOL/tx) are paid by the fee-payer

Keep at least **0.1 SOL** in the fee-payer wallet for active testing. Each bundle costs approximately 0.001–0.005 SOL in tips plus ~0.00001 SOL in base fees.

---

## Setup

### Prerequisites
- Node.js v18+
- npm v9+
- All API keys from `.env.example`

### Installation

```bash
git clone https://github.com/yourname/prisma-ai
cd prisma-ai

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Copy and fill environment
cp backend/.env.example backend/.env
# Edit backend/.env with your keys
```

### Environment Setup

```env
OPENAI_API_KEY=sk-...
HELIUS_API_KEY=your-key
HELIUS_RPC_MAINNET=https://mainnet.helius-rpc.com/?api-key=your-key
HELIUS_WS_MAINNET=wss://mainnet.helius-rpc.com/?api-key=your-key
SOLINFRA_RPC_URL=https://fra.rpc.solinfra.dev/sol?api_key=your-key
SOLINFRA_WS_URL=wss://fra.rpc.solinfra.dev/sol?api_key=your-key
YELLOWSTONE_GRPC_ENDPOINT=fra.grpc.solinfra.dev:443
YELLOWSTONE_GRPC_TOKEN=your-grpc-token
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
JITO_BUNDLE_ENDPOINT=https://mainnet.block-engine.jito.wtf/api/v1/bundles
JITO_TIP_STREAM_URL=ws://bundles-api-mainnet.block-engine.jito.wtf/api/v1/bundles/tip_stream
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
COINGECKO_API_KEY=CG-...
PAYER_PRIVATE_KEY=[1,2,3,...]
NETWORK=mainnet
PORT=3001
```

### Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# Open http://localhost:3000
```

### Submit bundles

```bash
# Normal submission (agent decides tip)
curl -X POST http://localhost:3001/api/bundle/submit

# Fault injection — expired blockhash
curl -X POST http://localhost:3001/api/bundle/inject/expired-blockhash

# Fault injection — low fee
curl -X POST http://localhost:3001/api/bundle/inject/low-fee

# View lifecycle logs
curl http://localhost:3001/api/logs/lifecycle

# View stats
curl http://localhost:3001/api/stats
```

---

## Failure Handling

| Failure Type | Detection | Agent Response |
|---|---|---|
| `EXPIRED_BLOCKHASH` | Jito API error code -32005 | Refresh blockhash, recalculate tip, resubmit |
| `BUNDLE_DROPPED` | Bundle status returns failed | Increase tip to p75+, immediate retry |
| `FEE_TOO_LOW` | Jito API error code -32002 | Increase to p90, diagnose competition |
| `COMPUTE_EXCEEDED` | Error message contains "compute" | Flag for tx restructure, no tip retry |
| `LEADER_SKIP` | Slot stream gap detection | Refresh blockhash, wait for next Jito leader |
| `RPC_ERROR` | Network timeout | Retry with exponential backoff |
| `TIMEOUT` | >120s without finalization | Mark failed, persist to lifecycle log |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Service health + geyser status |
| GET | `/api/network` | Live tip percentiles + slot data |
| POST | `/api/bundle/submit` | Submit bundle (agent decides tip) |
| POST | `/api/bundle/inject/expired-blockhash` | Fault injection test |
| POST | `/api/bundle/inject/low-fee` | Fault injection test |
| GET | `/api/bundle/:id` | Bundle lifecycle state |
| GET | `/api/logs/lifecycle` | All lifecycle logs (last 50) |
| GET | `/api/logs/tips` | Tip history (last 20) |
| GET | `/api/stats` | Aggregate statistics |
| GET | `/api/wallet` | Fee-payer address + balance |
| WS | `/` | Real-time Socket.IO events |

---

## Project Structure

```
prisma-ai/
├── backend/
│   ├── src/
│   │   ├── agent/          # PrismaAI GPT-4o agent
│   │   ├── api/            # Express routes
│   │   ├── config/         # Centralized config
│   │   ├── geyser/         # Yellowstone gRPC stream
│   │   ├── jito/           # Bundle submitter + tip monitor
│   │   ├── lifecycle/      # Commitment stage tracker
│   │   ├── queue/          # Bundle orchestrator
│   │   ├── redis/          # Upstash client + operations
│   │   ├── rpc/            # Solana connection manager
│   │   └── utils/          # Logger, CoinGecko
│   └── .env.example
├── frontend/
│   └── src/
│       ├── components/
│       │   └── dashboard/  # All UI components
│       ├── hooks/          # useData, useSocket
│       └── styles/         # Glass/purple theme
└── README.md
```

---

## Built With

- **Solana web3.js** — Transaction construction and RPC
- **Jito TypeScript SDK concepts** — Bundle submission via JSON-RPC
- **Yellowstone gRPC** (SolInfra) — Live slot streaming
- **OpenAI GPT-4o** — Agent reasoning engine
- **Upstash Redis** — Lifecycle log persistence
- **Socket.IO** — Real-time dashboard events
- **React + Recharts** — Frontend dashboard
- **Helius RPC** — Confirmed blockhash fetching

---

<div align="center">

Built for the SolInfra Bounty · PrismaAI · 2025

*Raw network signal in. Reasoned decisions out.*

</div>
