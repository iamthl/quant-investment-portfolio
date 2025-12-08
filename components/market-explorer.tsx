"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Loader2,
  Star,
  Globe,
  Cpu,
  Pill,
  Fuel,
  DollarSign,
  Building,
} from "lucide-react"
import Link from "next/link"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const SECTORS = [
  {
    id: "technology",
    name: "Technology",
    icon: Cpu,
    symbols: ["AAPL", "NVDA", "MSFT", "GOOGL", "META", "AMD", "INTC", "CRM"],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    icon: Pill,
    symbols: ["JNJ", "UNH", "PFE", "ABBV", "MRK", "LLY", "TMO", "ABT"],
  },
  { id: "energy", name: "Energy", icon: Fuel, symbols: ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO"] },
  { id: "finance", name: "Finance", icon: DollarSign, symbols: ["JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW"] },
  {
    id: "industrial",
    name: "Industrial",
    icon: Building,
    symbols: ["CAT", "DE", "HON", "UPS", "BA", "GE", "MMM", "LMT"],
  },
  { id: "crypto", name: "Crypto", icon: Globe, symbols: ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "DOT"] },
]

const POPULAR_STOCKS = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "AMD", "JPM", "V"]

export function MarketExplorer() {
  const [searchQuery, setSearchQuery] = useState("")
  const [watchlist, setWatchlist] = useState<string[]>(["AAPL", "NVDA", "TSLA"])
  const [selectedSector, setSelectedSector] = useState("technology")

  const currentSector = SECTORS.find((s) => s.id === selectedSector)
  const symbolsToFetch = currentSector?.symbols.join(",") || ""

  const { data, isLoading } = useSWR(symbolsToFetch ? `/api/market-data?symbols=${symbolsToFetch}` : null, fetcher, {
    refreshInterval: 60000,
  })

  const { data: watchlistData } = useSWR(
    watchlist.length > 0 ? `/api/market-data?symbols=${watchlist.join(",")}` : null,
    fetcher,
    { refreshInterval: 60000 },
  )

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([...watchlist, symbol])
    }
  }

  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter((s) => s !== symbol))
  }

  const filteredQuotes =
    data?.quotes?.filter((q: any) => q.symbol.toLowerCase().includes(searchQuery.toLowerCase())) || []

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Market Explorer</CardTitle>
              <p className="text-sm text-muted-foreground">Search and analyze any stock</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search stocks by symbol (e.g., AAPL, NVDA)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>

        {/* Quick Add Popular */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-muted-foreground self-center">Popular:</span>
          {POPULAR_STOCKS.slice(0, 6).map((symbol) => (
            <Badge
              key={symbol}
              variant="outline"
              className="cursor-pointer hover:bg-primary/20 hover:border-primary transition-colors"
              onClick={() => addToWatchlist(symbol)}
            >
              {symbol}
              <Plus className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="sectors" className="space-y-4">
          <TabsList className="grid grid-cols-2 bg-secondary">
            <TabsTrigger value="sectors">Sectors</TabsTrigger>
            <TabsTrigger value="watchlist">
              Watchlist
              {watchlist.length > 0 && (
                <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">
                  {watchlist.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sectors" className="space-y-4">
            {/* Sector Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {SECTORS.map((sector) => {
                const Icon = sector.icon
                return (
                  <Button
                    key={sector.id}
                    variant={selectedSector === sector.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSector(sector.id)}
                    className={selectedSector === sector.id ? "bg-primary" : "border-border"}
                  >
                    <Icon className="h-4 w-4 mr-1" />
                    {sector.name}
                  </Button>
                )
              })}
            </div>

            {/* Sector Stocks */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {filteredQuotes.map((quote: any) => (
                  <Link
                    key={quote.symbol}
                    href={`/stock/${quote.symbol}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30 hover:border-primary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-semibold">{quote.symbol}</span>
                        <span className="text-xs text-muted-foreground">${quote.price?.toFixed(2) || "N/A"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex items-center gap-1 text-sm ${
                          quote.changePercent >= 0 ? "text-green-500" : "text-primary"
                        }`}
                      >
                        {quote.changePercent >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        <span>
                          {quote.changePercent >= 0 ? "+" : ""}
                          {quote.changePercent?.toFixed(2) || 0}%
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.preventDefault()
                          addToWatchlist(quote.symbol)
                        }}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="watchlist" className="space-y-4">
            {watchlist.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Your watchlist is empty</p>
                <p className="text-sm">Add stocks from sectors or search</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {watchlistData?.quotes?.map((quote: any) => (
                  <Link
                    key={quote.symbol}
                    href={`/stock/${quote.symbol}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-semibold">{quote.symbol}</span>
                        <span className="text-xs text-muted-foreground">${quote.price?.toFixed(2) || "N/A"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex items-center gap-1 text-sm ${
                          quote.changePercent >= 0 ? "text-green-500" : "text-primary"
                        }`}
                      >
                        {quote.changePercent >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        <span>
                          {quote.changePercent >= 0 ? "+" : ""}
                          {quote.changePercent?.toFixed(2) || 0}%
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.preventDefault()
                          removeFromWatchlist(quote.symbol)
                        }}
                      >
                        <X className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Button>
                    </div>
                  </Link>
                )) ||
                  watchlist.map((symbol) => (
                    <div
                      key={symbol}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30"
                    >
                      <span className="font-semibold">{symbol}</span>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
