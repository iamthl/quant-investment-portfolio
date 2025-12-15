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
const historyCache: Map<string, { data: any; timestamp: number }> = new Map()
const CACHE_TTL = 60000 
const HISTORY_TTL = 300000

// 1. QUOTE FETCHERS (GET)

async function fetchFinnhubQuote(symbol: string): Promise<QuoteData | null> {
  if (!FINNHUB_API_KEY) return null
  try {
    const response = await fetch(
      `${FINNHUB_BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 30 } }
    )
    if (!response.ok) return null
    const data = await response.json()
    if (data.c === 0 && data.h === 0) return null // Invalid symbol

    return {
      symbol,
      price: Number(data.c),
      change: Number(data.d),
      changePercent: Number(data.dp),
      high: Number(data.h),
      low: Number(data.l),
      open: Number(data.o),
      previousClose: Number(data.pc),
      volume: 0, 
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return null
  }
}

async function fetchAlphaVantageQuote(symbol: string): Promise<QuoteData | null> {
  if (!ALPHA_VANTAGE_API_KEY) return null
  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`,
      { next: { revalidate: 60 } }
    )
    if (!response.ok) return null
    const data = await response.json()
    
    // Check for limits
    if (data["Note"] || data["Information"] || !data["Global Quote"]) return null

    const quote = data["Global Quote"]
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
    return null
  }
}

// 2. HISTORY FETCHERS

// Helper: Fetch history from Alpha Vantage if Finnhub fails
async function fetchAlphaVantageHistory(symbol: string) {
  if (!ALPHA_VANTAGE_API_KEY) return null

  console.log(`[Historical] Falling back to Alpha Vantage for ${symbol}...`)
  
  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
    )
    const data = await response.json()

    if (data["Error Message"] || data["Note"]) {
        console.error(`[AlphaVantage History Error] ${JSON.stringify(data)}`)
        return null
    }

    const timeSeries = data["Time Series (Daily)"]
    if (!timeSeries) return null


    const bars = Object.entries(timeSeries)
      .slice(0, 30) 
      .map(([dateStr, values]: [string, any]) => ({
        date: new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        price: parseFloat(values["4. close"]),
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        volume: parseFloat(values["5. volume"]),
      }))
      .reverse() 

    return { symbol, bars, source: "alphavantage_fallback" }
  } catch (error) {
    console.error("[Alpha Vantage History Crash]", error)
    return null
  }
}

// 3. API HANDLERS

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get("symbols") || "AAPL,NVDA" 
  const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase())
  const quotes: QuoteData[] = []

  for (const symbol of symbolList) {
    const cached = quoteCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      quotes.push(cached.data)
      continue
    }

    // Try Finnhub -> Failover to Alpha Vantage
    let quote = await fetchFinnhubQuote(symbol)    
    if (!quote) quote = await fetchAlphaVantageQuote(symbol)   

    if (quote) {
      quotes.push(quote)
      quoteCache.set(symbol, { data: quote, timestamp: Date.now() })
    }
  }

  return NextResponse.json({ quotes, source: "real_api", timestamp: new Date().toISOString() })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const symbol = body.symbol
    const { from, to } = body 

    // 1. Check Cache (Critical for Alpha Vantage limits)
    const cached = historyCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < HISTORY_TTL) {
        return NextResponse.json(cached.data)
    }

    // 1. Try Finnhub First (Preferred)
    if (FINNHUB_API_KEY) {
      const resolution = "D" 
      const toTime = to || Math.floor(Date.now() / 1000)
      const fromTime = from || Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)
      
      const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${fromTime}&to=${toTime}&token=${FINNHUB_API_KEY}`
      
      const response = await fetch(url)
      const data = await response.json()

      // If Finnhub works, return it
      if (data.s === "ok") {
        const bars = data.t.map((timestamp: number, index: number) => ({
            date: new Date(timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            price: Number(data.c[index]),
            open: Number(data.o[index]),
            high: Number(data.h[index]),
            low: Number(data.l[index]),
            volume: Number(data.v[index])
        }))
        const result = { symbol, bars, source: "finnhub_real" }
        historyCache.set(symbol, { data: result, timestamp: Date.now() })
        return NextResponse.json(result)      
      } 
      
      // Log the specific error for debugging, but don't stop execution
      if (data.error) {
          console.warn(`[Finnhub History] Access denied for ${symbol}. Switching to fallback...`)
      }
    }

    // 2. Fallback to Alpha Vantage (Backup)
    const fallbackData = await fetchAlphaVantageHistory(symbol)
    
    if (fallbackData) {
        historyCache.set(symbol, { data: fallbackData, timestamp: Date.now() })
        return NextResponse.json(fallbackData)
    }

    // 3. If Both Fail, Return Error
    return NextResponse.json({ error: "Unable to fetch historical data from any source" }, { status: 500 })

  } catch (error) {
    console.error("[API Crash]", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}