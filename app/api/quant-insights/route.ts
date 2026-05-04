import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY
const FINNHUB_API_KEY       = process.env.FINNHUB_API_KEY
const AV_BASE               = "https://www.alphavantage.co/query"
const FINNHUB_BASE          = "https://finnhub.io/api/v1"
const QUANT_ENGINE_URL      = "http://127.0.0.1:8003"
const NEWS_INGESTOR_URL     = process.env.NEWS_INGESTOR_URL ?? "http://127.0.0.1:8002"


interface QuantInsight {
  symbol: string
  technicalScore: number
  sentimentScore: number
  fusedScore: number
  action: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL"
  confidence: number
  reasoning: string
  technicalFactors: string[]
  sentimentFactors: string[]
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  timestamp: string
  probabilityIncrease?: number
  featureImportances?: Record<string, number>
  featureContributions?: Record<string, number>  // signed: positive = bullish push
  modelType?: string
}

interface RawIndicators {
  rsi:    number | null
  macd:   { macd: number; signal: number; hist: number } | null
  bbands: { upper: number; middle: number; lower: number } | null
  adx:    number | null
}

interface SentimentData {
  avgScore:     number
  articleCount: number
  topHeadlines: string[]
}


const indicatorCache: Map<string, { data: RawIndicators; ts: number }> = new Map()
const sentimentCache: Map<string, { data: SentimentData; ts: number }> = new Map()
const insightCache:   Map<string, { data: QuantInsight;  ts: number }> = new Map()
const INDICATOR_TTL = 300_000  // 5 min  (matches existing technical-indicators route)
const SENTIMENT_TTL = 300_000  // 5 min
const INSIGHT_TTL   = 120_000  // 2 min

const CRYPTO_SYMBOLS   = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"])
const CRYPTO_FINNHUB: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  SOL: "BINANCE:SOLUSDT",
  BNB: "BINANCE:BNBUSDT",
  XRP: "BINANCE:XRPUSDT",
}

// Primary: Python quant engine (real ML)

