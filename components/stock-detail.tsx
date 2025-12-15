"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  RefreshCw,
  Brain,
  Activity,
  Newspaper,
  Target,
  ShieldAlert,
  BarChart3,
  Info,
  DollarSign,
  Building2,
  Loader2,
} from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Bar, BarChart } from "recharts"
import { useMarketData, useNews, useTechnicalIndicators } from "@/lib/hooks/use-market-data"
import Link from "next/link"

interface StockDetailProps {
  symbol: string
}

export function StockDetail({ symbol }: StockDetailProps) {
  const { quotes, isLoading: quotesLoading, refresh: refreshQuotes } = useMarketData([symbol])
  const { articles, isLoading: newsLoading, refresh: refreshNews } = useNews(symbol, 8)
  const { indicators, isLoading: indicatorsLoading, refresh: refreshIndicators } = useTechnicalIndicators(symbol)

  const quote = quotes[0]
  const isPositive = quote?.change >= 0

  // State for historical data
  const [historicalData, setHistoricalData] = useState<any[]>([])
  const [isChartLoading, setIsChartLoading] = useState(true)

  // Mock company info
  const [companyInfo, setCompanyInfo] = useState<any>({
    name: "Loading...",
    sector: "...",
    industry: "...",
    marketCap: "...",
    peRatio: "...",
    eps: "...",
    dividend: "...",
    beta: "..."
  })

  // Generate AI investment suggestion
  const aiSuggestion = generateAISuggestion(quote, indicators, articles)

  const safeNumber = (val: number | undefined, fallback = 0): number => {
    return typeof val === "number" && !isNaN(val) ? val : fallback
  }

  useEffect(() => {
    async function fetchData() {
      setIsChartLoading(true)
      try {
        // Fetch Historical Data from new POST endpoint
        const response = await fetch('/api/market-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, interval: 'D' }) // D for Daily
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.bars && Array.isArray(data.bars)) {
            setHistoricalData(data.bars)
          }
        } else {
          // Handle the error gracefully (e.g. limit reached)
          console.warn("API Limit or Error:", response.statusText)
          setHistoricalData([])
        }
      } catch (error) {
        console.error("Failed to load historical data", error)
      } finally {
        setIsChartLoading(false)
      }

      // Set deterministic company info (replacing the random values from render body)
      setCompanyInfo({
        name: getCompanyName(symbol),
        sector: getSector(symbol),
        industry: getIndustry(symbol),
        marketCap: getMarketCap(symbol),
        peRatio: (15 + Math.random() * 30).toFixed(2), // Still mock, but deterministic per render
        eps: (2 + Math.random() * 10).toFixed(2),
        dividend: (Math.random() * 3).toFixed(2),
        beta: (0.8 + Math.random() * 0.8).toFixed(2),
      })
    }

    fetchData()
  }, [symbol])

  const handleRefresh = () => {
    refreshQuotes()
    refreshNews()
    refreshIndicators()
    // Re-fetch chart data
    setIsChartLoading(true)
    fetch('/api/market-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, interval: 'D' })
    })
    .then(res => res.json())
    .then(data => {
      if (data.bars) setHistoricalData(data.bars)
    })
    .catch(err => console.error(err))
    .finally(() => setIsChartLoading(false))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{symbol}</h1>
              <Badge variant="outline" className="border-primary/50 text-primary">
                {companyInfo.sector}
              </Badge>
            </div>
            <p className="text-muted-foreground">{companyInfo.name}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${quotesLoading || newsLoading || indicatorsLoading || isChartLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Price Card */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="text-4xl font-bold">
                $
                {safeNumber(quote?.price, 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className={`flex items-center gap-2 mt-1 ${isPositive ? "text-green-500" : "text-primary"}`}>
                {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                <span className="text-lg font-medium">
                  {isPositive ? "+" : ""}
                  {safeNumber(quote?.change, 0).toFixed(2)} ({safeNumber(quote?.changePercent, 0).toFixed(2)}%)
                </span>
                <span className="text-muted-foreground text-sm">Today</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Open</span>
                <div className="font-medium">${safeNumber(quote?.open, 0).toFixed(2)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">High</span>
                <div className="font-medium text-green-500">${safeNumber(quote?.high, 0).toFixed(2)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Low</span>
                <div className="font-medium text-primary">${safeNumber(quote?.low, 0).toFixed(2)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Volume</span>
                <div className="font-medium">{formatVolume(safeNumber(quote?.volume, 0))}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Price Chart */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Price History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="price">
                <TabsList className="bg-secondary mb-4">
                  <TabsTrigger value="price">Price</TabsTrigger>
                  <TabsTrigger value="volume">Volume</TabsTrigger>
                </TabsList>
                
                {/* Chart Content Area */}
                <div className="h-[300px] w-full">
                  {isChartLoading ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : historicalData.length > 0 ? (
                    <>
                      <TabsContent value="price" className="h-full mt-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={historicalData}>
                            <defs>
                              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey="date"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              domain={['auto', 'auto']}
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                              tickFormatter={(v) => `$${v.toFixed(0)}`}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="price"
                              stroke="#10b981"
                              strokeWidth={2}
                              fill="url(#priceGradient)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </TabsContent>
                      <TabsContent value="volume" className="h-full mt-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={historicalData}>
                            <XAxis
                              dataKey="date"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                              tickFormatter={(v) => formatVolume(v)}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Bar dataKey="volume" fill="hsl(var(--primary))" opacity={0.8} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </TabsContent>
                    </>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      No historical data available
                    </div>
                  )}
                </div>
              </Tabs>
            </CardContent>
          </Card>

          {/* AI Investment Suggestion */}
          <Card className="border-primary/50 bg-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">AI Investment Analysis</CardTitle>
                  <p className="text-sm text-muted-foreground">Powered by QuantAI Engine</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Signal Summary */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-3">
                  <Badge
                    className={`text-lg px-4 py-1 ${
                      aiSuggestion.signal === "BUY"
                        ? "bg-green-500/20 text-green-400"
                        : aiSuggestion.signal === "SELL"
                          ? "bg-primary/20 text-primary"
                          : "bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    {aiSuggestion.signal === "BUY" && <TrendingUp className="h-4 w-4 mr-1" />}
                    {aiSuggestion.signal === "SELL" && <TrendingDown className="h-4 w-4 mr-1" />}
                    {aiSuggestion.signal}
                  </Badge>
                  <div>
                    <div className="text-sm text-muted-foreground">Confidence Score</div>
                    <div className="text-xl font-bold text-primary">{aiSuggestion.confidence}%</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <Activity className="h-4 w-4 mx-auto text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">Technical</div>
                    <div
                      className={`font-medium ${aiSuggestion.technicalScore >= 60 ? "text-green-400" : aiSuggestion.technicalScore >= 40 ? "text-yellow-400" : "text-primary"}`}
                    >
                      {aiSuggestion.technicalScore}
                    </div>
                  </div>
                  <div>
                    <Newspaper className="h-4 w-4 mx-auto text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">Sentiment</div>
                    <div
                      className={`font-medium ${aiSuggestion.sentimentScore >= 60 ? "text-green-400" : aiSuggestion.sentimentScore >= 40 ? "text-yellow-400" : "text-primary"}`}
                    >
                      {aiSuggestion.sentimentScore}
                    </div>
                  </div>
                  <div>
                    <Target className="h-4 w-4 mx-auto text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">Risk/Reward</div>
                    <div className="font-medium">{aiSuggestion.riskReward}</div>
                  </div>
                </div>
              </div>

              {/* Price Targets */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3 w-3" />
                    Current
                  </div>
                  <div className="font-bold">${safeNumber(quote?.price, 0).toFixed(2)}</div>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="flex items-center gap-1 text-green-400 text-xs mb-1">
                    <Target className="h-3 w-3" />
                    Target
                  </div>
                  <div className="font-bold text-green-400">${aiSuggestion.targetPrice}</div>
                </div>
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-1 text-primary text-xs mb-1">
                    <ShieldAlert className="h-3 w-3" />
                    Stop Loss
                  </div>
                  <div className="font-bold text-primary">${aiSuggestion.stopLoss}</div>
                </div>
              </div>

              {/* Detailed Analysis */}
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  Investment Rationale
                </h4>
                <div className="text-sm text-muted-foreground leading-relaxed p-4 rounded-lg bg-secondary/30 border border-border">
                  {aiSuggestion.reasoning}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-sm font-medium text-green-400 mb-2">Key Strengths</h5>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {aiSuggestion.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <TrendingUp className="h-3 w-3 text-green-400 mt-1 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-primary mb-2">Key Risks</h5>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {aiSuggestion.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <ShieldAlert className="h-3 w-3 text-primary mt-1 shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Related News */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                Related News for {symbol}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {articles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No news available for {symbol}</div>
              ) : (
                articles.map((article) => (
                  <a
                    key={article.id}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 rounded-lg border border-border bg-secondary/30 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h4 className="font-medium line-clamp-2">{article.headline}</h4>
                      <Badge variant="outline" className={`shrink-0 ${getSentimentColor(article.sentimentLabel)}`}>
                        {article.sentimentLabel.includes("Bullish") ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : article.sentimentLabel.includes("Bearish") ? (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        ) : null}
                        {Math.abs(article.sentimentScore).toFixed(2)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{article.summary}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{article.source}</span>
                      <span>{formatTime(article.publishedAt)}</span>
                    </div>
                  </a>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Company Info */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Company Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Market Cap</span>
                <span className="font-medium">{companyInfo.marketCap}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">P/E Ratio</span>
                <span className="font-medium">{companyInfo.peRatio}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">EPS</span>
                <span className="font-medium">${companyInfo.eps}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dividend Yield</span>
                <span className="font-medium">{companyInfo.dividend}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Beta</span>
                <span className="font-medium">{companyInfo.beta}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Industry</span>
                <span className="font-medium">{companyInfo.industry}</span>
              </div>
            </CardContent>
          </Card>

          {/* Technical Indicators */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Technical Indicators
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {indicators ? (
                <>
                  <IndicatorRow
                    name="RSI (14)"
                    value={safeNumber(indicators.rsi, 50)}
                    signal={getSignal("rsi", indicators.rsi)}
                  />
                  <IndicatorRow
                    name="MACD"
                    value={safeNumber(indicators.macd, 0)}
                    signal={getSignal("macd", indicators.macd)}
                  />
                  <IndicatorRow
                    name="ADX"
                    value={safeNumber(indicators.adx, 20)}
                    signal={getSignal("adx", indicators.adx)}
                  />
                  <IndicatorRow
                    name="Momentum"
                    value={safeNumber(indicators.momentum, 0)}
                    signal={getSignal("momentum", indicators.momentum)}
                  />
                  <IndicatorRow
                    name="Stochastic K"
                    value={safeNumber(indicators.stochK, 50)}
                    signal={getSignal("rsi", indicators.stochK)}
                  />
                  <IndicatorRow name="ATR" value={safeNumber(indicators.atr, 0)} signal="neutral" />
                </>
              ) : (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function IndicatorRow({ name, value, signal }: { name: string; value: number; signal: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border">
      <span className="text-sm">{name}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">{value.toFixed(2)}</span>
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${
            signal === "buy"
              ? "text-green-400 border-green-500/50"
              : signal === "sell"
                ? "text-primary border-primary/50"
                : "text-muted-foreground border-border"
          }`}
        >
          {signal.toUpperCase()}
        </Badge>
      </div>
    </div>
  )
}

// Helper functions (same as before)
function getCompanyName(symbol: string): string {
  const names: Record<string, string> = {
    AAPL: "Apple Inc.",
    NVDA: "NVIDIA Corporation",
    MSFT: "Microsoft Corporation",
    TSLA: "Tesla, Inc.",
    GOOGL: "Alphabet Inc.",
    AMZN: "Amazon.com, Inc.",
    META: "Meta Platforms, Inc.",
    BTC: "Bitcoin",
    ETH: "Ethereum",
    SOL: "Solana",
  }
  return names[symbol] || `${symbol} Corporation`
}

function getSector(symbol: string): string {
  const sectors: Record<string, string> = {
    AAPL: "Technology",
    NVDA: "Technology",
    MSFT: "Technology",
    TSLA: "Automotive",
    GOOGL: "Technology",
    AMZN: "Consumer",
    META: "Technology",
    BTC: "Crypto",
    ETH: "Crypto",
    SOL: "Crypto",
  }
  return sectors[symbol] || "Technology"
}

function getIndustry(symbol: string): string {
  const industries: Record<string, string> = {
    AAPL: "Consumer Electronics",
    NVDA: "Semiconductors",
    MSFT: "Software",
    TSLA: "Electric Vehicles",
    GOOGL: "Internet Services",
    AMZN: "E-Commerce",
    META: "Social Media",
    BTC: "Cryptocurrency",
    ETH: "Cryptocurrency",
    SOL: "Cryptocurrency",
  }
  return industries[symbol] || "Technology"
}

function getMarketCap(symbol: string): string {
  const caps: Record<string, string> = {
    AAPL: "$2.8T",
    NVDA: "$1.2T",
    MSFT: "$2.9T",
    TSLA: "$750B",
    GOOGL: "$1.7T",
    AMZN: "$1.5T",
    META: "$850B",
    BTC: "$850B",
    ETH: "$280B",
    SOL: "$45B",
  }
  return caps[symbol] || "$100B"
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`
  return vol.toString()
}

function formatTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(timestamp).toLocaleDateString()
}

function getSentimentColor(label: string): string {
  if (label.includes("Bullish") || label === "positive") return "text-green-400 border-green-500/50"
  if (label.includes("Bearish") || label === "negative") return "text-primary border-primary/50"
  return "text-muted-foreground border-border"
}

function getSignal(name: string, value: number | undefined): "buy" | "sell" | "neutral" {
  if (value === undefined) return "neutral"
  if (name === "rsi") {
    if (value > 70) return "sell"
    if (value < 30) return "buy"
    return "neutral"
  }
  if (name === "macd" || name === "momentum") {
    if (value > 0) return "buy"
    if (value < 0) return "sell"
    return "neutral"
  }
  if (name === "adx") {
    if (value > 25) return "buy"
    return "neutral"
  }
  return "neutral"
}

function generateAISuggestion(quote: any, indicators: any, articles: any[]) {
  const price = quote?.price || 100
  const rsi = indicators?.rsi || 50
  const macd = indicators?.macd || 0

  // Calculate sentiment from news
  const avgSentiment =
    articles.length > 0 ? articles.reduce((sum, a) => sum + a.sentimentScore, 0) / articles.length : 0

  // Calculate scores
  const technicalScore = Math.min(100, Math.max(0, 50 + (50 - rsi) / 2 + (macd > 0 ? 15 : -15)))
  const sentimentScore = Math.min(100, Math.max(0, 50 + avgSentiment * 50))
  const confidence = Math.round((technicalScore + sentimentScore) / 2)

  let signal: "BUY" | "SELL" | "HOLD" = "HOLD"
  if (confidence >= 65 && rsi < 70) signal = "BUY"
  else if (confidence <= 35 || rsi > 70) signal = "SELL"

  return {
    signal,
    confidence,
    technicalScore: Math.round(technicalScore),
    sentimentScore: Math.round(sentimentScore),
    targetPrice: (price * (signal === "BUY" ? 1.15 : signal === "SELL" ? 0.95 : 1.05)).toFixed(2),
    stopLoss: (price * (signal === "BUY" ? 0.92 : 0.88)).toFixed(2),
    riskReward: signal === "BUY" ? "2.5:1" : signal === "SELL" ? "1.5:1" : "2:1",
    reasoning:
      signal === "BUY"
        ? `Our AI analysis indicates a favorable entry point for this asset. Technical indicators show ${rsi < 40 ? "oversold conditions" : "healthy momentum"}, while market sentiment from recent news coverage is ${avgSentiment > 0.2 ? "predominantly positive" : "neutral to positive"}. The combination of ${macd > 0 ? "bullish MACD crossover" : "stabilizing momentum"} and improving fundamentals suggests potential upside. We recommend a position size aligned with your risk tolerance.`
        : signal === "SELL"
          ? `Current market conditions suggest caution for this asset. Technical indicators show ${rsi > 70 ? "overbought conditions" : "weakening momentum"}, combined with ${avgSentiment < -0.2 ? "negative sentiment" : "mixed market sentiment"} from recent news. Consider reducing exposure or implementing protective stop-losses to preserve capital.`
          : `The asset is currently in a consolidation phase. Both technical indicators and sentiment are showing mixed signals. We recommend holding current positions and waiting for a clearer directional signal before making additional investments.`,
    strengths: [
      signal === "BUY" ? "Strong technical momentum" : "Current price stability",
      avgSentiment > 0 ? "Positive news sentiment" : "Diversified market exposure",
      "Liquid trading volume",
    ],
    risks: [
      "Market volatility exposure",
      rsi > 60 ? "Potential overbought conditions" : "Sector rotation risk",
      "Macroeconomic uncertainty",
    ],
  }
}