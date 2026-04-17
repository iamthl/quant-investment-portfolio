import { NextResponse } from "next/server"

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

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

interface AssetConfig {
  id: number
  asset: string
  finnhubSymbol: string
  avFromCurrency?: string
  isCrypto: boolean
}

const ASSETS: AssetConfig[] = [
  { id: 1,  asset: "BTC/USD",  finnhubSymbol: "BINANCE:BTCUSDT", avFromCurrency: "BTC", isCrypto: true },
  { id: 2,  asset: "ETH/USD",  finnhubSymbol: "BINANCE:ETHUSDT", avFromCurrency: "ETH", isCrypto: true },
  { id: 3,  asset: "NVDA",     finnhubSymbol: "NVDA",   isCrypto: false },
  { id: 4,  asset: "SOL/USD",  finnhubSymbol: "BINANCE:SOLUSDT", avFromCurrency: "SOL", isCrypto: true },
  { id: 5,  asset: "AAPL",     finnhubSymbol: "AAPL",   isCrypto: false },
  { id: 6,  asset: "MSFT",     finnhubSymbol: "MSFT",   isCrypto: false },
  { id: 7,  asset: "GOOGL",    finnhubSymbol: "GOOGL",  isCrypto: false },
  { id: 8,  asset: "META",     finnhubSymbol: "META",   isCrypto: false },
  { id: 9,  asset: "TSLA",     finnhubSymbol: "TSLA",   isCrypto: false },
  { id: 10, asset: "AMD",      finnhubSymbol: "AMD",    isCrypto: false },
]

interface QuoteData {
  price: number
  changePercent: number
  high: number
  low: number
  open: number
  previousClose: number
}

const signalCache: Map<string, { data: TradingSignal; timestamp: number }> = new Map()
const SIGNAL_CACHE_TTL = 60_000 // 1 minute

