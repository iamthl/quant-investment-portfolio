import { NextResponse } from "next/server"

// Configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY 
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

interface QuoteData {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  previousClose: number
  timestamp: string
}

// In-memory cache
const quoteCache: Map<string, { data: QuoteData; timestamp: number }> = new Map()
const CACHE_TTL = 30000 // 30 seconds cache

// --- Finnhub Fetcher ---
async function fetchFinnhubQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const response = await fetch(
      `${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 10 } }
    )

    if (!response.ok) return null
    const data = await response.json()

    // Finnhub returns 0s if symbol not found
    if (data.c === 0 && data.h === 0) return null

    return {
      symbol,
      price: data.c,
      change: data.d,
      changePercent: data.dp,
      high: data.h,
      low: data.l,
      open: data.o,
      previousClose: data.pc,
      volume: 0, // Finnhub quote endpoint doesn't return volume in free tier sometimes, handle gracefully
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error(`[Finnhub] Error fetching ${symbol}:`, error)
    return null
  }
}

// --- Alpha Vantage Fetcher (Fallback) ---
async function fetchAlphaVantageQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`,
      { next: { revalidate: 60 } }
    )

    if (!response.ok) return null
    const data = await response.json()

    // Rate limit check
    if (data["Note"] || data["Information"]) {
      console.warn("[Alpha Vantage] Rate limit reached")
      return null
    }

    const quote = data["Global Quote"]
    if (!quote || !quote["05. price"]) return null

    return {
      symbol,
      price: Number.parseFloat(quote["05. price"]),
      change: Number.parseFloat(quote["09. change"]),
      changePercent: Number.parseFloat(quote["10. change percent"].replace("%", "")),
      volume: Number.parseInt(quote["06. volume"]),
      high: Number.parseFloat(quote["03. high"]),
      low: Number.parseFloat(quote["04. low"]),
      open: Number.parseFloat(quote["02. open"]),
      previousClose: Number.parseFloat(quote["08. previous close"]),
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    console.error(`[Alpha Vantage] Error fetching ${symbol}:`, error)
    return null
  }
}

// Main GET Handler
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get("symbols") || "AAPL,NVDA,MSFT,TSLA,SPY"
  const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase())

  const quotes: QuoteData[] = []

  for (const symbol of symbolList) {
    // 1. Check Cache
    const cached = quoteCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      quotes.push(cached.data)
      continue
    }

    // 2. Try Finnhub (Primary)
    let quote = await fetchFinnhubQuote(symbol)

    // 3. Fallback to Alpha Vantage (Secondary)
    if (!quote) {
      console.log(`[Market Data] Falling back to Alpha Vantage for ${symbol}`)
      quote = await fetchAlphaVantageQuote(symbol)
    }

    if (quote) {
      quotes.push(quote)
      quoteCache.set(symbol, { data: quote, timestamp: Date.now() })
    }
  }

  return NextResponse.json({
    quotes,
    source: "finnhub_primary",
    timestamp: new Date().toISOString(),
  })
}

// --- Historical Data Handler (POST) ---
export async function POST(request: Request) {
  const body = await request.json()
  const { symbol, interval = "D", from, to } = body // D = Daily

  try {
    // Default to last 30 days if not specified
    const toTime = to || Math.floor(Date.now() / 1000)
    const fromTime = from || Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)

    // Fetch Candles from Finnhub
    const response = await fetch(
      `${FINNHUB_BASE_URL}/stock/candle?symbol=${symbol}&resolution=${interval}&from=${fromTime}&to=${toTime}&token=${FINNHUB_API_KEY}`
    )
    
    const data = await response.json()

    if (data.s !== "ok") {
        return NextResponse.json({ error: "Failed to fetch historical data" }, { status: 500 })
    }

    // Map Finnhub structure to Chart format
    // c: close, h: high, l: low, o: open, t: timestamp, v: volume
    const bars = data.t.map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        price: data.c[index],
        open: data.o[index],
        high: data.h[index],
        low: data.l[index],
        volume: data.v[index]
    }))

    return NextResponse.json({
      symbol,
      bars,
      source: "finnhub",
    })

  } catch (error) {
    console.error("[Historical Data API Error]", error)
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 })
  }
}