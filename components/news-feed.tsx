"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Newspaper, TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink, Brain } from "lucide-react"
import { useNews } from "@/lib/hooks/use-market-data"

export function NewsFeed() {
  const { articles, source, isLoading, refresh } = useNews("AAPL,NVDA,TSLA,MSFT", 6)

  const getSentimentIcon = (label: string) => {
    if (label.includes("Bullish") || label === "positive") {
      return <TrendingUp className="h-3 w-3" />
    }
    if (label.includes("Bearish") || label === "negative") {
      return <TrendingDown className="h-3 w-3" />
    }
    return <Minus className="h-3 w-3" />
  }

  const getSentimentColor = (label: string) => {
    if (label.includes("Bullish") || label === "positive") {
      return "text-green-400 border-green-500/50"
    }
    if (label.includes("Bearish") || label === "negative") {
      return "text-primary border-primary/50"
    }
    return "text-muted-foreground border-border"
  }

  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <Newspaper className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">News Feed</CardTitle>
            <div className="flex items-center gap-1">
              <Brain className="h-3 w-3 text-primary" />
              <p className="text-xs text-muted-foreground">Alpha Vantage Sentiment</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {source === "alpha_vantage" ? "Live" : source}
          </Badge>
          <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {articles.length === 0 && !isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">No news articles available</div>
        ) : (
          articles.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-border bg-secondary/30 p-3 hover:border-primary/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-medium line-clamp-2 flex-1">{item.headline}</p>
                <Badge variant="outline" className={`shrink-0 ${getSentimentColor(item.sentimentLabel)}`}>
                  {getSentimentIcon(item.sentimentLabel)}
                  <span className="ml-1">{Math.abs(item.sentimentScore).toFixed(2)}</span>
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.source}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{formatTime(item.publishedAt)}</span>
                </div>
                <div className="flex gap-1">
                  {item.symbols?.slice(0, 3).map((asset) => (
                    <Badge key={asset} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {asset}
                    </Badge>
                  ))}
                </div>
              </div>
            </a>
          ))
        )}
        <Button variant="outline" className="w-full border-border hover:border-primary bg-transparent text-xs">
          View All News
          <ExternalLink className="h-3 w-3 ml-2" />
        </Button>
      </CardContent>
    </Card>
  )
}
