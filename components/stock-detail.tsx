"use client"
import { useState, useEffect, useRef, useCallback } from "react"
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
  Cpu,
} from "lucide-react"
import { 
  Area, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Line, 
  ComposedChart, 
  Bar, 
  BarChart 
} from "recharts"
import { 
  useMarketData, 
  useNews, 
  useTechnicalIndicators, 
  useQuantInsights 
} from "@/lib/hooks/use-market-data"
import Link from "next/link"

interface StockDetailProps {
  symbol: string
}

export function StockDetail({ symbol }: StockDetailProps) {
  const { quotes, isLoading: quotesLoading, refresh: refreshQuotes } = useMarketData([symbol])
  const { articles, isLoading: newsLoading, refresh: refreshNews } = useNews(symbol, 8)
  const { indicators, isLoading: indicatorsLoading, refresh: refreshIndicators } = useTechnicalIndicators(symbol)
  // Fetch latest ML metadata for the overlay badge and model info
  const { insights } = useQuantInsights([symbol])

  const quote = quotes[0]
  const insight = insights?.[0]
  const isPositive = quote?.change >= 0

  // State for historical data (Price + AI Probability)
  const [historicalData, setHistoricalData] = useState<any[]>([])
  const [isChartLoading, setIsChartLoading] = useState(true)
  const [isStale, setIsStale]               = useState(false)
  const [staleSince, setStaleSince]         = useState<string | null>(null)

  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const symbolRef    = useRef(symbol)
  const insightRef   = useRef(insight)
  symbolRef.current  = symbol
  insightRef.current = insight

  const [companyInfo, setCompanyInfo] = useState<any>({
    name: "Loading...", sector: "...", industry: "...", marketCap: "...",
    peRatio: "...", eps: "...", dividend: "...", beta: "..."
  })

  const aiSuggestion = buildAISuggestion(insight, quote, articles)

  const safeNumber = (val: number | undefined, fallback = 0): number =>
    typeof val === "number" && !isNaN(val) ? val : fallback

  const clearRetry = useCallback(() => {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null }
  }, [])

  const fetchPriceHistory = useCallback(async (silent = false) => {
    if (!silent) setIsChartLoading(true)
    try {
      const [priceRes, aiRes] = await Promise.all([
        fetch("/api/market-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: symbolRef.current, interval: "D" }),
        }),
        fetch(`/api/quant-insights/history?symbol=${symbolRef.current}`),
      ])

      const aiHistory = aiRes.ok ? (await aiRes.json()).history ?? [] : []

      // Accept both 200 (fresh/stale) and handle 503 (no cache yet)
      const priceData = await priceRes.json()

      if (priceData.bars?.length > 0) {
        const combined = priceData.bars.map((bar: any) => {
          const match = aiHistory.find((h: any) =>
            new Date(h.timestamp).toLocaleDateString() === new Date(bar.date).toLocaleDateString()
          )
          return {
            ...bar,
            probability: match
              ? match.probabilityIncrease
              : (insightRef.current?.probabilityIncrease ?? 0.5),
          }
        })
        setHistoricalData(combined)

        if (priceData.stale) {
          setIsStale(true)
          setStaleSince(priceData.cachedAt ?? null)
          // Schedule a silent retry using the server's retryAfter hint
          clearRetry()
          retryTimer.current = setTimeout(
            () => fetchPriceHistory(true),
            (priceData.retryAfter ?? 60) * 1000
          )
        } else {
          setIsStale(false)
          setStaleSince(null)
          clearRetry()
        }
      } else {
        // No data at all — retry after hint (or 60s default)
        const retryAfter = (priceData.retryAfter ?? 60) * 1000
        clearRetry()
        retryTimer.current = setTimeout(() => fetchPriceHistory(true), retryAfter)
      }
    } catch (err) {
      console.error("Failed to load historical data", err)
      // Network error — retry in 30s
      clearRetry()
      retryTimer.current = setTimeout(() => fetchPriceHistory(true), 30_000)
    } finally {
      if (!silent) setIsChartLoading(false)
    }
  }, [clearRetry])

  useEffect(() => {
    fetchPriceHistory(false)
    return clearRetry
  }, [symbol, fetchPriceHistory, clearRetry])

  // Fetch company info once per symbol (doesn't need retry — cached 1h server-side)
  useEffect(() => {
    fetch(`/api/company-info?symbol=${symbol}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.info) return
        const { info } = d
        setCompanyInfo({
          name: info.name, sector: info.sector, industry: info.industry,
          marketCap: info.marketCap, peRatio: info.peRatio, eps: info.eps,
          dividend: info.dividendYield, beta: info.beta,
        })
      })
      .catch(() => {})
  }, [symbol])

  const handleRefresh = () => {
    refreshQuotes()
    refreshNews()
    refreshIndicators()
    clearRetry()
    fetchPriceHistory(false)
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
          
          {/* Enhanced Price Chart with AI Data Overlay */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Market Intelligence
                </div>
                <div className="flex items-center gap-2">
                  {isStale && (
                    <Badge variant="outline" className="text-yellow-400 border-yellow-500/50 font-mono text-[10px]">
                      <RefreshCw className="h-2.5 w-2.5 mr-1 animate-spin" />
                      Cached{staleSince ? ` · ${new Date(staleSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""} · updating…
                    </Badge>
                  )}
                  {insight && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 font-mono text-[10px]">
                      <Activity className="h-3 w-3 mr-1" /> Probability Overlay Active
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="price">
                <TabsList className="bg-secondary mb-4">
                  <TabsTrigger value="price">Price + AI Overlay</TabsTrigger>
                  <TabsTrigger value="volume">Volume</TabsTrigger>
                  <TabsTrigger value="ml_model">Model Analysis</TabsTrigger>
                </TabsList>
                
                <div className="h-[350px] w-full">
                  {isChartLoading ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : historicalData.length > 0 ? (
                    <>
                      <TabsContent value="price" className="h-full mt-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={historicalData}>
                            <defs>
                              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis
                              dataKey="date"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "#94a3b8", fontSize: 10 }}
                            />
                            {/* Left Y-Axis: Price */}
                            <YAxis
                              yAxisId="left"
                              orientation="left"
                              axisLine={false}
                              tickLine={false}
                              domain={['auto', 'auto']}
                              tick={{ fill: "#10b981", fontSize: 10 }}
                              tickFormatter={(v) => `$${v}`}
                            />
                            {/* Right Y-Axis: AI Probability */}
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              axisLine={false}
                              tickLine={false}
                              domain={[0, 1]}
                              tick={{ fill: "#6366f1", fontSize: 10 }}
                              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            {/* Area represents Price */}
                            <Area
                              yAxisId="left"
                              type="monotone"
                              dataKey="price"
                              stroke="#10b981"
                              strokeWidth={2}
                              fillOpacity={1}
                              name="Price"
                              fill="url(#priceGradient)"
                            />
                            {/* Line represents AI Probability */}
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="probability"
                              stroke="#6366f1"
                              strokeWidth={2}
                              dot={false}
                              strokeDasharray="5 5"
                              name="AI Probability"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                        <p className="text-[10px] text-muted-foreground text-center mt-2 font-mono italic">
                          Dashed line represents historical AI model probability of a price increase.
                        </p>
                      </TabsContent>
                      
                      <TabsContent value="volume" className="h-full mt-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={historicalData}>
                            <XAxis
                              dataKey="date"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "#94a3b8", fontSize: 10 }}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "#94a3b8", fontSize: 10 }}
                              tickFormatter={(v) => formatVolume(v)}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Bar dataKey="volume" fill="#10b981" opacity={0.6} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </TabsContent>

                      <TabsContent value="ml_model" className="h-full mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                          <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                              <h4 className="text-xs font-semibold text-primary uppercase mb-3 flex items-center gap-2">
                                <Cpu className="h-3 w-3" /> Model Specifications
                              </h4>
                              <div className="space-y-2 text-xs font-mono">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Engine Type</span>
                                  <span className="text-primary">{insight?.modelType || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Horizon</span>
                                  <span>5 Trading Days</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Fused Score</span>
                                  <span>{insight?.fusedScore ?? "—"}/100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Risk Level</span>
                                  <span className={insight?.riskLevel === "LOW" ? "text-green-400" : insight?.riskLevel === "HIGH" ? "text-red-400" : "text-yellow-400"}>
                                    {insight?.riskLevel ?? "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">ML Confidence</h4>
                              <div className={`text-2xl font-bold ${(insight?.confidence ?? 0) >= 70 ? "text-green-400" : (insight?.confidence ?? 0) >= 55 ? "text-yellow-400" : "text-muted-foreground"}`}>
                                {insight ? `${insight.confidence.toFixed(1)}%` : "—"}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                {insight ? "Live model confidence" : "Awaiting model sync"}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Key Prediction Drivers</h4>
                            {insight?.featureImportances ? (
                              Object.entries(insight.featureImportances)
                                .sort(([,a], [,b]) => (b as number) - (a as number))
                                .map(([feature, weight]) => (
                                  <div key={feature} className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="font-mono">{feature.replace('_', ' ')}</span>
                                      <span>{((weight as number) * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${(weight as number) * 100}%` }} />
                                    </div>
                                  </div>
                                ))
                            ) : (
                              <p className="text-xs text-muted-foreground">Data driver breakdown pending model sync.</p>
                            )}
                          </div>
                        </div>
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

                {/* SHAP-style Feature Attribution */}
                {aiSuggestion.shapValues.length > 0 && (
                  <div className="p-4 rounded-lg bg-secondary/30 border border-border space-y-2">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Activity className="h-3 w-3" /> SHAP Attribution
                    </h5>
                    {aiSuggestion.shapValues.map((s, i) => {
                      const positive = s.contribution >= 0
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-muted-foreground">{s.feature}</span>
                            <span className={positive ? "text-green-400" : "text-red-400"}>
                              {positive ? "▲" : "▼"} {s.pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${positive ? "bg-green-500" : "bg-red-500"}`}
                              style={{ width: `${s.pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                    <p className="text-[9px] text-muted-foreground/60 font-mono pt-1">
                      ▲ bullish · ▼ bearish · bar width and % = share of total prediction signal
                    </p>
                  </div>
                )}

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

function IndicatorRow({ name, value, signal }: { name: string; value: number | undefined; signal: string }) {
  const displayValue = typeof value === 'number' ? value.toFixed(2) : "0.00"

  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border">
      <span className="text-sm">{name}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">{displayValue}</span>
        <Badge
          variant="outline"
          className={`text-[8px] uppercase px-1.5 py-0 ${
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

const FEATURE_LABELS: Record<string, string> = {
  // TypeScript fallback keys (quant-insights/route.ts)
  momentum_1d:     "Day Momentum",
  stoch_position:  "Intraday Range Position",
  adx_14:          "Trend Strength (ADX)",
  // Python ML model feature names (FEATURE_COLS in predictive_model.py)
  ret_1d:          "1-Day Return",
  ret_3d:          "3-Day Return",
  ret_5d:          "5-Day Return",
  ret_10d:         "10-Day Return",
  ret_20d:         "20-Day Return",
  sma_5_ratio:     "Price / SMA5",
  sma_10_ratio:    "Price / SMA10",
  sma_20_ratio:    "Price / SMA20",
  sma_50_ratio:    "Price / SMA50",
  rsi_14:          "RSI(14)",
  macd:            "MACD Line",
  macd_signal:     "MACD Signal",
  macd_hist:       "MACD Histogram",
  bb_pct:          "Bollinger Band Position",
  bb_width:        "Bollinger Band Width",
  atr_14_pct:      "ATR(14) % of Price",
  vol_ratio_20:    "Volume vs 20-Day Avg",
  vol_trend:       "Volume Trend",
  momentum_10:     "10-Day Momentum",
  momentum_20:     "20-Day Momentum",
  stoch_k:         "Stochastic %K",
  stoch_d:         "Stochastic %D",
}

function buildAISuggestion(insight: any, quote: any, articles: any[]) {
  const price    = quote?.price || 0
  const high     = quote?.high  || price
  const low      = quote?.low   || price

  // ATR-based price targets
  const atrPct   = price > 0 ? (high - low) / price : 0.02
  const isBullish = insight?.action === "BUY" || insight?.action === "STRONG_BUY"
  const isBearish = insight?.action === "SELL" || insight?.action === "STRONG_SELL"

  const targetPrice = price > 0
    ? isBullish
      ? (price * (1 + atrPct * 3)).toFixed(2)
      : isBearish
        ? (price * (1 - atrPct * 2)).toFixed(2)
        : (price * (1 + atrPct)).toFixed(2)
    : "—"

  const stopLoss = price > 0
    ? isBullish
      ? (price * (1 - atrPct * 1.5)).toFixed(2)
      : (price * (1 - atrPct * 0.5)).toFixed(2)
    : "—"

  const upside   = price > 0 && targetPrice !== "—" ? parseFloat(targetPrice) - price : 0
  const downside = price > 0 && stopLoss    !== "—" ? price - parseFloat(stopLoss)    : 1
  const riskReward = downside > 0 ? `${(upside / downside).toFixed(1)}:1` : "—"

  // Signal display
  const actionMap: Record<string, "BUY" | "SELL" | "HOLD"> = {
    STRONG_BUY: "BUY", BUY: "BUY",
    HOLD:       "HOLD",
    SELL:       "SELL", STRONG_SELL: "SELL",
  }
  const signal = actionMap[insight?.action ?? "HOLD"] ?? "HOLD"

  // Scores from real ML; fall back to news sentiment when insight unavailable
  const avgNewsSentiment = articles.length > 0
    ? articles.reduce((sum: number, a: any) => sum + (a.sentimentScore ?? 0), 0) / articles.length
    : 0
  const technicalScore = insight?.technicalScore ?? 50
  const sentimentScore = insight?.sentimentScore ?? Math.round(50 + avgNewsSentiment * 50)
  const confidence     = insight?.confidence     ?? 50

  // Feature contributions are pre-normalized signed percentages (sum of |pct| = 100)
  // provided by the API. Each value is e.g. +45.0 (bullish, 45%) or -25.0 (bearish, 25%).
  const featureContributions: Record<string, number> = insight?.featureContributions ?? {}

  const shapValues = Object.entries(featureContributions)
    .map(([feature, signedPct]) => ({
      feature: FEATURE_LABELS[feature] ?? (feature === "_sentiment" ? "News Sentiment" : feature.replace(/_/g, " ")),
      pct:     Math.abs(signedPct),          // absolute percentage for bar width + label
      contribution: signedPct,               // signed: positive = bullish, negative = bearish
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6)

  // Strengths from technicalFactors/sentimentFactors with smarter classification
  const techFactors = insight?.technicalFactors ?? []
  const sentFactors = insight?.sentimentFactors ?? []
  const allFactors  = [...techFactors, ...sentFactors]

  const BULLISH_RE = /bullish|oversold|recovering|lower band|support|crossover.*\+|histogram \+|gained|positive|strong trend/i
  const BEARISH_RE = /bearish|overbought|upper band|resistance|histogram -|lost|negative|weak.*rang|ranging|fading|exhausting/i

  const strengths = allFactors.filter((f: string) => BULLISH_RE.test(f)).slice(0, 3)
  const risks     = allFactors.filter((f: string) => BEARISH_RE.test(f)).slice(0, 3)

  // Fallback strengths/risks when factors are empty
  const defaultStrengths = isBullish
    ? ["Positive technical momentum score", "Favorable risk/reward ratio"]
    : ["Current price stability", "Diversified market exposure"]

  const defaultRisks = [
    "Market volatility exposure",
    isBearish ? "Weakening technical momentum" : "Sector rotation risk",
    "Macroeconomic uncertainty",
  ]

  // Reasoning: prefer real ML reasoning, fallback to constructed text
  const reasoning = insight?.reasoning
    ?? (isBullish
      ? `ML model signals a bullish setup (confidence ${confidence}%). Technical score ${technicalScore}/100 reflects positive momentum. ATR-based target set at $${targetPrice} with stop at $${stopLoss}.`
      : isBearish
        ? `ML model signals a bearish setup (confidence ${confidence}%). Technical score ${technicalScore}/100 reflects weakening momentum. Consider reducing exposure.`
        : `ML model signals a neutral/consolidation phase (confidence ${confidence}%). Technical score ${technicalScore}/100 suggests mixed signals. Wait for clearer direction before adding positions.`)

  return {
    signal,
    rawAction: insight?.action ?? "HOLD",
    confidence,
    technicalScore,
    sentimentScore,
    targetPrice,
    stopLoss,
    riskReward,
    reasoning,
    strengths:   strengths.length  > 0 ? strengths  : defaultStrengths,
    risks:       risks.length      > 0 ? risks       : defaultRisks,
    shapValues,
    modelType:   insight?.modelType ?? "Gradient Boosting",
    probabilityIncrease: insight?.probabilityIncrease ?? 0.5,
  }
}