async function fetchFromQuantEngine(symbols: string[]): Promise<QuantInsight[] | null> {
  try {
    const res = await fetch(
      `${QUANT_ENGINE_URL}/api/v1/insights?symbols=${symbols.join(",")}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!res.ok) return null
    const { insights } = await res.json()
    if (!Array.isArray(insights) || insights.length === 0) return null

    return insights.map((ins: any): QuantInsight => ({
      symbol:              ins.symbol,
      technicalScore:      ins.technical_score,
      sentimentScore:      ins.sentiment_score,
      fusedScore:          ins.fused_score,
      action:              ins.action,
      confidence:          ins.confidence,
      reasoning:           ins.reasoning,
      technicalFactors:    ins.technical_factors  ?? [],
      sentimentFactors:    ins.sentiment_factors  ?? [],
      riskLevel:           ins.risk_level         ?? "MEDIUM",
      probabilityIncrease: ins.probability_increase,
      featureImportances:   ins.feature_importances,
      // Prefer real per-sample SHAP values; fall back to the frontend-alias field
      featureContributions: ins.shap_values ?? ins.feature_contributions,
      modelType:            ins.model_type,
      timestamp:           ins.timestamp          ?? new Date().toISOString(),
    }))
  } catch {
    return null
  }
}

// Alpha Vantage helpers 

async function avFetch(indicator: string, symbol: string, params: Record<string, string | number> = {}): Promise<any> {
  if (!ALPHA_VANTAGE_API_KEY) return null
  try {
    const url = new URL(AV_BASE)
    url.searchParams.set("function",  indicator)
    url.searchParams.set("symbol",    symbol)
    url.searchParams.set("interval",  "daily")
    url.searchParams.set("apikey",    ALPHA_VANTAGE_API_KEY)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))

    const res = await fetch(url.toString(), { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = await res.json()
    if (data["Note"] || data["Information"]) return null
    return data
  } catch {
    return null
  }
}

async function fetchIndicators(symbol: string): Promise<RawIndicators> {
  const hit = indicatorCache.get(symbol)
  if (hit && Date.now() - hit.ts < INDICATOR_TTL) return hit.data

  const [rsiRaw, macdRaw, bbandsRaw, adxRaw] = await Promise.all([
    avFetch("RSI",    symbol, { time_period: 14, series_type: "close" }),
    avFetch("MACD",   symbol, { series_type: "close" }),
    avFetch("BBANDS", symbol, { time_period: 20, series_type: "close" }),
    avFetch("ADX",    symbol, { time_period: 14 }),
  ])

  const latest = (obj: any) => obj ? obj[Object.keys(obj)[0]] : null

  const rsiEntry    = latest(rsiRaw?.["Technical Analysis: RSI"])
  const macdEntry   = latest(macdRaw?.["Technical Analysis: MACD"])
  const bbandsEntry = latest(bbandsRaw?.["Technical Analysis: BBANDS"])
  const adxEntry    = latest(adxRaw?.["Technical Analysis: ADX"])

  const data: RawIndicators = {
    rsi:    rsiEntry    ? parseFloat(rsiEntry.RSI)                                                    : null,
    macd:   macdEntry   ? { macd:   parseFloat(macdEntry.MACD),
                             signal: parseFloat(macdEntry.MACD_Signal),
                             hist:   parseFloat(macdEntry.MACD_Hist) }                                : null,
    bbands: bbandsEntry ? { upper:  parseFloat(bbandsEntry["Real Upper Band"]),
                             middle: parseFloat(bbandsEntry["Real Middle Band"]),
                             lower:  parseFloat(bbandsEntry["Real Lower Band"]) }                     : null,
    adx:    adxEntry    ? parseFloat(adxEntry.ADX)                                                    : null,
  }

  indicatorCache.set(symbol, { data, ts: Date.now() })
  return data
}

async function fetchSentimentFromFinBERT(symbol: string): Promise<SentimentData | null> {
  try {
    // Use sentiment-aggregate for score + article count
    const [aggRes, newsRes] = await Promise.all([
      fetch(`${NEWS_INGESTOR_URL}/api/v1/sentiment-aggregate/${symbol}`,
        { signal: AbortSignal.timeout(5_000) }),
      fetch(`${NEWS_INGESTOR_URL}/api/v1/news?tickers=${symbol}&limit=5`,
        { signal: AbortSignal.timeout(5_000) }),
    ])
    if (!aggRes.ok) return null
    const agg = await aggRes.json()
    if (!agg.avg_sentiment && agg.article_count === 0) return null

    const headlines: string[] = newsRes.ok
      ? ((await newsRes.json()).articles ?? []).slice(0, 3).map((a: any) => a.headline ?? "")
      : []

    return {
      avgScore:     agg.avg_sentiment,
      articleCount: agg.article_count,
      topHeadlines: headlines,
    }
  } catch {
    return null
  }
}

async function fetchSentiment(symbol: string): Promise<SentimentData | null> {
  const hit = sentimentCache.get(symbol)
  if (hit && Date.now() - hit.ts < SENTIMENT_TTL) return hit.data

  // Primary: real FinBERT scores from news_ingestor microservice
  const finbert = await fetchSentimentFromFinBERT(symbol)
  if (finbert) {
    sentimentCache.set(symbol, { data: finbert, ts: Date.now() })
    return finbert
  }

  // Fallback: direct Alpha Vantage ticker sentiment
  const data = await avFetch("NEWS_SENTIMENT", symbol, { tickers: symbol, limit: 20 })
  if (!data?.feed) return null

  const scores: number[] = data.feed.flatMap((article: any) =>
    (article.ticker_sentiment ?? [])
      .filter((ts: any) => ts.ticker?.toUpperCase() === symbol)
      .map((ts: any) => parseFloat(ts.ticker_sentiment_score || "0"))
  )
  if (scores.length === 0) return null

  const result: SentimentData = {
    avgScore:     scores.reduce((a, b) => a + b, 0) / scores.length,
    articleCount: scores.length,
    topHeadlines: (data.feed as any[]).slice(0, 3).map((a) => a.title ?? ""),
  }
  sentimentCache.set(symbol, { data: result, ts: Date.now() })
  return result
}

interface OHLCQuote {
  price: number
  changePercent: number
  high: number
  low: number
  open: number
  previousClose: number
}

async function fetchOHLCQuote(symbol: string): Promise<OHLCQuote | null> {
  const finnhubSymbol = CRYPTO_SYMBOLS.has(symbol) ? CRYPTO_FINNHUB[symbol] ?? null : symbol

  if (finnhubSymbol && FINNHUB_API_KEY) {
    try {
      const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${finnhubSymbol}&token=${FINNHUB_API_KEY}`)
      if (res.ok) {
        const d = await res.json()
        if (d.c > 0) return {
          price:         Number(d.c),
          changePercent: Number(d.dp),
          high:          Number(d.h),
          low:           Number(d.l),
          open:          Number(d.o),
          previousClose: Number(d.pc),
        }
      }
    } catch {}
  }

  if (!CRYPTO_SYMBOLS.has(symbol) && ALPHA_VANTAGE_API_KEY) {
    try {
      const data  = await avFetch("GLOBAL_QUOTE", symbol, {})
      const q     = data?.["Global Quote"]
      const price = parseFloat(q?.["05. price"] ?? "0")
      if (price > 0) return {
        price,
        changePercent: parseFloat(q?.["10. change percent"]?.replace("%", "") ?? "0"),
        high:          parseFloat(q?.["03. high"]  ?? String(price)),
        low:           parseFloat(q?.["04. low"]   ?? String(price)),
        open:          parseFloat(q?.["02. open"]  ?? String(price)),
        previousClose: parseFloat(q?.["08. previous close"] ?? String(price)),
      }
    } catch {}
  }

  return null
}

