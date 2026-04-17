import { NextResponse } from "next/server"

const FINNHUB_API_KEY        = process.env.FINNHUB_API_KEY
const ALPHA_VANTAGE_API_KEY  = process.env.ALPHA_VANTAGE_API_KEY
const COINGECKO_BASE         = "https://api.coingecko.com/api/v3"
const FINNHUB_BASE           = "https://finnhub.io/api/v1"
const AV_BASE                = "https://www.alphavantage.co/query"

interface CryptoQuote {
  symbol:        string
  price:         number
  change:        number
  changePercent: number
  volume:        number
  marketCap:     number
  timestamp:     string
}

// Symbol → CoinGecko id
const COINGECKO_IDS: Record<string, string> = {
  BTC:   "bitcoin",
  ETH:   "ethereum",
  SOL:   "solana",
  BNB:   "binancecoin",
  XRP:   "ripple",
  ADA:   "cardano",
  DOGE:  "dogecoin",
  AVAX:  "avalanche-2",
  MATIC: "matic-network",
  DOT:   "polkadot",
  LINK:  "chainlink",
  LTC:   "litecoin",
}

const FINNHUB_PAIRS: Record<string, string> = {
  BTC:  "BINANCE:BTCUSDT",
  ETH:  "BINANCE:ETHUSDT",
  SOL:  "BINANCE:SOLUSDT",
  BNB:  "BINANCE:BNBUSDT",
  XRP:  "BINANCE:XRPUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  ADA:  "BINANCE:ADAUSDT",
}

const cryptoCache: Map<string, { data: CryptoQuote; timestamp: number }> = new Map()
const CACHE_TTL = 60_000

// Primary: CoinGecko (price, 24h change, real volume, real market cap)

async function fetchFromCoinGecko(symbols: string[]): Promise<Map<string, CryptoQuote>> {
  const ids = symbols.map((s) => COINGECKO_IDS[s]).filter(Boolean)
  if (ids.length === 0) return new Map()

  try {
    const url = new URL(`${COINGECKO_BASE}/coins/markets`)
    url.searchParams.set("vs_currency",            "usd")
    url.searchParams.set("ids",                    ids.join(","))
    url.searchParams.set("order",                  "market_cap_desc")
    url.searchParams.set("per_page",               "50")
    url.searchParams.set("page",                   "1")
    url.searchParams.set("sparkline",              "false")
    url.searchParams.set("price_change_percentage","24h")

    const res = await fetch(url.toString(), { next: { revalidate: 60 } })
    if (!res.ok) return new Map()

    const coins: any[] = await res.json()
    if (!Array.isArray(coins)) return new Map()

    const result = new Map<string, CryptoQuote>()

    // Reverse-lookup: coingecko id → ticker symbol
    const idToSymbol = Object.fromEntries(
      Object.entries(COINGECKO_IDS).map(([sym, id]) => [id, sym])
    )

    for (const coin of coins) {
      const symbol = idToSymbol[coin.id]
      if (!symbol) continue
      const price = Number(coin.current_price) || 0
      const change = Number(coin.price_change_24h) || 0
      result.set(symbol, {
        symbol:        `${symbol}/USD`,
        price,
        change,
        changePercent: Number(coin.price_change_percentage_24h) || 0,
        volume:        Number(coin.total_volume)                 || 0,
        marketCap:     Number(coin.market_cap)                   || 0,
        timestamp:     new Date().toISOString(),
      })
    }

    return result
  } catch {
    return new Map()
  }
}

// Fallback: Finnhub (price + change%) + Alpha Vantage (volume from daily bar)

async function fetchFinnhubQuote(symbol: string): Promise<{ price: number; change: number; changePercent: number } | null> {
  const pair = FINNHUB_PAIRS[symbol]
  if (!pair || !FINNHUB_API_KEY) return null
  try {
    const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${pair}&token=${FINNHUB_API_KEY}`)
    if (!res.ok) return null
    const d = await res.json()
    if (!d.c || d.c === 0) return null
    return { price: Number(d.c), change: Number(d.d), changePercent: Number(d.dp) }
  } catch {
    return null
  }
}

async function fetchAVCryptoDailyVolume(symbol: string): Promise<{ volume: number; marketCap: number } | null> {
  if (!ALPHA_VANTAGE_API_KEY) return null
  try {
    const res = await fetch(
      `${AV_BASE}?function=DIGITAL_CURRENCY_DAILY&symbol=${symbol}&market=USD&apikey=${ALPHA_VANTAGE_API_KEY}`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data["Note"] || data["Information"]) return null
    const ts = data["Time Series (Digital Currency Daily)"]
    if (!ts) return null
    const latest = ts[Object.keys(ts)[0]]
    return {
      volume:    parseFloat(latest["5. volume"]          || "0"),
      marketCap: parseFloat(latest["6. market cap (USD)"]|| "0"),
    }
  } catch {
    return null
  }
}

// Route handler 

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols     = searchParams.get("symbols") || "BTC,ETH"
  const symbolList  = symbols.split(",").map((s) => s.trim().toUpperCase())

  try {
    // Serve fully-cached symbols immediately
    const uncached = symbolList.filter((s) => {
      const hit = cryptoCache.get(s)
      return !(hit && Date.now() - hit.timestamp < CACHE_TTL)
    })

    // Bulk fetch uncached symbols from CoinGecko
    const cgMap = uncached.length > 0 ? await fetchFromCoinGecko(uncached) : new Map<string, CryptoQuote>()

    const quotes: CryptoQuote[] = []

    for (const symbol of symbolList) {
      const hit = cryptoCache.get(symbol)
      if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
        quotes.push(hit.data)
        continue
      }

      // Use CoinGecko result
      const cgQuote = cgMap.get(symbol)
      if (cgQuote) {
        cryptoCache.set(symbol, { data: cgQuote, timestamp: Date.now() })
        quotes.push(cgQuote)
        continue
      }

      // Fallback: Finnhub price/change + Alpha Vantage daily bar for volume/mcap
      const [finnhub, avDaily] = await Promise.all([
        fetchFinnhubQuote(symbol),
        fetchAVCryptoDailyVolume(symbol),
      ])

      if (!finnhub) continue

      const fallbackQuote: CryptoQuote = {
        symbol:        `${symbol}/USD`,
        price:         finnhub.price,
        change:        finnhub.change,
        changePercent: finnhub.changePercent,
        volume:        avDaily?.volume    ?? 0,
        marketCap:     avDaily?.marketCap ?? 0,
        timestamp:     new Date().toISOString(),
      }

      cryptoCache.set(symbol, { data: fallbackQuote, timestamp: Date.now() })
      quotes.push(fallbackQuote)
    }

    return NextResponse.json({
      quotes,
      source: "coingecko",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[Crypto API Error]", error)
    return NextResponse.json(
      { quotes: [], source: "error", error: "Failed to fetch crypto data", timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
