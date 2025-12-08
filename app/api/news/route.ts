import { NextResponse } from "next/server"

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

interface NewsArticle {
  id: string
  headline: string
  summary: string
  source: string
  url: string
  publishedAt: string
  symbols: string[]
  sentimentScore: number
  sentimentLabel: "Bullish" | "Somewhat-Bullish" | "Neutral" | "Somewhat-Bearish" | "Bearish"
  relevanceScore: number
  bannerImage?: string
}

// Cache for news to avoid rate limits
const newsCache: Map<string, { data: NewsArticle[]; timestamp: number }> = new Map()
const CACHE_TTL = 300000 // 5 minutes cache

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickers = searchParams.get("symbols") || "AAPL,NVDA,TSLA"
  const limit = Number.parseInt(searchParams.get("limit") || "10")
  const topics = searchParams.get("topics") || "technology,earnings"

  const cacheKey = `${tickers}-${topics}-${limit}`

  try {
    // Check cache first
    const cached = newsCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        articles: cached.data,
        source: "alpha_vantage_cached",
        timestamp: new Date().toISOString(),
      })
    }

    const articles = await fetchAlphaVantageNews(tickers, topics, limit)

    if (articles.length > 0) {
      newsCache.set(cacheKey, { data: articles, timestamp: Date.now() })
    }

    return NextResponse.json({
      articles,
      source: "alpha_vantage",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[News API Error]", error)
    return NextResponse.json(
      {
        articles: [],
        source: "error",
        error: "Failed to fetch news",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

async function fetchAlphaVantageNews(tickers: string, topics: string, limit: number): Promise<NewsArticle[]> {
  try {
    // Alpha Vantage News Sentiment API
    const url = new URL(ALPHA_VANTAGE_BASE_URL)
    url.searchParams.set("function", "NEWS_SENTIMENT")
    url.searchParams.set("tickers", tickers)
    url.searchParams.set("topics", topics)
    url.searchParams.set("limit", String(Math.min(limit, 50)))
    url.searchParams.set("apikey", ALPHA_VANTAGE_API_KEY)

    const response = await fetch(url.toString(), { next: { revalidate: 300 } })

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`)
    }

    const data = await response.json()

    // Check for API limit message
    if (data["Note"] || data["Information"]) {
      console.warn("[Alpha Vantage News] Rate limit:", data["Note"] || data["Information"])
      return []
    }

    const feed = data.feed
    if (!feed || !Array.isArray(feed)) {
      return []
    }

    return feed.map((item: any, idx: number) => {
      // Get overall sentiment
      const overallSentiment = item.overall_sentiment_score || 0
      const sentimentLabel = getSentimentLabel(overallSentiment)

      // Get ticker-specific sentiment if available
      const tickerSentiment = item.ticker_sentiment || []
      const symbols = tickerSentiment.map((ts: any) => ts.ticker)
      const relevanceScore = tickerSentiment[0]?.relevance_score
        ? Number.parseFloat(tickerSentiment[0].relevance_score)
        : 0.5

      return {
        id: String(idx),
        headline: item.title || "",
        summary: item.summary || "",
        source: item.source || "Unknown",
        url: item.url || "#",
        publishedAt: formatAlphaVantageDate(item.time_published),
        symbols,
        sentimentScore: Number.parseFloat(overallSentiment.toFixed(3)),
        sentimentLabel,
        relevanceScore,
        bannerImage: item.banner_image || undefined,
      }
    })
  } catch (error) {
    console.error("[Alpha Vantage News] Error:", error)
    return []
  }
}

function getSentimentLabel(score: number): NewsArticle["sentimentLabel"] {
  if (score >= 0.35) return "Bullish"
  if (score >= 0.15) return "Somewhat-Bullish"
  if (score >= -0.15) return "Neutral"
  if (score >= -0.35) return "Somewhat-Bearish"
  return "Bearish"
}

function formatAlphaVantageDate(dateStr: string): string {
  // Alpha Vantage format: "20231215T143000"
  if (!dateStr) return new Date().toISOString()

  try {
    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6)
    const day = dateStr.substring(6, 8)
    const hour = dateStr.substring(9, 11)
    const minute = dateStr.substring(11, 13)
    const second = dateStr.substring(13, 15)

    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString()
  } catch {
    return new Date().toISOString()
  }
}
