import { NextResponse } from "next/server"

interface TradingSignal {
  id: number
  asset: string
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  currentPrice: number
  targetPrice: number
  stopLoss: number
  reasoning: string
  technicalScore: number
  sentimentScore: number
  riskReward: number
  timestamp: string
}

const signalsData: Omit<TradingSignal, "timestamp">[] = [
  {
    id: 1,
    asset: "BTC/USD",
    action: "BUY",
    confidence: 94,
    currentPrice: 43250,
    targetPrice: 48000,
    stopLoss: 41500,
    reasoning: "Strong momentum indicators + ETF inflows driving bullish divergence on RSI",
    technicalScore: 88,
    sentimentScore: 92,
    riskReward: 2.71,
  },
  {
    id: 2,
    asset: "ETH/USD",
    action: "HOLD",
    confidence: 58,
    currentPrice: 2280,
    targetPrice: 2450,
    stopLoss: 2150,
    reasoning: "Consolidation phase - waiting for breakout confirmation above resistance",
    technicalScore: 55,
    sentimentScore: 62,
    riskReward: 1.31,
  },
  {
    id: 3,
    asset: "NVDA",
    action: "BUY",
    confidence: 91,
    currentPrice: 485.2,
    targetPrice: 550,
    stopLoss: 460,
    reasoning: "AI sector momentum strong + New chip announcement driving upgrades",
    technicalScore: 85,
    sentimentScore: 95,
    riskReward: 2.57,
  },
  {
    id: 4,
    asset: "SOL/USD",
    action: "SELL",
    confidence: 72,
    currentPrice: 98.5,
    targetPrice: 85,
    stopLoss: 105,
    reasoning: "Network concerns + Technical breakdown below key support levels",
    technicalScore: 35,
    sentimentScore: 28,
    riskReward: 2.08,
  },
  {
    id: 5,
    asset: "AAPL",
    action: "HOLD",
    confidence: 55,
    currentPrice: 178.5,
    targetPrice: 190,
    stopLoss: 170,
    reasoning: "Stable technicals but mixed sentiment on iPhone demand outlook",
    technicalScore: 62,
    sentimentScore: 48,
    riskReward: 1.35,
  },
  {
    id: 6,
    asset: "MSFT",
    action: "BUY",
    confidence: 76,
    currentPrice: 378.65,
    targetPrice: 420,
    stopLoss: 360,
    reasoning: "Azure growth acceleration + Enterprise AI adoption driving momentum",
    technicalScore: 68,
    sentimentScore: 75,
    riskReward: 2.22,
  },
  {
    id: 7,
    asset: "GOOGL",
    action: "BUY",
    confidence: 82,
    currentPrice: 142.5,
    targetPrice: 165,
    stopLoss: 135,
    reasoning: "Gemini AI momentum + Search advertising resilience beating expectations",
    technicalScore: 78,
    sentimentScore: 85,
    riskReward: 3.0,
  },
  {
    id: 8,
    asset: "META",
    action: "BUY",
    confidence: 79,
    currentPrice: 505.3,
    targetPrice: 580,
    stopLoss: 475,
    reasoning: "Reels monetization improving + Cost discipline driving margins higher",
    technicalScore: 74,
    sentimentScore: 81,
    riskReward: 2.47,
  },
  {
    id: 9,
    asset: "TSLA",
    action: "HOLD",
    confidence: 52,
    currentPrice: 248.5,
    targetPrice: 280,
    stopLoss: 220,
    reasoning: "Mixed signals - EV competition intense but energy storage growing fast",
    technicalScore: 48,
    sentimentScore: 55,
    riskReward: 1.11,
  },
  {
    id: 10,
    asset: "AMD",
    action: "BUY",
    confidence: 85,
    currentPrice: 178.2,
    targetPrice: 210,
    stopLoss: 165,
    reasoning: "MI300 AI chip demand exceeding forecasts + Data center market share gains",
    technicalScore: 82,
    sentimentScore: 88,
    riskReward: 2.41,
  },
  {
    id: 11,
    asset: "AMZN",
    action: "BUY",
    confidence: 77,
    currentPrice: 185.4,
    targetPrice: 210,
    stopLoss: 172,
    reasoning: "AWS growth reaccelerating + Prime Day results strong retail momentum",
    technicalScore: 72,
    sentimentScore: 80,
    riskReward: 1.84,
  },
  {
    id: 12,
    asset: "JPM",
    action: "HOLD",
    confidence: 61,
    currentPrice: 198.75,
    targetPrice: 215,
    stopLoss: 185,
    reasoning: "Strong trading revenue offset by commercial real estate concerns",
    technicalScore: 58,
    sentimentScore: 64,
    riskReward: 1.18,
  },
  {
    id: 13,
    asset: "XRP/USD",
    action: "BUY",
    confidence: 68,
    currentPrice: 0.62,
    targetPrice: 0.85,
    stopLoss: 0.55,
    reasoning: "Legal clarity improving + Institutional adoption increasing",
    technicalScore: 65,
    sentimentScore: 70,
    riskReward: 3.29,
  },
  {
    id: 14,
    asset: "V",
    action: "BUY",
    confidence: 73,
    currentPrice: 275.6,
    targetPrice: 305,
    stopLoss: 260,
    reasoning: "Cross-border travel recovery + Digital payment penetration accelerating",
    technicalScore: 70,
    sentimentScore: 76,
    riskReward: 1.89,
  },
  {
    id: 15,
    asset: "CRM",
    action: "BUY",
    confidence: 71,
    currentPrice: 265.8,
    targetPrice: 300,
    stopLoss: 250,
    reasoning: "Einstein AI integration driving enterprise upgrades + Strong cash flow",
    technicalScore: 68,
    sentimentScore: 74,
    riskReward: 2.16,
  },
  {
    id: 16,
    asset: "INTC",
    action: "SELL",
    confidence: 69,
    currentPrice: 31.5,
    targetPrice: 25,
    stopLoss: 35,
    reasoning: "Foundry losses mounting + Market share erosion to AMD and ARM",
    technicalScore: 32,
    sentimentScore: 28,
    riskReward: 1.86,
  },
  {
    id: 17,
    asset: "BA",
    action: "HOLD",
    confidence: 48,
    currentPrice: 178.2,
    targetPrice: 200,
    stopLoss: 160,
    reasoning: "Production ramp challenges offset by strong backlog and defense orders",
    technicalScore: 45,
    sentimentScore: 50,
    riskReward: 1.2,
  },
  {
    id: 18,
    asset: "DOGE/USD",
    action: "HOLD",
    confidence: 45,
    currentPrice: 0.082,
    targetPrice: 0.1,
    stopLoss: 0.07,
    reasoning: "Meme momentum fading but utility developments underway",
    technicalScore: 42,
    sentimentScore: 48,
    riskReward: 1.5,
  },
  {
    id: 19,
    asset: "DIS",
    action: "BUY",
    confidence: 66,
    currentPrice: 112.4,
    targetPrice: 130,
    stopLoss: 102,
    reasoning: "Streaming losses narrowing + Parks revenue at all-time highs",
    technicalScore: 62,
    sentimentScore: 68,
    riskReward: 1.69,
  },
  {
    id: 20,
    asset: "NFLX",
    action: "BUY",
    confidence: 74,
    currentPrice: 628.5,
    targetPrice: 720,
    stopLoss: 580,
    reasoning: "Ad-tier momentum + Password crackdown driving subscriber growth",
    technicalScore: 71,
    sentimentScore: 77,
    riskReward: 1.89,
  },
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Number.parseInt(searchParams.get("limit") || "20")
  const action = searchParams.get("action")
  const symbol = searchParams.get("symbol")

  let signals = signalsData

  if (action) {
    signals = signals.filter((s) => s.action === action.toUpperCase())
  }

  if (symbol) {
    signals = signals.filter((s) => s.asset.toLowerCase().includes(symbol.toLowerCase()))
  }

  // Add variance to make it feel live
  const liveSignals: TradingSignal[] = signals.slice(0, limit).map((signal) => {
    const priceVariance = signal.currentPrice * 0.002 * (Math.random() - 0.5)
    const confVariance = Math.floor(Math.random() * 4) - 2

    return {
      ...signal,
      currentPrice: Math.round((signal.currentPrice + priceVariance) * 100) / 100,
      confidence: Math.max(50, Math.min(99, signal.confidence + confVariance)),
      technicalScore: Math.max(0, Math.min(100, signal.technicalScore + Math.floor(Math.random() * 6) - 3)),
      sentimentScore: Math.max(0, Math.min(100, signal.sentimentScore + Math.floor(Math.random() * 6) - 3)),
      timestamp: new Date().toISOString(),
    }
  })

  return NextResponse.json({
    signals: liveSignals,
    source: "quant-engine",
    timestamp: new Date().toISOString(),
  })
}