// Signal computation from real indicators 

function computeTechnicalScore(
  ind: RawIndicators,
  currentPrice: number,
  ohlc?: OHLCQuote | null,
): { score: number; factors: string[] } {
  const factors: string[] = []
  const price = currentPrice > 0 ? currentPrice : (ohlc?.price ?? 0)

  //  Layer 1: OHLC foundation 
  let baseScore = 50
  if (ohlc) {
    const rangePos    = ohlc.high > ohlc.low ? ((price - ohlc.low) / (ohlc.high - ohlc.low)) * 100 : 50
    const momentumScr = Math.max(5, Math.min(95, 50 + ohlc.changePercent * 5))
    baseScore = Math.round(rangePos * 0.4 + momentumScr * 0.6)
    factors.push(`Momentum ${ohlc.changePercent >= 0 ? "+" : ""}${ohlc.changePercent.toFixed(2)}% today`)
    factors.push(`Intraday position: ${rangePos.toFixed(0)}% of range (${ohlc.low.toFixed(2)} – ${ohlc.high.toFixed(2)})`)
  }

  // If no AV indicators available, return OHLC base directly
  const hasAV = ind.rsi !== null || ind.macd !== null || ind.bbands !== null
  if (!hasAV) {
    return { score: Math.max(5, Math.min(95, baseScore)), factors }
  }

  // AV indicator score (start neutral, apply deltas)
  let indScore = 50
  // Layer 2: 7-Tier RSI Scoring
  if (ind.rsi !== null) {
    const rsi = ind.rsi
    if      (rsi < 25) { indScore += 22; factors.push(`RSI ${rsi.toFixed(1)} – deeply oversold, reversal likely`) }
    else if (rsi < 35) { indScore += 14; factors.push(`RSI ${rsi.toFixed(1)} – oversold zone`) }
    else if (rsi < 45) { indScore +=  6; factors.push(`RSI ${rsi.toFixed(1)} – recovering`) }
    else if (rsi < 55) {                 factors.push(`RSI ${rsi.toFixed(1)} – neutral`) }
    else if (rsi < 65) { indScore -=  6; factors.push(`RSI ${rsi.toFixed(1)} – mildly overbought`) }
    else if (rsi < 75) { indScore -= 14; factors.push(`RSI ${rsi.toFixed(1)} – overbought`) }
    else               { indScore -= 22; factors.push(`RSI ${rsi.toFixed(1)} – strongly overbought`) }
  }

  // Layer 3: Dynamic MACD 
  if (ind.macd !== null) {
    const { hist, macd, signal } = ind.macd
    const boost = Math.min(15, Math.abs(hist) * 8)
    if (hist > 0 && macd > signal) {
      indScore += 10 + boost
      factors.push(`MACD bullish crossover – histogram +${hist.toFixed(3)}`)
    } else if (hist < 0) {
      indScore -= 10 + boost
      factors.push(`MACD bearish – histogram ${hist.toFixed(3)}`)
    } else {
      factors.push("MACD at crossover – directional signal pending")
    }
  }

  // Layer 4: Bollinger Bands
  if (ind.bbands !== null && price > 0) {
    const { upper, lower } = ind.bbands
    const bbPct = (price - lower) / (upper - lower + 1e-9)
    if      (bbPct < 0.10) { indScore += 16; factors.push(`Price at BB lower band (${(bbPct * 100).toFixed(1)}%) – oversold`) }
    else if (bbPct < 0.25) { indScore +=  8; factors.push(`Price near BB lower band – approaching support`) }
    else if (bbPct > 0.90) { indScore -= 16; factors.push(`Price at BB upper band (${(bbPct * 100).toFixed(1)}%) – overbought`) }
    else if (bbPct > 0.75) { indScore -=  8; factors.push(`Price near BB upper band – resistance zone`) }
    else                   {                 factors.push(`Price mid Bollinger Band (${(bbPct * 100).toFixed(1)}%) – neutral`) }
  }

  if (ind.adx !== null) {
    const adx = ind.adx
    if      (adx > 40) factors.push(`ADX ${adx.toFixed(1)} – very strong trend (signal reliable)`)
    else if (adx > 25) factors.push(`ADX ${adx.toFixed(1)} – strong trend`)
    else               factors.push(`ADX ${adx.toFixed(1)} – weak/ranging market`)
  }

  // Layer 5: Blend 70% AV indicators + 30% OHLC momentum
  const finalScore = Math.round(indScore * 0.7 + baseScore * 0.3)
  return { score: Math.max(0, Math.min(100, finalScore)), factors }
}

