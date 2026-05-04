import { NextResponse } from "next/server"

const FINNHUB_API_KEY   = process.env.FINNHUB_API_KEY
const FINNHUB_BASE      = "https://finnhub.io/api/v1"
const COINGECKO_BASE    = "https://api.coingecko.com/api/v3"

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", XRP: "ripple", DOGE: "dogecoin",
  ADA: "cardano", AVAX: "avalanche-2",
}

const CRYPTO_SYMBOLS = new Set(Object.keys(COINGECKO_IDS))

interface CompanyInfo {
  symbol: string
  name: string
  sector: string
  industry: string
  marketCap: string
  peRatio: string
  eps: string
  dividendYield: string
  beta: string
  exchange: string
  webUrl: string
  logo: string
}

const infoCache: Map<string, { data: CompanyInfo; ts: number }> = new Map()
const CACHE_TTL = 3_600_000 // 1 hour - fundamental data changes slowly

async function fetchStockInfo(symbol: string): Promise<CompanyInfo | null> {
  if (!FINNHUB_API_KEY) return null
  try {
    const [profileRes, metricsRes] = await Promise.all([
      fetch(`${FINNHUB_BASE}/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`),
      fetch(`${FINNHUB_BASE}/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_API_KEY}`),
    ])

    if (!profileRes.ok) return null
    const profile = await profileRes.json()
    if (!profile.name) return null

    const metrics = metricsRes.ok ? await metricsRes.json() : {}
    const m = metrics.metric ?? {}

    const mcap = profile.marketCapitalization
    const mcapStr = mcap >= 1_000_000 ? `$${(mcap / 1_000_000).toFixed(2)}T`
      : mcap >= 1_000  ? `$${(mcap / 1_000).toFixed(2)}B`
      : mcap > 0       ? `$${mcap.toFixed(0)}M`
      : "—"

    return {
      symbol,
      name:          profile.name          ?? symbol,
      sector:        profile.finnhubIndustry ?? "—",
      industry:      profile.finnhubIndustry ?? "—",
      marketCap:     mcapStr,
      peRatio:       m["peTTM"]                        != null ? m["peTTM"].toFixed(2)  : "—",
      eps:           m["epsTTM"]                       != null ? m["epsTTM"].toFixed(2) : "—",
      dividendYield: m["dividendYieldIndicatedAnnual"] != null ? `${m["dividendYieldIndicatedAnnual"].toFixed(2)}%` : "—",
      beta:          m["beta"]                         != null ? m["beta"].toFixed(2)   : "—",
      exchange:      profile.exchange  ?? "—",
      webUrl:        profile.weburl    ?? "",
      logo:          profile.logo      ?? "",
    }
  } catch {
    return null
  }
}

async function fetchCryptoInfo(symbol: string): Promise<CompanyInfo | null> {
  const cgId = COINGECKO_IDS[symbol]
  if (!cgId) return null
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${cgId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    const coin = await res.json()

    const mcap = coin.market_data?.market_cap?.usd ?? 0
    const mcapStr = mcap >= 1e12 ? `$${(mcap / 1e12).toFixed(2)}T`
      : mcap >= 1e9 ? `$${(mcap / 1e9).toFixed(2)}B`
      : mcap > 0    ? `$${(mcap / 1e6).toFixed(0)}M`
      : "—"

    return {
      symbol,
      name:          coin.name           ?? symbol,
      sector:        "Cryptocurrency",
      industry:      coin.categories?.[0] ?? "Digital Asset",
      marketCap:     mcapStr,
      peRatio:       "N/A",
      eps:           "N/A",
      dividendYield: "N/A",
      beta:          "N/A",
      exchange:      "Crypto",
      webUrl:        coin.links?.homepage?.[0] ?? "",
      logo:          coin.image?.small ?? "",
    }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })

  const cached = infoCache.get(symbol)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ info: cached.data, source: "cache" })
  }

  const info = CRYPTO_SYMBOLS.has(symbol)
    ? await fetchCryptoInfo(symbol)
    : await fetchStockInfo(symbol)

  if (!info) {
    return NextResponse.json({ error: `No company info for ${symbol}` }, { status: 404 })
  }

  infoCache.set(symbol, { data: info, ts: Date.now() })
  return NextResponse.json({ info, source: CRYPTO_SYMBOLS.has(symbol) ? "coingecko" : "finnhub" })
}
