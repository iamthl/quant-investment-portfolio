"use client"

import { TrendingUp, TrendingDown, Wifi, WifiOff, RefreshCw } from "lucide-react"
import { useMarketData } from "@/lib/hooks/use-market-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function LiveMarketTicker() {
  const { quotes, isLoading, isError, refresh } = useMarketData([
    "AAPL",
    "NVDA",
    "MSFT",
    "TSLA",
    "GOOGL",
    "AMZN",
    "META",
  ])

  if (isLoading && quotes.length === 0) {
    return (
      <div className="border-b border-border bg-card/50 backdrop-blur py-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-sm">Connecting to Alpha Vantage...</span>
        </div>
      </div>
    )
  }

  const hasData = quotes.length > 0 && quotes.some((q) => q.price > 0)

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur overflow-hidden">
      <div className="flex items-center justify-between px-4 py-1 border-b border-border/50 bg-background/50">
        <div className="flex items-center gap-2">
          {isError || !hasData ? (
            <WifiOff className="h-3 w-3 text-primary" />
          ) : (
            <Wifi className="h-3 w-3 text-green-500" />
          )}
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Live Market Data</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-border">
            Alpha Vantage
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refresh()} disabled={isLoading}>
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {hasData ? (
        <div className="animate-marquee flex items-center gap-8 py-2 px-4 whitespace-nowrap">
          {/* // Made ticker items clickable to navigate to stock page */}
          {[...quotes, ...quotes].map((ticker, index) => (
            <Link
              key={`${ticker.symbol}-${index}`}
              href={`/stock/${ticker.symbol}`}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <span className="font-semibold text-sm">{ticker.symbol}</span>
              <span className="text-sm font-mono">
                ${ticker.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  ticker.change >= 0 ? "text-green-500" : "text-primary"
                }`}
              >
                {ticker.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>
                  {ticker.change >= 0 ? "+" : ""}
                  {ticker.changePercent.toFixed(2)}%
                </span>
              </div>
              <div className="h-4 w-px bg-border ml-2" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-2 px-4 text-center text-sm text-muted-foreground">
          {isError ? "Failed to load market data" : "Loading market data..."}
        </div>
      )}
    </div>
  )
}
