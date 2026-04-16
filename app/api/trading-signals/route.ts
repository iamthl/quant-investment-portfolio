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
  probabilityIncrease?: number
  featureImportances?: Record<string, number>
  modelType: string
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
    reasoning: "ML Model predicts 82% chance of increase driven by RSI divergence and ETF inflows.",
    technicalScore: 88,
    sentimentScore: 92,
    riskReward: 2.71,
    probabilityIncrease: 0.824,
    modelType: "gradient_boosting",
    featureImportances: { "rsi_14": 0.35, "momentum_20": 0.25, "vol_trend": 0.15 }
  },
  {
    id: 2,
    asset: "ETH/USD",
    action: "HOLD",
    confidence: 58,
    currentPrice: 2280,
    targetPrice: 2450,
    stopLoss: 2150,
    reasoning: "Consolidation phase - waiting for ML confirmation above resistance.",
    technicalScore: 55,
    sentimentScore: 62,
    riskReward: 1.31,
    probabilityIncrease: 0.521,
    modelType: "xgboost",
    featureImportances: { "sma_50_ratio": 0.42, "bb_pct": 0.18 }
  },
  {
    id: 3,
    asset: "NVDA",
    action: "BUY",
    confidence: 91,
    currentPrice: 485.2,
    targetPrice: 550,
    stopLoss: 460,
    reasoning: "High probability AI sector momentum confirmed by Gradient Boosting model.",
    technicalScore: 85,
    sentimentScore: 95,
    riskReward: 2.57,
    probabilityIncrease: 0.895,
    modelType: "gradient_boosting",
    featureImportances: { "ret_5d": 0.38, "vol_ratio_20": 0.22, "macd_hist": 0.12 }
  },
  {
    id: 4,
    asset: "SOL/USD",
    action: "SELL",
    confidence: 72,
    currentPrice: 98.5,
    targetPrice: 85,
    stopLoss: 105,
    reasoning: "ML features indicate strong downward momentum and technical breakdown.",
    technicalScore: 35,
    sentimentScore: 28,
    riskReward: 2.08,
    probabilityIncrease: 0.284,
    modelType: "xgboost",
    featureImportances: { "rsi_14": 0.45, "stoch_k": 0.25 }
  },
  {
    id: 5,
    asset: "AAPL",
    action: "HOLD",
    confidence: 55,
    currentPrice: 178.5,
    targetPrice: 190,
    stopLoss: 170,
    reasoning: "Stable technicals but mixed sentiment; ML model at neutral 0.5 probability.",
    technicalScore: 62,
    sentimentScore: 48,
    riskReward: 1.35,
    probabilityIncrease: 0.498,
    modelType: "gradient_boosting",
    featureImportances: { "atr_14_pct": 0.31, "sma_20_ratio": 0.19 }
  },
  {
    id: 6,
    asset: "MSFT",
    action: "BUY",
    confidence: 76,
    currentPrice: 378.65,
    targetPrice: 420,
    stopLoss: 360,
    reasoning: "Azure growth acceleration confirmed by bullish MACD histogram features.",
    technicalScore: 68,
    sentimentScore: 75,
    riskReward: 2.22,
    probabilityIncrease: 0.762,
    modelType: "gradient_boosting",
    featureImportances: { "macd_hist": 0.41, "ret_10d": 0.15 }
  },
  {
    id: 7,
    asset: "GOOGL",
    action: "BUY",
    confidence: 82,
    currentPrice: 142.5,
    targetPrice: 165,
    stopLoss: 135,
    reasoning: "Gemini AI momentum driving upgrades; strong ML probability of 5-day rise.",
    technicalScore: 78,
    sentimentScore: 85,
    riskReward: 3.0,
    probabilityIncrease: 0.815,
    modelType: "xgboost",
    featureImportances: { "ret_3d": 0.34, "rsi_14": 0.22 }
  },
  {
    id: 8,
    asset: "META",
    action: "BUY",
    confidence: 79,
    currentPrice: 505.3,
    targetPrice: 580,
    stopLoss: 475,
    reasoning: "Reels monetization improving + technical breakout features.",
    technicalScore: 74,
    sentimentScore: 81,
    riskReward: 2.47,
    probabilityIncrease: 0.789,
    modelType: "gradient_boosting",
    featureImportances: { "bb_pct": 0.29, "vol_trend": 0.18 }
  },
  {
    id: 9,
    asset: "TSLA",
    action: "HOLD",
    confidence: 52,
    currentPrice: 248.5,
    targetPrice: 280,
    stopLoss: 220,
    reasoning: "Volatility features high; model recommends holding for clearer direction.",
    technicalScore: 48,
    sentimentScore: 55,
    riskReward: 1.11,
    probabilityIncrease: 0.512,
    modelType: "gradient_boosting",
    featureImportances: { "atr_14_pct": 0.52 }
  },
  {
    id: 10,
    asset: "AMD",
    action: "BUY",
    confidence: 85,
    currentPrice: 178.2,
    targetPrice: 210,
    stopLoss: 165,
    reasoning: "MI300 AI chip demand exceeding forecasts; strong stochastics signal.",
    technicalScore: 82,
    sentimentScore: 88,
    riskReward: 2.41,
    probabilityIncrease: 0.842,
    modelType: "xgboost",
    featureImportances: { "stoch_k": 0.39, "ret_5d": 0.21 }
  }
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

  // Add variance to make it feel live and incorporate ML probabilities
  const liveSignals: TradingSignal[] = signals.slice(0, limit).map((signal) => {
    const priceVariance = signal.currentPrice * 0.002 * (Math.random() - 0.5)
    const confVariance = Math.floor(Math.random() * 4) - 2
    
    // Simulate live probability drift if present
    const probVariance = signal.probabilityIncrease 
      ? Math.max(0, Math.min(1, signal.probabilityIncrease + (Math.random() * 0.02 - 0.01)))
      : undefined

    return {
      ...signal,
      currentPrice: Math.round((signal.currentPrice + priceVariance) * 100) / 100,
      confidence: Math.max(50, Math.min(99, signal.confidence + confVariance)),
      technicalScore: Math.max(0, Math.min(100, signal.technicalScore + Math.floor(Math.random() * 6) - 3)),
      sentimentScore: Math.max(0, Math.min(100, signal.sentimentScore + Math.floor(Math.random() * 6) - 3)),
      probabilityIncrease: probVariance,
      timestamp: new Date().toISOString(),
    }
  })

  return NextResponse.json({
    signals: liveSignals,
    source: "quant-engine",
    timestamp: new Date().toISOString(),
  })
}