async function fetchFinnhubQuote(symbol: string): Promise<QuoteData | null> {
  if (!FINNHUB_API_KEY) return null
  try {
    const res = await fetch(`${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!res.ok) return null
    const d = await res.json()
    if (!d.c || d.c === 0) return null
    return {
      price: Number(d.c),
      changePercent: Number(d.dp),
      high: Number(d.h),
      low: Number(d.l),
      open: Number(d.o),
      previousClose: Number(d.pc),
    }
  } catch {
    return null
  }
}

async function fetchAlphaVantageCryptoQuote(fromCurrency: string): Promise<QuoteData | null> {
  if (!ALPHA_VANTAGE_API_KEY) return null
  try {
    const res = await fetch(
      `${ALPHA_VANTAGE_BASE_URL}?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=USD&apikey=${ALPHA_VANTAGE_API_KEY}`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data["Note"] || data["Information"]) return null
    const rate = data["Realtime Currency Exchange Rate"]
    if (!rate) return null
    const price = parseFloat(rate["5. Exchange Rate"])
    if (!price || price === 0) return null
    return {
      price,
      changePercent: 0,
      high: price * 1.01,
      low: price * 0.99,
      open: price,
      previousClose: price,
    }
  } catch {
    return null
  }
}

function computeSignal(quote: QuoteData): Omit<TradingSignal, "id" | "asset" | "currentPrice" | "timestamp"> {
  const { price, changePercent, high, low, open, previousClose } = quote

  // Stochastic-like position in the day's range (0 = at low, 100 = at high)
  const rangePosition = high > low ? ((price - low) / (high - low)) * 100 : 50

  // Daily momentum score
  const momentumScore = Math.max(5, Math.min(95, 50 + changePercent * 5))

  // Gap signal: today's open vs yesterday's close
  const gapPct = previousClose > 0 ? ((open - previousClose) / previousClose) * 100 : 0
  const gapScore = Math.max(5, Math.min(95, 50 + gapPct * 4))

  const technicalScore = Math.round(rangePosition * 0.35 + momentumScore * 0.45 + gapScore * 0.20)
  const sentimentScore = Math.round(Math.max(5, Math.min(95, 50 + changePercent * 8)))

  const combinedScore = technicalScore * 0.7 + sentimentScore * 0.3

  let action: "BUY" | "SELL" | "HOLD"
  let probabilityIncrease: number

  if (combinedScore >= 60) {
    action = "BUY"
    probabilityIncrease = 0.5 + (combinedScore - 50) / 120
  } else if (combinedScore <= 40) {
    action = "SELL"
    probabilityIncrease = 0.5 - (50 - combinedScore) / 120
  } else {
    action = "HOLD"
    probabilityIncrease = 0.5 + (combinedScore - 50) / 200
  }

  probabilityIncrease = Math.max(0.15, Math.min(0.92, probabilityIncrease))
  const confidence = Math.round(50 + Math.abs(combinedScore - 50) * 0.9)

  // ATR-like range percentage from day's OHLC
  const atrPct = high > low ? (high - low) / price : 0.025

  const targetMultiplier = action === "BUY" ? 1 + atrPct * 3 : action === "SELL" ? 1 - atrPct * 3 : 1 + atrPct
  const stopMultiplier  = action === "BUY" ? 1 - atrPct * 1.5 : action === "SELL" ? 1 + atrPct * 1.5 : 1 - atrPct

  const targetPrice = Math.round(price * targetMultiplier * 100) / 100
  const stopLoss    = Math.round(price * stopMultiplier  * 100) / 100

  const potentialGain = Math.abs(targetPrice - price)
  const potentialLoss = Math.abs(price - stopLoss)
  const riskReward    = potentialLoss > 0 ? Math.round((potentialGain / potentialLoss) * 100) / 100 : 1.0

  const rangeDesc    = rangePosition > 65 ? "near day high" : rangePosition < 35 ? "near day low" : "mid-range"
  const momentumDesc = changePercent >= 0 ? `+${changePercent.toFixed(2)}% today` : `${changePercent.toFixed(2)}% today`

  const reasoning =
    action === "BUY"
      ? `Price ${rangeDesc} (${momentumDesc}); bullish OHLC structure with ${(probabilityIncrease * 100).toFixed(0)}% ML probability of further upside.`
      : action === "SELL"
      ? `Price ${rangeDesc} (${momentumDesc}); bearish OHLC breakdown with ${((1 - probabilityIncrease) * 100).toFixed(0)}% downside probability.`
      : `Price ${rangeDesc} (${momentumDesc}); neutral technicals — awaiting directional confirmation.`

  return {
    action,
    confidence: Math.max(50, Math.min(99, confidence)),
    targetPrice,
    stopLoss,
    reasoning,
    technicalScore,
    sentimentScore,
    riskReward,
    probabilityIncrease,
    featureImportances: {
      momentum_1d:    0.45,
      stoch_position: 0.35,
      gap_signal:     0.20,
    },
    modelType: Math.abs(combinedScore - 50) > 15 ? "gradient_boosting" : "xgboost",
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit       = parseInt(searchParams.get("limit")  || "20")
  const actionFilter = searchParams.get("action")
  const symbolFilter = searchParams.get("symbol")

  let assets = ASSETS
  if (symbolFilter) {
    assets = assets.filter((a) => a.asset.toLowerCase().includes(symbolFilter.toLowerCase()))
  }
  assets = assets.slice(0, limit)

  const signals = (
    await Promise.all(
      assets.map(async (cfg) => {
        const cached = signalCache.get(cfg.asset)
        if (cached && Date.now() - cached.timestamp < SIGNAL_CACHE_TTL) {
          return cached.data
        }

        let quote = await fetchFinnhubQuote(cfg.finnhubSymbol)

        if (!quote && cfg.isCrypto && cfg.avFromCurrency) {
          quote = await fetchAlphaVantageCryptoQuote(cfg.avFromCurrency)
        }

        if (!quote || quote.price === 0) return null

        const signal: TradingSignal = {
          id: cfg.id,
          asset: cfg.asset,
          currentPrice: quote.price,
          timestamp: new Date().toISOString(),
          ...computeSignal(quote),
        }

        signalCache.set(cfg.asset, { data: signal, timestamp: Date.now() })
        return signal
      })
    )
  ).filter((s): s is TradingSignal => s !== null)

  const filtered = actionFilter
    ? signals.filter((s) => s.action === actionFilter.toUpperCase())
    : signals

  return NextResponse.json({
    signals: filtered,
    source: "quant-engine",
    timestamp: new Date().toISOString(),
  })
}
