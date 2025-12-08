"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Brain, TrendingUp, TrendingDown, Sparkles, Activity, Newspaper, RefreshCw, AlertTriangle } from "lucide-react"
import { useQuantInsights } from "@/lib/hooks/use-market-data"

export function QuantInsights() {
  const { insights, source, isLoading, refresh } = useQuantInsights(["BTC", "NVDA", "SOL", "ETH"])

  const getActionColor = (action: string) => {
    switch (action) {
      case "STRONG_BUY":
        return "bg-green-500/20 text-green-400 border-green-500/50"
      case "BUY":
        return "bg-green-500/10 text-green-400 border-green-500/30"
      case "HOLD":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
      case "SELL":
        return "bg-primary/10 text-primary border-primary/30"
      case "STRONG_SELL":
        return "bg-primary/20 text-primary border-primary/50"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-green-500"
    if (score >= 50) return "bg-yellow-500"
    return "bg-primary"
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "LOW":
        return "text-green-400"
      case "MEDIUM":
        return "text-yellow-400"
      case "HIGH":
        return "text-primary"
      default:
        return "text-muted-foreground"
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold">Quant Insights</CardTitle>
            <p className="text-sm text-muted-foreground">Technical + Sentiment Fusion (FinBERT)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50 text-primary">
            <Brain className="h-3 w-3 mr-1" />
            {source === "quant-engine" ? "Live" : source}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {insights.map((insight) => (
            <div
              key={insight.symbol}
              className="rounded-lg border border-border bg-secondary/30 p-4 hover:border-primary/50 transition-all group"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{insight.symbol}</span>
                  <Badge className={getActionColor(insight.action)}>
                    {insight.action === "STRONG_BUY" || insight.action === "BUY" ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : insight.action === "SELL" || insight.action === "STRONG_SELL" ? (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    ) : null}
                    {insight.action.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className={`h-3 w-3 ${getRiskColor(insight.riskLevel)}`} />
                  <span className={`text-[10px] ${getRiskColor(insight.riskLevel)}`}>{insight.riskLevel}</span>
                </div>
              </div>

              {/* Scores */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground w-20">Technical</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getScoreColor(insight.technicalScore)} transition-all`}
                      style={{ width: `${insight.technicalScore}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono w-8">{insight.technicalScore}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Newspaper className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground w-20">Sentiment</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getScoreColor(insight.sentimentScore)} transition-all`}
                      style={{ width: `${insight.sentimentScore}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono w-8">{insight.sentimentScore}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Brain className="h-3 w-3 text-primary" />
                  <span className="text-xs text-primary font-medium w-20">Fused</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getScoreColor(insight.fusedScore)} transition-all`}
                      style={{ width: `${insight.fusedScore}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold w-8">{insight.fusedScore}</span>
                </div>
              </div>

              {/* Reasoning */}
              <p className="text-sm text-muted-foreground mb-3">{insight.reasoning}</p>

              {/* Confidence */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  Confidence: <span className="text-foreground font-medium">{insight.confidence}%</span>
                </span>
              </div>

              {/* Factors */}
              <div className="grid grid-cols-2 gap-2 text-[10px] mt-2 pt-2 border-t border-border/50">
                <div className="space-y-1">
                  <span className="text-muted-foreground font-medium">Technical:</span>
                  {insight.technicalFactors.slice(0, 2).map((factor, i) => (
                    <div key={i} className="text-foreground/70">
                      • {factor}
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground font-medium">Sentiment:</span>
                  {insight.sentimentFactors.slice(0, 2).map((factor, i) => (
                    <div key={i} className="text-foreground/70">
                      • {factor}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
