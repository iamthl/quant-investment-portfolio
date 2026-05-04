import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const FINNHUB_BASE    = "https://finnhub.io/api/v1"
const COINGECKO_BASE  = "https://api.coingecko.com/api/v3"

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
}
const CRYPTO_SYMBOLS = new Set(Object.keys(COINGECKO_IDS))

// Paper portfolio holdings — quantities and average cost basis
const HOLDINGS = [
  { symbol: "BTC",  quantity: 12.5,  avgCost: 35000 },
  { symbol: "ETH",  quantity: 85,    avgCost: 1800  },
  { symbol: "NVDA", quantity: 450,   avgCost: 380   },
  { symbol: "AAPL", quantity: 1200,  avgCost: 155   },
  { symbol: "MSFT", quantity: 320,   avgCost: 320   },
  { symbol: "SOL",  quantity: 2500,  avgCost: 45    },
]

const priceCache: Map<string, { price: number; changePercent: number; ts: number }> = new Map()
const CACHE_TTL = 60_000

async function fetchPrice(symbol: string): Promise<{ price: number; changePercent: number } | null> {
  const cached = priceCache.get(symbol)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { price: cached.price, changePercent: cached.changePercent }
  }

  try {
    if (CRYPTO_SYMBOLS.has(symbol)) {
      const cgId = COINGECKO_IDS[symbol]
      const res  = await fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${cgId}&price_change_percentage=24h`,
        { next: { revalidate: 60 } }
      )
      if (!res.ok) return null
      const [coin] = await res.json()
      if (!coin) return null
      const result = { price: Number(coin.current_price), changePercent: Number(coin.price_change_percentage_24h) ?? 0 }
      priceCache.set(symbol, { ...result, ts: Date.now() })
      return result
    }

    if (!FINNHUB_API_KEY) return null
    const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!res.ok) return null
    const d = await res.json()
    if (!d.c || d.c === 0) return null
    const result = { price: Number(d.c), changePercent: Number(d.dp) }
    priceCache.set(symbol, { ...result, ts: Date.now() })
    return result
  } catch {
    return null
  }
}

type Holding = { symbol: string; quantity: number; avgCost: number }
type LivePrice = { price: number; changePercent: number }

export function computePortfolioStats(
  holdings: Holding[],
  prices: Map<string, LivePrice>,
) {
  const positions = holdings.map((h) => {
    const live         = prices.get(h.symbol)
    const currentPrice = live?.price ?? 0
    const marketValue  = h.quantity * currentPrice
    const costBasis    = h.quantity * h.avgCost
    const unrealizedPnL        = marketValue - costBasis
    const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0

    return {
      symbol: h.symbol,
      quantity: h.quantity,
      avgCost: h.avgCost,
      currentPrice,
      changePercent: live?.changePercent ?? 0,
      marketValue:   Math.round(marketValue),
      unrealizedPnL: Math.round(unrealizedPnL),
      unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
    }
  }).filter((p) => p.currentPrice > 0)

  const totalValue  = positions.reduce((s, p) => s + p.marketValue, 0)
  const totalCost   = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0)
  const totalPnL    = totalValue - totalCost
  const todayPnL    = positions.reduce((s, p) => s + p.marketValue * (p.changePercent / 100), 0)
  const todayPnLPct = totalValue > 0 ? (todayPnL / (totalValue - todayPnL)) * 100 : 0

  const positionsWithAlloc = positions.map((p) => ({
    ...p,
    allocation: totalValue > 0 ? Math.round((p.marketValue / totalValue) * 1000) / 10 : 0,
  }))

  const stats = {
    totalValue:      Math.round(totalValue),
    totalCost:       Math.round(totalCost),
    totalPnL:        Math.round(totalPnL),
    totalPnLPercent: totalCost > 0 ? Math.round((totalPnL / totalCost) * 10000) / 100 : 0,
    todayPnL:        Math.round(todayPnL),
    todayPnLPercent: Math.round(todayPnLPct * 100) / 100,
    positionCount:   positions.length,
  }

  return { stats, positions: positionsWithAlloc }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ message: "Unauthorised" }, { status: 401 })
  }

  // Fetch live prices for all holdings in parallel
  const livePrices = await Promise.all(
    HOLDINGS.map(async (h) => ({ symbol: h.symbol, ...(await fetchPrice(h.symbol)) }))
  )

  const priceMap = new Map(
    livePrices
      .filter((p): p is typeof p & LivePrice => p.price != null)
      .map((p) => [p.symbol, { price: p.price, changePercent: p.changePercent }])
  )

  const { stats, positions: positionsWithAlloc } = computePortfolioStats(HOLDINGS, priceMap)

  // Simulate 30-day history ending at current totalValue, starting from totalCost
  const history = Array.from({ length: 30 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    const progress = i / 29
    // Walk from cost basis to current value with slight noise
    const trend = stats.totalCost + (stats.totalValue - stats.totalCost) * progress
    const noise = trend * (Math.sin(i * 2.5) * 0.015 + Math.cos(i * 1.3) * 0.01)
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(trend + noise),
    }
  })

  return NextResponse.json({
    stats,
    positions: positionsWithAlloc,
    history,
    timestamp: new Date().toISOString(),
  })
}
