"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, DollarSign, Activity, BarChart3, Wallet, RefreshCw } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { usePortfolio } from "@/lib/hooks/use-market-data"

export function PortfolioOverview() {
  const { stats, history, isLoading, refresh } = usePortfolio()

  const statsDisplay = stats
    ? [
        {
          title: "Total Portfolio Value",
          value: `$${stats.totalValue.toLocaleString()}`,
          change: `${stats.todayPnLPercent >= 0 ? "+" : ""}${stats.todayPnLPercent.toFixed(2)}%`,
          trend: stats.todayPnLPercent >= 0 ? "up" : "down",
          icon: Wallet,
        },
        {
          title: "Today's P&L",
          value: `${stats.todayPnL >= 0 ? "+" : ""}$${stats.todayPnL.toLocaleString()}`,
          change: `${stats.todayPnLPercent >= 0 ? "+" : ""}${stats.todayPnLPercent.toFixed(2)}%`,
          trend: stats.todayPnL >= 0 ? "up" : "down",
          icon: DollarSign,
        },
        {
          title: "Sharpe Ratio",
          value: stats.sharpeRatio.toFixed(2),
          change: stats.sharpeRatio >= 2 ? "Excellent" : stats.sharpeRatio >= 1 ? "Good" : "Fair",
          trend: stats.sharpeRatio >= 1.5 ? "up" : "down",
          icon: BarChart3,
        },
        {
          title: "Win Rate",
          value: `${stats.winRate.toFixed(1)}%`,
          change: `${stats.totalTrades} trades`,
          trend: stats.winRate >= 60 ? "up" : "down",
          icon: Activity,
        },
      ]
    : []

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-xl font-semibold">Portfolio Overview</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Real-time performance tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50 text-primary">
            Live
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsDisplay.map((stat) => (
            <div key={stat.title} className="rounded-lg bg-secondary/50 p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{stat.title}</span>
              </div>
              <div className="text-xl font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 mt-1">
                {stat.trend === "up" ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-primary" />
                )}
                <span className={`text-xs font-medium ${stat.trend === "up" ? "text-green-500" : "text-primary"}`}>
                  {stat.change}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
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
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, "Value"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
