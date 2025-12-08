import { NextResponse } from "next/server"

interface QuantInsight {
  symbol: string
  technicalScore: number
  sentimentScore: number
  fusedScore: number
  action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL"
  confidence: number
  reasoning: string
  technicalFactors: string[]
  sentimentFactors: string[]
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  timestamp: string
}

interface TechnicalIndicators {
  rsi: number
  macd: number
  macdSignal: number
  momentum: number
  adx: number
  sma20: number
  sma50: number
  bollingerUpper: number
  bollingerLower: number
}

// Simulate technical indicator calculation
function calculateTechnicalScore(indicators: TechnicalIndicators): number {
  let score = 50 // Base score

  // RSI contribution (0-30 = oversold/bullish, 70-100 = overbought/bearish)
  if (indicators.rsi < 30) score += 15
  else if (indicators.rsi > 70) score -= 15
  else if (indicators.rsi > 50) score += 5

  // MACD contribution
  if (indicators.macd > indicators.macdSignal) score += 10
  else score -= 10

  // Momentum contribution
  if (indicators.momentum > 0) score += indicators.momentum / 2
  else score += indicators.momentum / 2

  // ADX trend strength
  if (indicators.adx > 25) score += 5
  if (indicators.adx > 40) score += 5

  return Math.max(0, Math.min(100, score))
}

function determineAction(fusedScore: number): "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL" {
  if (fusedScore >= 80) return "STRONG_BUY"
  if (fusedScore >= 65) return "BUY"
  if (fusedScore >= 45) return "HOLD"
  if (fusedScore >= 30) return "SELL"
  return "STRONG_SELL"
}

function fusScores(technical: number, sentiment: number, techWeight = 0.6): number {
  return Math.round(technical * techWeight + sentiment * (1 - techWeight))
}

// Predefined insights data
const insightsData: Record<string, Omit<QuantInsight, "timestamp">> = {
  BTC: {
    symbol: "BTC",
    technicalScore: 78,
    sentimentScore: 85,
    fusedScore: 81,
    action: "STRONG_BUY",
    confidence: 88,
    reasoning: "Momentum indicators bullish + ETF inflow news driving positive sentiment",
    technicalFactors: ["RSI above 60", "MACD bullish crossover", "ADX strong trend", "Above 50-day MA"],
    sentimentFactors: ["ETF approval news", "Institutional buying", "Positive earnings outlook"],
    riskLevel: "LOW",
  },
  NVDA: {
    symbol: "NVDA",
    technicalScore: 72,
    sentimentScore: 92,
    fusedScore: 80,
    action: "BUY",
    confidence: 84,
    reasoning: "Strong AI sector momentum + New chip announcement boosting sentiment",
    technicalFactors: ["Above 50 MA", "Volume breakout", "Support holding", "RSI healthy"],
    sentimentFactors: ["New AI chip launch", "Analyst upgrades", "AI demand growth"],
    riskLevel: "LOW",
  },
  SOL: {
    symbol: "SOL",
    technicalScore: 35,
    sentimentScore: 28,
    fusedScore: 32,
    action: "SELL",
    confidence: 72,
    reasoning: "Network outage concerns + Technical breakdown below support",
    technicalFactors: ["Below 20 MA", "RSI oversold", "Volume declining", "Support broken"],
    sentimentFactors: ["Network outage news", "Developer concerns", "Competition pressure"],
    riskLevel: "HIGH",
  },
  ETH: {
    symbol: "ETH",
    technicalScore: 55,
    sentimentScore: 60,
    fusedScore: 57,
    action: "HOLD",
    confidence: 58,
    reasoning: "Consolidation phase - waiting for breakout confirmation",
    technicalFactors: ["Range-bound", "Neutral RSI", "Low volatility", "Testing resistance"],
    sentimentFactors: ["Mixed staking sentiment", "L2 adoption positive", "Gas fees stable"],
    riskLevel: "MEDIUM",
  },
  AAPL: {
    symbol: "AAPL",
    technicalScore: 62,
    sentimentScore: 48,
    fusedScore: 56,
    action: "HOLD",
    confidence: 55,
    reasoning: "Stable technicals but mixed sentiment on iPhone demand",
    technicalFactors: ["Holding support", "RSI neutral", "Volume average", "Near 50 MA"],
    sentimentFactors: ["Supply chain concerns", "Services growth", "AI integration expected"],
    riskLevel: "MEDIUM",
  },
  MSFT: {
    symbol: "MSFT",
    technicalScore: 68,
    sentimentScore: 75,
    fusedScore: 71,
    action: "BUY",
    confidence: 76,
    reasoning: "Azure growth strong + AI integration driving positive outlook",
    technicalFactors: ["Uptrend intact", "RSI bullish", "Volume increasing", "New highs"],
    sentimentFactors: ["Azure growth", "Copilot adoption", "Enterprise AI leader"],
    riskLevel: "LOW",
  },
  TSLA: {
    symbol: "TSLA",
    technicalScore: 58,
    sentimentScore: 65,
    fusedScore: 61,
    action: "HOLD",
    confidence: 62,
    reasoning: "Cybertruck momentum but margin concerns persist",
    technicalFactors: ["Volatile range", "RSI recovering", "Support tested", "Volume mixed"],
    sentimentFactors: ["Cybertruck demand", "Price cuts concern", "FSD progress"],
    riskLevel: "MEDIUM",
  },
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get("symbols") || "BTC,NVDA,ETH,SOL,AAPL"
  const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase())

  const insights: QuantInsight[] = symbolList.map((symbol) => {
    const baseSymbol = symbol.replace("/USD", "")
    const data = insightsData[baseSymbol] || {
      symbol: baseSymbol,
      technicalScore: 50,
      sentimentScore: 50,
      fusedScore: 50,
      action: "HOLD" as const,
      confidence: 50,
      reasoning: "Insufficient data for analysis",
      technicalFactors: ["Limited data available"],
      sentimentFactors: ["Limited data available"],
      riskLevel: "MEDIUM" as const,
    }

    // Add some variance to make it feel live
    const techVariance = Math.floor(Math.random() * 6) - 3
    const sentVariance = Math.floor(Math.random() * 6) - 3
    const adjustedTech = Math.max(0, Math.min(100, data.technicalScore + techVariance))
    const adjustedSent = Math.max(0, Math.min(100, data.sentimentScore + sentVariance))
    const adjustedFused = fusScores(adjustedTech, adjustedSent)

    return {
      ...data,
      symbol: baseSymbol,
      technicalScore: adjustedTech,
      sentimentScore: adjustedSent,
      fusedScore: adjustedFused,
      action: determineAction(adjustedFused),
      timestamp: new Date().toISOString(),
    }
  })

  return NextResponse.json({
    insights,
    source: "quant-engine",
    timestamp: new Date().toISOString(),
  })
}
