"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Gauge, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useTechnicalIndicators } from "@/lib/hooks/use-market-data"

export function TechnicalIndicators() {
  const [activeAsset, setActiveAsset] = useState("BTC")
  const { indicators, isLoading, refresh } = useTechnicalIndicators(activeAsset)

  const safeNumber = (val: number | undefined, fallback = 0): number => {
    return typeof val === "number" && !isNaN(val) ? val : fallback
  }

  const getSignal = (name: string, value: number | undefined): "buy" | "sell" | "neutral" => {
    if (value === undefined || value === null) return "neutral"

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

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "buy":
        return "text-green-400 border-green-500/50 bg-green-500/10"
      case "sell":
        return "text-primary border-primary/50 bg-primary/10"
      default:
        return "text-muted-foreground border-border bg-secondary/50"
    }
  }

  const indicatorsList = indicators
    ? [
        {
          name: "RSI (14)",
          value: safeNumber(indicators.rsi, 50),
          signal: getSignal("rsi", indicators.rsi),
          description:
            safeNumber(indicators.rsi) > 70
              ? "Overbought"
              : safeNumber(indicators.rsi) < 30
                ? "Oversold"
                : "Neutral zone",
        },
        {
          name: "MACD",
          value: safeNumber(indicators.macd, 0),
          signal: getSignal("macd", indicators.macd),
          description:
            safeNumber(indicators.macd) > safeNumber(indicators.macdSignal) ? "Bullish crossover" : "Bearish",
        },
        {
          name: "Momentum",
          value: safeNumber(indicators.momentum, 0),
          signal: getSignal("momentum", indicators.momentum),
          description: safeNumber(indicators.momentum) > 0 ? "Upward momentum" : "Downward momentum",
        },
        {
          name: "ADX",
          value: safeNumber(indicators.adx, 20),
          signal: getSignal("adx", indicators.adx),
          description: safeNumber(indicators.adx) > 25 ? "Strong trend" : "Weak trend",
        },
        {
          name: "Stochastic K",
          value: safeNumber(indicators.stochK, 50),
          signal: getSignal("rsi", indicators.stochK),
          description:
            safeNumber(indicators.stochK) > 80
              ? "Overbought"
              : safeNumber(indicators.stochK) < 20
                ? "Oversold"
                : "Mid range",
        },
        {
          name: "ATR",
          value: safeNumber(indicators.atr, 0),
          signal: "neutral" as const,
          description: "Volatility measure",
        },
      ]
    : []

  const getOverallSignal = () => {
    if (!indicators) return { signal: "LOADING", color: "text-muted-foreground", icon: Minus }
    const buyCount = indicatorsList.filter((i) => i.signal === "buy").length
    const sellCount = indicatorsList.filter((i) => i.signal === "sell").length
    if (buyCount > sellCount + 1) return { signal: "BUY", color: "text-green-400", icon: TrendingUp }
    if (sellCount > buyCount + 1) return { signal: "SELL", color: "text-primary", icon: TrendingDown }
    return { signal: "HOLD", color: "text-yellow-400", icon: Minus }
  }

  const overall = getOverallSignal()

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
            <Gauge className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Technical Analysis</CardTitle>
            <p className="text-xs text-muted-foreground">Live indicators</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`${overall.color} border-current`}>
            <overall.icon className="h-3 w-3 mr-1" />
            {overall.signal}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="BTC" onValueChange={setActiveAsset}>
          <TabsList className="bg-secondary w-full mb-4">
            <TabsTrigger value="BTC" className="flex-1">
              BTC
            </TabsTrigger>
            <TabsTrigger value="ETH" className="flex-1">
              ETH
            </TabsTrigger>
            <TabsTrigger value="NVDA" className="flex-1">
              NVDA
            </TabsTrigger>
            <TabsTrigger value="SOL" className="flex-1">
              SOL
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeAsset} className="space-y-2 mt-0">
            {indicatorsList.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading indicators...
              </div>
            ) : (
              indicatorsList.map((ind) => (
                <div
                  key={ind.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-2"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ind.name}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getSignalColor(ind.signal)}`}>
                        {ind.signal.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{ind.description}</p>
                  </div>
                  <span className="text-sm font-mono font-medium">{ind.value.toFixed(2)}</span>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