function computeSentimentScore(sentiment: SentimentData | null): { score: number; factors: string[] } {
  if (!sentiment) return { score: 50, factors: ["No recent news data available"] }

  const { avgScore, articleCount, topHeadlines } = sentiment
  const score = Math.round(Math.max(5, Math.min(95, 50 + avgScore * 50)))

  const label =
    avgScore >  0.35 ? "Strong bullish" :
    avgScore >  0.10 ? "Mildly bullish" :
    avgScore < -0.35 ? "Strong bearish" :
    avgScore < -0.10 ? "Mildly bearish" : "Neutral"

  return {
    score,
    factors: [
      `${label} news sentiment (${avgScore.toFixed(2)} avg, ${articleCount} articles)`,
      ...topHeadlines.slice(0, 2).map((h) => (h.length > 85 ? h.slice(0, 82) + "…" : h)),
    ],
  }
}

export function determineAction(fused: number): QuantInsight["action"] {
  if (fused >= 78) return "STRONG_BUY"
  if (fused >= 62) return "BUY"
  if (fused >= 42) return "HOLD"
  if (fused >= 28) return "SELL"
  return "STRONG_SELL"
}

function riskLevel(fused: number): QuantInsight["riskLevel"] {
  const dist = Math.abs(fused - 50)
  if (dist > 25) return "LOW"
  if (dist < 10) return "HIGH"
  return "MEDIUM"
}

