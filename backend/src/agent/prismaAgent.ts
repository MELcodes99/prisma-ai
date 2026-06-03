import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';
import { TipPercentiles, TipVelocity } from '../jito/tipMonitor';
import { getTipHistory, TipHistoryEntry } from '../redis/client';
import { geyserStream } from '../geyser/stream';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

export interface AgentDecision {
  recommendedTipSol: number;
  confidence: number; // 0-1
  reasoning: string;
  strategy: 'conservative' | 'moderate' | 'aggressive' | 'ultra-aggressive';
  holdForNextWindow: boolean;
  estimatedLandingProbability: number;
  adjustmentFromHistory: string;
  postMortem?: string;
}

export interface AgentContext {
  currentSlot: number;
  tipPercentiles: TipPercentiles;
  tipVelocity: TipVelocity;
  slotVelocity: number;
  recentOutcomes: TipHistoryEntry[];
  solPriceUsd: number;
  networkLoad: 'low' | 'moderate' | 'high' | 'extreme';
  consecutiveFailures: number;
  lastFailureType?: string;
}

export interface FailureAnalysis {
  failureType: string;
  diagnosis: string;
  correctiveAction: string;
  newTipSol: number;
  shouldRetry: boolean;
  reasoning: string;
}

class PrismaAIAgent {
  private consecutiveFailures = 0;
  private lastFailureType: string | undefined;

  async makeSubmissionDecision(
    tipPercentiles: TipPercentiles,
    tipVelocity: TipVelocity,
    solPrice: number,
    currentSlot: number
  ): Promise<AgentDecision> {
    const recentOutcomes = await getTipHistory();
    const networkLoad = this.assessNetworkLoad(tipVelocity, tipPercentiles);

    const context: AgentContext = {
      currentSlot,
      tipPercentiles,
      tipVelocity,
      slotVelocity: geyserStream.getSlotVelocity(),
      recentOutcomes,
      solPriceUsd: solPrice,
      networkLoad,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureType: this.lastFailureType,
    };

    return this.callAgent(context);
  }

  async analyzeFailureAndDecideRetry(
    failureType: string,
    failedTipSol: number,
    bundleId: string,
    tipPercentiles: TipPercentiles,
    currentSlot: number
  ): Promise<FailureAnalysis> {
    this.consecutiveFailures++;
    this.lastFailureType = failureType;

    const prompt = `You are PrismaAI, an expert Solana transaction infrastructure agent.

A Jito bundle has FAILED. Analyze the failure and make a retry decision.

FAILURE DETAILS:
- Bundle ID: ${bundleId}
- Failure Type: ${failureType}
- Failed Tip Amount: ${failedTipSol} SOL
- Current Slot: ${currentSlot}
- Consecutive Failures: ${this.consecutiveFailures}

CURRENT NETWORK STATE:
- Tip p50: ${tipPercentiles.p50.toFixed(6)} SOL
- Tip p75: ${tipPercentiles.p75.toFixed(6)} SOL
- Tip p90: ${tipPercentiles.p90.toFixed(6)} SOL
- Data Source: ${tipPercentiles.source}

FAILURE TYPE CONTEXT:
${this.getFailureContext(failureType)}

Your job:
1. Diagnose WHY this failure occurred based on the failure type and context
2. Decide the corrective action (blockhash refresh needed? Higher tip? Wait?)
3. Calculate the optimal new tip amount if retrying
4. Determine if retry is advisable or if conditions are too unfavorable

Respond ONLY with valid JSON in this exact format:
{
  "failureType": "${failureType}",
  "diagnosis": "detailed diagnosis of why this specific failure occurred",
  "correctiveAction": "specific action to take before retry",
  "newTipSol": 0.00XXX,
  "shouldRetry": true,
  "reasoning": "full chain-of-thought reasoning for the retry decision, minimum 2-3 sentences"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: config.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(content);

      // Clamp tip to configured limits
      parsed.newTipSol = Math.max(
        config.minTipSol,
        Math.min(config.maxTipSol, parsed.newTipSol || tipPercentiles.p75)
      );

      logger.info(`🤖 Agent failure analysis`, {
        failureType,
        shouldRetry: parsed.shouldRetry,
        newTip: parsed.newTipSol,
        reasoning: parsed.reasoning?.substring(0, 100) + '...',
      });

      return parsed as FailureAnalysis;
    } catch (err) {
      logger.error('Agent failure analysis error', { err });
      // Safe fallback
      return {
        failureType,
        diagnosis: `${failureType} detected. Defaulting to safe retry parameters.`,
        correctiveAction:
          failureType === 'EXPIRED_BLOCKHASH'
            ? 'Refresh blockhash and resubmit'
            : 'Increase tip to p75',
        newTipSol: tipPercentiles.p75,
        shouldRetry: true,
        reasoning: 'Fallback retry logic engaged due to agent API error.',
      };
    }
  }

  private async callAgent(context: AgentContext): Promise<AgentDecision> {
    const recentSummary = context.recentOutcomes.slice(0, 5).map((o) => ({
      tip: o.tipSol.toFixed(6),
      landed: o.landed,
      failure: o.failureType || null,
      confidence: o.agentConfidence,
    }));

    const successRate =
      context.recentOutcomes.length > 0
        ? context.recentOutcomes.filter((o) => o.landed).length / context.recentOutcomes.length
        : null;

    const prompt = `You are PrismaAI, the world's most advanced Solana transaction tip oracle.

Your role: analyze real-time Solana network conditions and determine the optimal Jito bundle tip.

LIVE NETWORK STATE (as of slot ${context.currentSlot}):
- Slot velocity: ${context.slotVelocity.toFixed(2)} slots/sec (normal: ~2.5)
- Network load: ${context.networkLoad.toUpperCase()}
- Tip velocity trend: ${context.tipVelocity.trend}

LIVE TIP PERCENTILES (last 20 slots, source: ${context.tipPercentiles.source}):
- p10: ${context.tipPercentiles.p10.toFixed(6)} SOL
- p25: ${context.tipPercentiles.p25.toFixed(6)} SOL  
- p50: ${context.tipPercentiles.p50.toFixed(6)} SOL  ← median
- p75: ${context.tipPercentiles.p75.toFixed(6)} SOL
- p90: ${context.tipPercentiles.p90.toFixed(6)} SOL
- p95: ${context.tipPercentiles.p95.toFixed(6)} SOL

SOL PRICE: $${context.solPriceUsd.toFixed(2)} USD
TIP COST AT P75: $${(context.tipPercentiles.p75 * context.solPriceUsd).toFixed(4)} USD

RECENT BUNDLE OUTCOMES (last 5):
${JSON.stringify(recentSummary, null, 2)}

HISTORICAL SUCCESS RATE: ${successRate !== null ? (successRate * 100).toFixed(0) + '%' : 'no data yet'}
CONSECUTIVE FAILURES: ${context.consecutiveFailures}
${context.lastFailureType ? `LAST FAILURE TYPE: ${context.lastFailureType}` : ''}

CONFIG LIMITS: min=${config.minTipSol} SOL, max=${config.maxTipSol} SOL

STRATEGY GUIDE:
- conservative: tip p25-p40 → low cost, ~55% landing probability
- moderate: tip p50-p65 → balanced, ~72% landing probability  
- aggressive: tip p75-p85 → higher cost, ~88% landing probability
- ultra-aggressive: tip p90+ → max cost, ~96% landing probability

Based on ALL available data, make your tip decision. Consider:
1. Is network load rising or falling?
2. Does our history show under-tipping or over-tipping?
3. What is the cost in USD terms?
4. Should we hold submission for a better window?

Respond ONLY with valid JSON:
{
  "recommendedTipSol": 0.00XXX,
  "confidence": 0.XX,
  "reasoning": "detailed 2-4 sentence reasoning chain covering percentile positioning, network conditions, and history-informed adjustments",
  "strategy": "moderate",
  "holdForNextWindow": false,
  "estimatedLandingProbability": 0.XX,
  "adjustmentFromHistory": "one sentence on what history tells us to do differently"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: config.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(content);

      // Clamp to config limits
      parsed.recommendedTipSol = Math.max(
        config.minTipSol,
        Math.min(config.maxTipSol, parsed.recommendedTipSol || context.tipPercentiles.p50)
      );
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));
      parsed.estimatedLandingProbability = Math.max(
        0,
        Math.min(1, parsed.estimatedLandingProbability || 0.7)
      );

