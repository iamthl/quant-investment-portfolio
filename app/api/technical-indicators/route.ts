import { NextResponse } from "next/server"

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

interface TechnicalData {
  symbol: string
  rsi: number
  macd: number
  macdSignal: number
  macdHistogram: number
  sma20: number
  sma50: number
  ema12: number
  ema26: number
  adx: number
  atr: number
  bbands: {
    upper: number
    middle: number
    lower: number
  }
  stoch: {
    k: number
    d: number
  }
  obv: number
  timestamp: string
}

// Cache for technical indicators
const indicatorCache: Map<string, { data: Partial<TechnicalData>; timestamp: number }> = new Map()
const CACHE_TTL = 300000 // 5 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")?.toUpperCase() || "AAPL"
  const interval = searchParams.get("interval") || "daily"

  try {
    // Check cache
    const cacheKey = `${symbol}-${interval}`
    const cached = indicatorCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        indicators: { ...cached.data, symbol, timestamp: new Date().toISOString() },
        source: "alpha_vantage_cached",
        timestamp: new Date().toISOString(),
      })
    }

    // Fetch multiple indicators in parallel (be mindful of rate limits)
    const [rsiData, macdData, smaData, adxData, bbandsData] = await Promise.all([
      fetchIndicator(symbol, "RSI", { time_period: 14, series_type: "close" }),
      fetchIndicator(symbol, "MACD", { series_type: "close" }),
      fetchIndicator(symbol, "SMA", { time_period: 20, series_type: "close" }),
      fetchIndicator(symbol, "ADX", { time_period: 14 }),
      fetchIndicator(symbol, "BBANDS", { time_period: 20, series_type: "close" }),
    ])

    const technicalData: Partial<TechnicalData> = {
      symbol,
      rsi: rsiData?.value || 50,
      macd: macdData?.macd || 0,
      macdSignal: macdData?.signal || 0,
      macdHistogram: macdData?.histogram || 0,
      sma20: smaData?.value || 0,
      adx: adxData?.value || 25,
      bbands: bbandsData || { upper: 0, middle: 0, lower: 0 },
      timestamp: new Date().toISOString(),
    }

    // Cache the result
    indicatorCache.set(cacheKey, { data: technicalData, timestamp: Date.now() })

    return NextResponse.json({
      indicators: technicalData,
      source: "alpha_vantage",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[Technical Indicators API Error]", error)
    return NextResponse.json(
      {
        indicators: null,
        source: "error",
        error: "Failed to fetch technical indicators",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

async function fetchIndicator(symbol: string, indicator: string, params: Record<string, any> = {}): Promise<any> {
  try {
    const url = new URL(ALPHA_VANTAGE_BASE_URL)
    url.searchParams.set("function", indicator)
    url.searchParams.set("symbol", symbol)
    url.searchParams.set("interval", "daily")
    url.searchParams.set("apikey", ALPHA_VANTAGE_API_KEY)

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value))
    })

    const response = await fetch(url.toString(), { next: { revalidate: 300 } })

    if (!response.ok) {
      throw new Error(`Alpha Vantage error: ${response.status}`)
    }

    const data = await response.json()

    // Check for rate limit
    if (data["Note"] || data["Information"]) {
      console.warn(`[Alpha Vantage ${indicator}] Rate limit`)
      return null
    }

    // Parse based on indicator type
    switch (indicator) {
      case "RSI": {
        const rsiData = data["Technical Analysis: RSI"]
        if (rsiData) {
          const latestDate = Object.keys(rsiData)[0]
          return { value: Number.parseFloat(rsiData[latestDate]?.RSI || "50") }
        }
        break
      }
      case "MACD": {
        const macdData = data["Technical Analysis: MACD"]
        if (macdData) {
          const latestDate = Object.keys(macdData)[0]
          const latest = macdData[latestDate]
          return {
            macd: Number.parseFloat(latest?.MACD || "0"),
            signal: Number.parseFloat(latest?.MACD_Signal || "0"),
            histogram: Number.parseFloat(latest?.MACD_Hist || "0"),
          }
        }
        break
      }
      case "SMA": {
        const smaData = data["Technical Analysis: SMA"]
        if (smaData) {
          const latestDate = Object.keys(smaData)[0]
          return { value: Number.parseFloat(smaData[latestDate]?.SMA || "0") }
        }
        break
      }
      case "ADX": {
        const adxData = data["Technical Analysis: ADX"]
        if (adxData) {
          const latestDate = Object.keys(adxData)[0]
          return { value: Number.parseFloat(adxData[latestDate]?.ADX || "25") }
        }
        break
      }
      case "BBANDS": {
        const bbandsData = data["Technical Analysis: BBANDS"]
        if (bbandsData) {
          const latestDate = Object.keys(bbandsData)[0]
          const latest = bbandsData[latestDate]
          return {
            upper: Number.parseFloat(latest?.["Real Upper Band"] || "0"),
            middle: Number.parseFloat(latest?.["Real Middle Band"] || "0"),
            lower: Number.parseFloat(latest?.["Real Lower Band"] || "0"),
          }
        }
        break
      }
    }

    return null
  } catch (error) {
    console.error(`[Alpha Vantage ${indicator}] Error:`, error)
    return null
  }
}
