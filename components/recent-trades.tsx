"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpRight, ArrowDownRight, Clock, ExternalLink } from "lucide-react"

const trades = [
  {
    id: 1,
    asset: "BTC/USD",
    type: "BUY",
    amount: "0.5 BTC",
    price: "$43,250",
    total: "$21,625",
    time: "2 min ago",
    status: "completed",
  },
  {
    id: 2,
    asset: "ETH/USD",
    type: "SELL",
    amount: "5.2 ETH",
    price: "$2,280",
    total: "$11,856",
    time: "15 min ago",
    status: "completed",
  },
  {
    id: 3,
    asset: "AAPL",
    type: "BUY",
    amount: "50 shares",
    price: "$178.50",
    total: "$8,925",
    time: "1 hour ago",
    status: "completed",
  },
  {
    id: 4,
    asset: "NVDA",
    type: "BUY",
    amount: "20 shares",
    price: "$485.20",
    total: "$9,704",
    time: "2 hours ago",
    status: "pending",
  },
  {
    id: 5,
    asset: "SOL/USD",
    type: "SELL",
    amount: "100 SOL",
    price: "$98.50",
    total: "$9,850",
    time: "3 hours ago",
    status: "completed",
  },
]

export function RecentTrades() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-xl font-semibold">Recent Trades</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Latest executed orders</p>
        </div>
        <Button variant="outline" size="sm" className="border-border hover:border-primary bg-transparent">
          View All
          <ExternalLink className="h-4 w-4 ml-2" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-6 gap-4 text-xs font-medium text-muted-foreground px-3 py-2">
            <div>Asset</div>
            <div>Type</div>
            <div>Amount</div>
            <div>Price</div>
            <div>Total</div>
            <div>Time</div>
          </div>

          {/* Trades */}
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="grid grid-cols-6 gap-4 items-center rounded-lg border border-border bg-secondary/30 px-3 py-3 text-sm hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div className="font-medium">{trade.asset}</div>
              <div>
                <Badge
                  variant="outline"
                  className={
                    trade.type === "BUY" ? "border-green-500/50 text-green-400" : "border-primary/50 text-primary"
                  }
                >
                  {trade.type === "BUY" ? (
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 mr-1" />
                  )}
                  {trade.type}
                </Badge>
              </div>
              <div className="text-muted-foreground">{trade.amount}</div>
              <div>{trade.price}</div>
              <div className="font-medium">{trade.total}</div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {trade.time}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
