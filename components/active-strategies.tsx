"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Bot, TrendingUp, TrendingDown } from "lucide-react"

const strategies = [
  {
    id: 1,
    name: "Momentum Alpha",
    description: "High-frequency momentum trading",
    pnl: "+$12,450",
    pnlPercent: "+8.2%",
    trend: "up",
    active: true,
  },
  {
    id: 2,
    name: "Mean Reversion",
    description: "Statistical arbitrage strategy",
    pnl: "+$8,320",
    pnlPercent: "+5.4%",
    trend: "up",
    active: true,
  },
  {
    id: 3,
    name: "Trend Following",
    description: "Long-term trend capture",
    pnl: "-$2,150",
    pnlPercent: "-1.2%",
    trend: "down",
    active: true,
  },
  {
    id: 4,
    name: "Market Neutral",
    description: "Delta-hedged positions",
    pnl: "+$4,890",
    pnlPercent: "+3.1%",
    trend: "up",
    active: false,
  },
]

export function ActiveStrategies() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Strategies</CardTitle>
            <p className="text-xs text-muted-foreground">Automated trading bots</p>
          </div>
        </div>
        <Badge variant="outline" className="border-green-500/50 text-green-400">
          3 Active
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {strategies.map((strategy) => (
          <div
            key={strategy.id}
            className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm truncate">{strategy.name}</span>
                {strategy.active && <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
              </div>
              <p className="text-xs text-muted-foreground truncate">{strategy.description}</p>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="text-right">
                <div className={`text-sm font-medium ${strategy.trend === "up" ? "text-green-500" : "text-primary"}`}>
                  {strategy.pnl}
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {strategy.trend === "up" ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-primary" />
                  )}
                  <span className={`text-xs ${strategy.trend === "up" ? "text-green-500" : "text-primary"}`}>
                    {strategy.pnlPercent}
                  </span>
                </div>
              </div>
              <Switch checked={strategy.active} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
