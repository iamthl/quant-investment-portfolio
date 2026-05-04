import { NextResponse } from "next/server"

// Configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY 
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"
const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  BNB: "binancecoin", XRP: "ripple", DOGE: "dogecoin",
  ADA: "cardano", AVAX: "avalanche-2",
}

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
export const quoteCache: Map<string, { data: QuoteData; timestamp: number }> = new Map()
const historyCache: Map<string, { data: any; timestamp: number }> = new Map()
export const CACHE_TTL = 60_000   // 1 min for quotes
const HISTORY_TTL = 300_000  // 5 min - after this, attempt a refresh but still serve stale on failure


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


async function fetchCoinGeckoQuote(symbol: string): Promise<QuoteData | null> {
  const cgId = COINGECKO_IDS[symbol]
  if (!cgId) return null
  try {
    const res = await fetch(
      `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&ids=${cgId}&price_change_percentage=24h`,
      { next: { revalidate: 60 } }
    )
    if (!res.ok) return null
    const [coin] = await res.json()
    if (!coin) return null
    const price = Number(coin.current_price)
    return {
      symbol,
      price,
      change:        Number(coin.price_change_24h)            ?? 0,
      changePercent: Number(coin.price_change_percentage_24h) ?? 0,
      high:          Number(coin.high_24h)                    ?? price,
      low:           Number(coin.low_24h)                     ?? price,
      open:          price - (Number(coin.price_change_24h)   ?? 0),
      previousClose: price - (Number(coin.price_change_24h)   ?? 0),
      volume:        Number(coin.total_volume)                ?? 0,
      timestamp:     new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols    = searchParams.get("symbols") || "AAPL,NVDA"
  const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase())
  const quotes: QuoteData[] = []

  for (const symbol of symbolList) {
    const cached = quoteCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      quotes.push(cached.data)
      continue
    }

    const isCrypto = !!COINGECKO_IDS[symbol]
    let quote: QuoteData | null = null

    if (isCrypto) {
      // CoinGecko for crypto: real price, change, volume, high/low
      quote = await fetchCoinGeckoQuote(symbol)
      // Finnhub as fallback (maps BTC -> BINANCE:BTCUSDT)
      if (!quote) {
        const finnhubPair = CRYPTO_FINNHUB_MAP[symbol]
        if (finnhubPair) quote = await fetchFinnhubQuote(finnhubPair).then(q => q ? { ...q, symbol } : null)
      }
    } else {
      // Stocks: Finnhub -> Alpha Vantage fallback
      quote = await fetchFinnhubQuote(symbol)
      if (!quote) quote = await fetchAlphaVantageQuote(symbol)
    }

    if (quote) {
      quotes.push(quote)
      quoteCache.set(symbol, { data: quote, timestamp: Date.now() })
    }
  }

  return NextResponse.json({ quotes, source: "real_api", timestamp: new Date().toISOString() })
}

const CRYPTO_FINNHUB_MAP: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT", ETH: "BINANCE:ETHUSDT", SOL: "BINANCE:SOLUSDT",
  BNB: "BINANCE:BNBUSDT", XRP: "BINANCE:XRPUSDT", DOGE: "BINANCE:DOGEUSDT",
  ADA: "BINANCE:ADAUSDT", AVAX: "BINANCE:AVAXUSDT",
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const symbol = body.symbol
    const { from, to } = body

    const upperSymbol   = symbol?.toUpperCase()
    const finnhubPair   = CRYPTO_FINNHUB_MAP[upperSymbol]
    const isCrypto      = !!finnhubPair
    const finnhubSymbol = finnhubPair ?? symbol

    // Serve fresh cache immediately — skip all network calls
    const cached = historyCache.get(symbol)
    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity
    if (cached && cacheAge < HISTORY_TTL) {
      return NextResponse.json({ ...cached.data, stale: false })
    }

    // Attempt live sources 

    // Finnhub candles (preferred)
    if (FINNHUB_API_KEY) {
      const resolution = "D"
      const toTime   = to   || Math.floor(Date.now() / 1000)
      const fromTime = from || Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
      const endpoint = isCrypto ? "crypto/candle" : "stock/candle"
      const url = `${FINNHUB_BASE_URL}/${endpoint}?symbol=${finnhubSymbol}&resolution=${resolution}&from=${fromTime}&to=${toTime}&token=${FINNHUB_API_KEY}`

      try {
        const response = await fetch(url)
        const data = await response.json()
        if (data.s === "ok") {
          const bars = data.t.map((timestamp: number, index: number) => ({
            date:   new Date(timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            price:  Number(data.c[index]),
            open:   Number(data.o[index]),
            high:   Number(data.h[index]),
            low:    Number(data.l[index]),
            volume: Number(data.v[index]),
          }))
          const result = { symbol, bars, source: "finnhub_real" }
          historyCache.set(symbol, { data: result, timestamp: Date.now() })
          return NextResponse.json({ ...result, stale: false })
        }
        if (data.error) console.warn(`[Finnhub History] ${symbol}: ${data.error}`)
      } catch (e) {
        console.warn(`[Finnhub History] fetch failed for ${symbol}:`, e)
      }
    }

    // CoinGecko OHLC (crypto fallback)
    if (isCrypto) {
      const cgId = COINGECKO_IDS[upperSymbol]
      if (cgId) {
        try {
          const [ohlcRes, chartRes] = await Promise.all([
            fetch(`${COINGECKO_BASE_URL}/coins/${cgId}/ohlc?vs_currency=usd&days=30`),
            fetch(`${COINGECKO_BASE_URL}/coins/${cgId}/market_chart?vs_currency=usd&days=30&interval=daily`),
          ])
          if (ohlcRes.ok && chartRes.ok) {
            const ohlc: [number, number, number, number, number][] = await ohlcRes.json()
            const chart = await chartRes.json()
            const volMap = new Map<number, number>(
              (chart.total_volumes as [number, number][]).map(([ts, v]) => [Math.floor(ts / 86400000), v])
            )
            const bars = ohlc.map(([ts, o, h, l, c]) => ({
              date:   new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              price:  c, open: o, high: h, low: l,
              volume: volMap.get(Math.floor(ts / 86400000)) ?? 0,
            }))
            const result = { symbol, bars, source: "coingecko" }
            historyCache.set(symbol, { data: result, timestamp: Date.now() })
            return NextResponse.json({ ...result, stale: false })
          }
        } catch (e) {
          console.error(`[CoinGecko History] ${symbol}:`, e)
        }
      }
    }

    // Alpha Vantage daily (stock fallback)
    if (!isCrypto) {
      const fallbackData = await fetchAlphaVantageHistory(symbol)
      if (fallbackData) {
        historyCache.set(symbol, { data: fallbackData, timestamp: Date.now() })
        return NextResponse.json({ ...fallbackData, stale: false })
      }
    }

    //  All live sources failed — serve stale cache if available 
    if (cached) {
      const staleMins = Math.round(cacheAge / 60_000)
      console.warn(`[Market Data] All sources rate-limited for ${symbol} — serving ${staleMins}m stale cache`)
      return NextResponse.json({
        ...cached.data,
        stale:      true,
        cachedAt:   new Date(cached.timestamp).toISOString(),
        retryAfter: 60,  // seconds — hint for client polling
      })
    }

    return NextResponse.json({ error: "No historical data available", retryAfter: 60 }, { status: 503 })

  } catch (error) {
    console.error("[API Crash]", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}