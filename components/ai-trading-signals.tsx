"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Brain,
  RefreshCw,
  ChevronRight,
  Activity,
  Newspaper,
  Target,
  ShieldAlert,
} from "lucide-react"
import { useTradingSignals } from "@/lib/hooks/use-market-data"

export function AITradingSignals() {
  const { signals, source, isLoading, refresh } = useTradingSignals(4)

  const formatPrice = (price: number, symbol: string) => {
    if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("SOL")) {
      return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `$${price.toFixed(2)}`
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">AI Signals</CardTitle>
            <p className="text-xs text-muted-foreground">Quant Engine Output</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {source}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {signals.map((signal) => (
          <div
            key={signal.id}
            className="group rounded-lg border border-border bg-secondary/30 p-3 hover:border-primary/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{signal.asset}</span>
                <Badge
                  variant={signal.action === "BUY" ? "default" : signal.action === "SELL" ? "destructive" : "secondary"}
                  className={
                    signal.action === "BUY"
                      ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                      : signal.action === "SELL"
                        ? "bg-primary/20 text-primary hover:bg-primary/30"
                        : "bg-yellow-500/20 text-yellow-400"
                  }
                >
                  {signal.action === "BUY" && <TrendingUp className="h-3 w-3 mr-1" />}
                  {signal.action === "SELL" && <TrendingDown className="h-3 w-3 mr-1" />}
                  {signal.action}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-primary" />
                <span className="text-sm font-medium text-primary">{signal.confidence}%</span>
              </div>
            </div>
            <div className="flex gap-3 mb-2">
              <div className="flex items-center gap-1 text-[10px]">
                <Activity className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Tech:</span>
                <span
                  className={
                    signal.technicalScore >= 60
                      ? "text-green-400"
                      : signal.technicalScore >= 40
                        ? "text-yellow-400"
                        : "text-primary"
                  }
                >
                  {signal.technicalScore}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <Newspaper className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Sent:</span>
                <span
                  className={
                    signal.sentimentScore >= 60
                      ? "text-green-400"
                      : signal.sentimentScore >= 40
                        ? "text-yellow-400"
                        : "text-primary"
                  }
                >
                  {signal.sentimentScore}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">R/R:</span>
                <span className="text-foreground">{signal.riskReward?.toFixed(2) || "N/A"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground flex items-center gap-2">
                <span>{formatPrice(signal.currentPrice, signal.asset)}</span>
                <span className="text-foreground">→</span>
                <span className="text-green-400">{formatPrice(signal.targetPrice, signal.asset)}</span>
                <span className="text-[10px] flex items-center gap-0.5">
                  <ShieldAlert className="h-3 w-3 text-primary" />
                  <span className="text-primary">{formatPrice(signal.stopLoss, signal.asset)}</span>
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{signal.reasoning}</p>
          </div>
        ))}
        <Button
          variant="outline"
          className="w-full mt-2 border-border hover:border-primary hover:text-primary bg-transparent"
        >
          View All Signals
        </Button>
      </CardContent>
    </Card>
  )
}