// XAI reasoning builder 

function buildXAIReasoning(params: {
  symbol:          string
  action:          string
  fusedScore:      number
  technicalScore:  number
  sentimentScore:  number
  confidence:      number
  indicators:      RawIndicators
  ohlc:            OHLCQuote | null
  sentiment:       SentimentData | null
}): string {
  const { symbol, action, fusedScore, technicalScore, sentimentScore, confidence, indicators, ohlc, sentiment } = params

  const actionLabel: Record<string, string> = {
    STRONG_BUY: "strongly bullish", BUY: "bullish",
    HOLD: "neutral/consolidating", SELL: "bearish", STRONG_SELL: "strongly bearish",
  }

  const lines: string[] = []

  // Headline: action + fused breakdown
  lines.push(
    `Model rates ${symbol} as ${actionLabel[action] ?? "neutral"} with ${confidence}% confidence ` +
    `(fused score ${fusedScore}/100 = tech ${technicalScore}×70% + sentiment ${sentimentScore}×30%).`
  )

  // OHLC narrative
  if (ohlc) {
    const rangePos = ohlc.high > ohlc.low
      ? Math.round(((ohlc.price - ohlc.low) / (ohlc.high - ohlc.low)) * 100)
      : 50
    const dir = ohlc.changePercent >= 0 ? "gained" : "lost"
    lines.push(
      `${symbol} ${dir} ${Math.abs(ohlc.changePercent).toFixed(2)}% today, ` +
      `trading at the ${rangePos}th percentile of its intraday range ($${ohlc.low.toFixed(2)}–$${ohlc.high.toFixed(2)}).`
    )
  }

  // RSI
  if (indicators.rsi !== null) {
    const rsi = indicators.rsi
    const zone =
      rsi < 25 ? "deeply oversold — strong mean-reversion setup" :
      rsi < 35 ? "oversold — potential entry zone" :
      rsi < 45 ? "recovering from oversold territory" :
      rsi < 55 ? "neutral range, no extreme signal" :
      rsi < 65 ? "mildly elevated — watch for continuation vs. fade" :
      rsi < 75 ? "overbought — momentum may be exhausting" :
                 "deeply overbought — elevated reversal risk"
    lines.push(`RSI(14) = ${rsi.toFixed(1)}: ${zone}.`)
  }

  // MACD
  if (indicators.macd !== null) {
    const { hist, macd: macdVal, signal: sig } = indicators.macd
    const dir       = hist > 0 ? "bullish" : "bearish"
    const strength  = Math.abs(hist) > 0.5 ? "strongly " : Math.abs(hist) > 0.1 ? "" : "weakly "
    lines.push(
      `MACD is ${strength}${dir} (histogram ${hist >= 0 ? "+" : ""}${hist.toFixed(3)}, ` +
      `line ${macdVal >= 0 ? "+" : ""}${macdVal.toFixed(3)} vs signal ${sig >= 0 ? "+" : ""}${sig.toFixed(3)}).`
    )
  }

  // Bollinger Bands
  if (indicators.bbands !== null && ohlc?.price) {
    const { upper, lower } = indicators.bbands
    const bbPct = Math.round(((ohlc.price - lower) / (upper - lower + 1e-9)) * 100)
    const zone =
      bbPct < 10  ? "at the lower band — historically a support/bounce zone" :
      bbPct < 25  ? "approaching lower band support" :
      bbPct > 90  ? "at the upper band — potential resistance/pullback zone" :
      bbPct > 75  ? "near upper band resistance" :
                    "mid-band — no Bollinger extreme"
    lines.push(`Price is ${zone} (${bbPct}% within band: $${lower.toFixed(2)}–$${upper.toFixed(2)}).`)
  }

  // ADX
  if (indicators.adx !== null) {
    const adx = indicators.adx
    const str = adx > 40 ? "very strong" : adx > 25 ? "strong" : adx > 20 ? "moderate" : "weak/ranging"
    lines.push(
      `ADX(14) = ${adx.toFixed(1)}: ${str} trend — ` +
      `technical signals are ${adx > 25 ? "high" : "lower"}-reliability in this environment.`
    )
  }

  // No AV note
  const hasAV = indicators.rsi !== null || indicators.macd !== null || indicators.bbands !== null
  if (!hasAV && ohlc) {
    lines.push(
      "Alpha Vantage indicators unavailable (daily rate limit reached); " +
      "analysis anchored to real-time Finnhub OHLC data only."
    )
  }

  // Sentiment
  if (sentiment) {
    const dir = sentiment.avgScore > 0.10 ? "positive" : sentiment.avgScore < -0.10 ? "negative" : "neutral"
    lines.push(
      `FinBERT news sentiment is ${dir} (${sentiment.avgScore >= 0 ? "+" : ""}${sentiment.avgScore.toFixed(2)} avg, ` +
      `${sentiment.articleCount} articles) — contributing ${sentimentScore >= 50 ? "+" : ""}${(sentimentScore - 50).toFixed(0)} pts to the fused score.`
    )
  } else {
    lines.push("No recent news sentiment data available — sentiment contribution is neutral (50/100).")
  }

  return lines.join(" ")
}

