import { NextResponse } from "next/server"

interface PortfolioStats {
  totalValue: number
  todayPnL: number
  todayPnLPercent: number
  sharpeRatio: number
  winRate: number
  maxDrawdown: number
  totalTrades: number
  avgReturn: number
}

interface PortfolioHistory {
  date: string
  value: number
}

interface Position {
  symbol: string
  quantity: number
  avgCost: number
  currentPrice: number
  marketValue: number
  unrealizedPnL: number
  unrealizedPnLPercent: number
  allocation: number
}

const baseStats: PortfolioStats = {
  totalValue: 2847293,
  todayPnL: 34521,
  todayPnLPercent: 1.23,
  sharpeRatio: 2.34,
  winRate: 68.4,
  maxDrawdown: -8.5,
  totalTrades: 142,
  avgReturn: 2.8,
}

const portfolioHistory: PortfolioHistory[] = [
  { date: "Jan", value: 1200000 },
  { date: "Feb", value: 1350000 },
  { date: "Mar", value: 1280000 },
  { date: "Apr", value: 1520000 },
  { date: "May", value: 1680000 },
  { date: "Jun", value: 1590000 },
  { date: "Jul", value: 1850000 },
  { date: "Aug", value: 2100000 },
  { date: "Sep", value: 1980000 },
  { date: "Oct", value: 2250000 },
  { date: "Nov", value: 2480000 },
  { date: "Dec", value: 2847293 },
]

const positions: Position[] = [
  {
    symbol: "BTC",
    quantity: 12.5,
    avgCost: 35000,
    currentPrice: 43250,
    marketValue: 540625,
    unrealizedPnL: 103125,
    unrealizedPnLPercent: 23.57,
    allocation: 19.0,
  },
  {
    symbol: "ETH",
    quantity: 85,
    avgCost: 1800,
    currentPrice: 2280,
    marketValue: 193800,
    unrealizedPnL: 40800,
    unrealizedPnLPercent: 26.67,
    allocation: 6.8,
  },
  {
    symbol: "NVDA",
    quantity: 450,
    avgCost: 380,
    currentPrice: 485,
    marketValue: 218250,
    unrealizedPnL: 47250,
    unrealizedPnLPercent: 27.63,
    allocation: 7.7,
  },
  {
    symbol: "AAPL",
    quantity: 1200,
    avgCost: 155,
    currentPrice: 178.5,
    marketValue: 214200,
    unrealizedPnL: 28200,
    unrealizedPnLPercent: 15.16,
    allocation: 7.5,
  },
  {
    symbol: "MSFT",
    quantity: 320,
    avgCost: 320,
    currentPrice: 378.65,
    marketValue: 121168,
    unrealizedPnL: 18768,
    unrealizedPnLPercent: 18.33,
    allocation: 4.3,
  },
  {
    symbol: "SOL",
    quantity: 2500,
    avgCost: 45,
    currentPrice: 98.5,
    marketValue: 246250,
    unrealizedPnL: 133750,
    unrealizedPnLPercent: 118.89,
    allocation: 8.6,
  },
]

export async function GET() {
  // Add variance to simulate live portfolio updates
  const pnlVariance = (Math.random() - 0.5) * 5000
  const valueVariance = baseStats.totalValue * 0.001 * (Math.random() - 0.5)

  const liveStats: PortfolioStats = {
    ...baseStats,
    totalValue: Math.round(baseStats.totalValue + valueVariance),
    todayPnL: Math.round(baseStats.todayPnL + pnlVariance),
    todayPnLPercent: Math.round((baseStats.todayPnLPercent + (pnlVariance / baseStats.totalValue) * 100) * 100) / 100,
    sharpeRatio: Math.round((baseStats.sharpeRatio + (Math.random() - 0.5) * 0.1) * 100) / 100,
    winRate: Math.round((baseStats.winRate + (Math.random() - 0.5) * 2) * 10) / 10,
  }

  // Update positions with price variance
  const livePositions = positions.map((pos) => {
    const priceChange = pos.currentPrice * 0.005 * (Math.random() - 0.5)
    const newPrice = pos.currentPrice + priceChange
    const newMarketValue = pos.quantity * newPrice
    const newPnL = newMarketValue - pos.quantity * pos.avgCost

    return {
      ...pos,
      currentPrice: Math.round(newPrice * 100) / 100,
      marketValue: Math.round(newMarketValue),
      unrealizedPnL: Math.round(newPnL),
      unrealizedPnLPercent: Math.round((newPnL / (pos.quantity * pos.avgCost)) * 10000) / 100,
    }
  })

  return NextResponse.json({
    stats: liveStats,
    history: portfolioHistory,
    positions: livePositions,
    timestamp: new Date().toISOString(),
  })
}
