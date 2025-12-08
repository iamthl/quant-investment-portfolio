"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  Search,
  Filter,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Link from "next/link"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function TradingSignalsPanel() {
  const [searchQuery, setSearchQuery] = useState("")
  const [actionFilter, setActionFilter] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR(`/api/trading-signals?limit=20`, fetcher, { refreshInterval: 60000 })

  const signals = data?.signals || []

  const filteredSignals = signals.filter((signal: any) => {
    const matchesSearch = signal.asset.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesAction = !actionFilter || signal.action === actionFilter
    return matchesSearch && matchesAction
  })

  const formatPrice = (price: number, symbol: string) => {
    if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("SOL")) {
      return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `$${price.toFixed(2)}`
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">AI Signals</CardTitle>
              <p className="text-xs text-muted-foreground">Real-time Quant Analysis</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter signals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 text-sm bg-secondary border-border"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 border-border bg-transparent">
                <Filter className="h-3 w-3 mr-1" />
                {actionFilter || "All"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setActionFilter(null)}>All Signals</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActionFilter("BUY")}>
                <TrendingUp className="h-3 w-3 mr-2 text-green-500" /> Buy Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActionFilter("SELL")}>
                <TrendingDown className="h-3 w-3 mr-2 text-primary" /> Sell Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActionFilter("HOLD")}>Hold Only</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
        {filteredSignals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No signals match your filter</p>
          </div>
        ) : (
          filteredSignals.map((signal: any) => (
            <Link
              key={signal.id}
              href={`/stock/${signal.asset.replace("/USD", "")}`}
              className="block rounded-lg border border-border bg-secondary/30 p-3 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{signal.asset}</span>
                  <Badge
                    variant={
                      signal.action === "BUY" ? "default" : signal.action === "SELL" ? "destructive" : "secondary"
                    }
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
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{signal.reasoning}</p>
            </Link>
          ))
        )}

        <Button
          variant="outline"
          className="w-full mt-2 border-border hover:border-primary hover:text-primary bg-transparent"
          asChild
        >
          <Link href="/strategies">
            <Zap className="h-4 w-4 mr-2" />
            Build Custom Strategy
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