      logger.info('🤖 PrismaAI decision', {
        tip: parsed.recommendedTipSol,
        strategy: parsed.strategy,
        confidence: `${(parsed.confidence * 100).toFixed(0)}%`,
        reasoning: parsed.reasoning?.substring(0, 120) + '...',
      });

      return parsed as AgentDecision;
    } catch (err) {
      logger.error('Agent decision error, using safe fallback', { err });
      return this.safeDefault(context);
    }
  }

  private safeDefault(context: AgentContext): AgentDecision {
    const tip = context.tipPercentiles.p50;
    return {
      recommendedTipSol: tip,
      confidence: 0.6,
      reasoning: `Fallback decision: using p50 tip of ${tip.toFixed(6)} SOL due to agent API unavailability. Network load is ${context.networkLoad}.`,
      strategy: 'moderate',
      holdForNextWindow: false,
      estimatedLandingProbability: 0.65,
      adjustmentFromHistory: 'No history-based adjustment available in fallback mode.',
    };
  }

  private assessNetworkLoad(
    velocity: TipVelocity,
    percentiles: TipPercentiles
  ): 'low' | 'moderate' | 'high' | 'extreme' {
    const ratio = percentiles.p90 / Math.max(percentiles.p10, config.minTipSol);
    if (ratio > 10 || velocity.trend === 'rising') return 'high';
    if (ratio > 5) return 'moderate';
    if (velocity.trend === 'falling') return 'low';
    return 'moderate';
  }

  private getFailureContext(failureType: string): string {
    const contexts: Record<string, string> = {
      EXPIRED_BLOCKHASH:
        'The blockhash used in this bundle has expired (>150 slots old). Solana blockhashes are valid for ~80-90 seconds. A fresh blockhash must be fetched before retrying.',
      FEE_TOO_LOW:
        'The Jito tip was insufficient to compete with other bundles in this leader slot. The bundle was deprioritized or dropped from the block engine queue.',
      BUNDLE_DROPPED:
        'The bundle was accepted by the block engine but not included in a block. This can happen when the Jito leader skips their slot, or when competing bundles with higher tips displaced this one.',
      COMPUTE_EXCEEDED:
        'One or more transactions in the bundle exceeded their compute unit budget. This requires transaction restructuring, not just a tip increase.',
      LEADER_SKIP:
        'The scheduled Jito leader skipped their slot. The bundle needs to be resubmitted for the next Jito leader window.',
      RPC_ERROR:
        'Network or RPC connectivity issue. The bundle may or may not have been received by the block engine.',
      UNKNOWN: 'Unknown failure. Conservative retry approach recommended.',
    };
    return contexts[failureType] || contexts.UNKNOWN;
  }

  resetFailureCount(): void {
    this.consecutiveFailures = 0;
    this.lastFailureType = undefined;
  }
}

export const prismaAgent = new PrismaAIAgent();