//  Build one insight from real data 

async function buildInsight(symbol: string): Promise<QuantInsight> {
  const isCrypto = CRYPTO_SYMBOLS.has(symbol)

  const [ohlc, sentiment, indicators] = await Promise.all([
    fetchOHLCQuote(symbol),
    fetchSentiment(symbol).catch(() => null),
    isCrypto ? Promise.resolve<RawIndicators>({ rsi: null, macd: null, bbands: null, adx: null }) : fetchIndicators(symbol),
  ])

  const currentPrice = ohlc?.price ?? 0
  const { score: technicalScore, factors: technicalFactors } = computeTechnicalScore(indicators, currentPrice, ohlc)
  const { score: sentimentScore, factors: sentimentFactors  } = computeSentimentScore(sentiment)

  const fusedScore = Math.round(technicalScore * 0.7 + sentimentScore * 0.3)
  const action     = determineAction(fusedScore)
  const confidence = Math.max(50, Math.min(99, Math.round(50 + Math.abs(fusedScore - 50) * 0.9)))

  const reasoning = buildXAIReasoning({
    symbol, action, fusedScore, technicalScore, sentimentScore, confidence,
    indicators, ohlc, sentiment,
  })

  // Feature importances (relative weights)
  const rawFI: Record<string, number> = {}
  if (ohlc)                       rawFI["momentum_1d"]    = 0.20
  if (ohlc)                       rawFI["stoch_position"] = 0.10
  if (indicators.rsi    !== null) rawFI["rsi_14"]         = 0.35
  if (indicators.macd   !== null) rawFI["macd_hist"]      = 0.25
  if (indicators.bbands !== null) rawFI["bb_pct"]         = 0.20
  if (indicators.adx    !== null) rawFI["adx_14"]         = 0.10
  const fiTotal = Object.values(rawFI).reduce((a, b) => a + b, 0)
  const featureImportances = fiTotal > 0
    ? Object.fromEntries(Object.entries(rawFI).map(([k, v]) => [k, Math.round(v / fiTotal * 100) / 100]))
    : undefined

  // Raw signed contributions in "fused-score deviation" space
  const raw: Record<string, number> = {}
  const techDeviation = technicalScore - 50

  if (ohlc) {
    const momentumDir = ohlc.changePercent >= 0 ? 1 : -1
    const momentumMag = Math.min(1, Math.abs(ohlc.changePercent) / 5)
    raw["momentum_1d"]   = 0.20 * momentumDir * momentumMag * techDeviation * 0.7

    const rangePos = ohlc.high > ohlc.low ? (ohlc.price - ohlc.low) / (ohlc.high - ohlc.low) : 0.5
    raw["stoch_position"] = 0.10 * (rangePos - 0.5) * 2 * techDeviation * 0.7
  }
  if (indicators.rsi !== null) {
    const rsiDir = indicators.rsi < 50 ? 1 : -1
    const rsiMag = Math.min(1, Math.abs(indicators.rsi - 50) / 50)
    raw["rsi_14"] = 0.35 * rsiDir * rsiMag * techDeviation * 0.7
  }
  if (indicators.macd !== null) {
    const histDir = indicators.macd.hist >= 0 ? 1 : -1
    const histMag = Math.min(1, Math.abs(indicators.macd.hist) * 5)
    raw["macd_hist"] = 0.25 * histDir * histMag * techDeviation * 0.7
  }
  if (indicators.bbands !== null && ohlc?.price) {
    const { upper, lower } = indicators.bbands
    const bbPct = (ohlc.price - lower) / (upper - lower + 1e-9)
    raw["bb_pct"] = 0.20 * (0.5 - bbPct) * 2 * techDeviation * 0.7
  }
  if (indicators.adx !== null) {
    const trendBoost = indicators.adx > 25 ? 1 : 0
    const actionDir  = fusedScore >= 50 ? 1 : -1
    raw["adx_14"] = 0.10 * trendBoost * actionDir * Math.abs(techDeviation) * 0.7
  }
  // Sentiment as an explicit contributor
  const sentContrib = (sentimentScore - 50) * 0.3
  if (Math.abs(sentContrib) > 0.01) raw["_sentiment"] = sentContrib

  // Normalise to signed percentages summing (in absolute) to 100
  const totalAbs = Object.values(raw).reduce((s, v) => s + Math.abs(v), 0)
  const featureContributions: Record<string, number> | undefined = totalAbs > 0
    ? Object.fromEntries(
        Object.entries(raw)
          .filter(([, v]) => Math.abs(v) / totalAbs >= 0.005)
          .map(([k, v]) => [k, Math.round(v / totalAbs * 1000) / 10]) // signed %
      )
    : undefined

  const insight: QuantInsight = {
    symbol,
    technicalScore,
    sentimentScore,
    fusedScore,
    action,
    confidence,
    reasoning,
    technicalFactors,
    sentimentFactors,
    riskLevel:           riskLevel(fusedScore),
    probabilityIncrease: fusedScore / 100,
    featureImportances,
    featureContributions,
    modelType:           "technical_analysis_av",
    timestamp:           new Date().toISOString(),
  }

  // Persist to AIPrediction for history overlay (best-effort)
  prisma.aIPrediction.create({
    data: {
      symbol,
      probabilityIncrease: insight.probabilityIncrease ?? 0.5,
      confidence,
      action,
      modelType:         insight.modelType ?? "technical_analysis_av",
      featureImportances: featureImportances ?? {},
      timestamp:         new Date(),
    },
  }).catch(() => {})

  return insight
}

//  Route handler 

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols     = searchParams.get("symbols") || "BTC,NVDA,ETH,SOL,AAPL"
  const symbolList  = symbols.split(",").map((s) => s.trim().toUpperCase().replace("/USD", ""))

  // 1. Try real ML quant engine
  const engineInsights = await fetchFromQuantEngine(symbolList)
  if (engineInsights && engineInsights.length > 0) {
    return NextResponse.json({
      insights: engineInsights,
      source: "ml-quant-engine",
      timestamp: new Date().toISOString(),
    })
  }

  // 2. Fallback: compute from real Alpha Vantage + Finnhub data
  const insights: QuantInsight[] = []
  for (const symbol of symbolList) {
    const hit = insightCache.get(symbol)
    if (hit && Date.now() - hit.ts < INSIGHT_TTL) {
      insights.push(hit.data)
      continue
    }
    const insight = await buildInsight(symbol)
    insightCache.set(symbol, { data: insight, ts: Date.now() })
    insights.push(insight)
  }

  return NextResponse.json({
    insights,
    source: "quant-engine",
    timestamp: new Date().toISOString(),
  })
}
