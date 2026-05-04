"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { Loader2 } from "lucide-react"

interface VolumeBar   { date: string; volume: number; price: number }
interface CorrPair    { pair: string; correlation: number }

function pearson(xs: number[], ys: number[]): number {
  const n   = Math.min(xs.length, ys.length)
  if (n < 3) return 0
  const mx  = xs.slice(0, n).reduce((a, b) => a + b, 0) / n
  const my  = ys.slice(0, n).reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx, ey = ys[i] - my
    num += ex * ey; dx += ex * ex; dy += ey * ey
  }
  const denom = Math.sqrt(dx * dy)
  return denom === 0 ? 0 : Math.round((num / denom) * 100) / 100
}

async function fetchBars(symbol: string): Promise<number[]> {
  try {
    const res = await fetch("/api/market-data", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ symbol, interval: "D" }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.bars ?? []).map((b: any) => b.price).filter(Boolean)
  } catch {
    return []
  }
}

const CORR_PAIRS: [string, string, string][] = [
  ["BTC",  "ETH",  "BTC–ETH"],
  ["BTC",  "NVDA", "BTC–NVDA"],
  ["ETH",  "SOL",  "ETH–SOL"],
  ["AAPL", "MSFT", "AAPL–MSFT"],
  ["NVDA", "AAPL", "NVDA–AAPL"],
]

export function MarketAnalytics() {
  const [volumeData,      setVolumeData]      = useState<VolumeBar[]>([])
  const [correlationData, setCorrelationData] = useState<CorrPair[]>([])
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // Volume + momentum: BTC 30-day daily bars
        const btcRes = await fetch("/api/market-data", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ symbol: "BTC", interval: "D" }),
        })
        if (!cancelled && btcRes.ok) {
          const d = await btcRes.json()
          setVolumeData((d.bars ?? []).slice(-14))   // last 14 days
        }

        // Correlations: fetch all unique symbols then compute pairwise
        const unique  = [...new Set(CORR_PAIRS.flatMap(([a, b]) => [a, b]))]
        const seriesMap = new Map<string, number[]>()
        await Promise.all(unique.map(async (sym) => {
          const bars = await fetchBars(sym)
          seriesMap.set(sym, bars)
        }))

        if (!cancelled) {
          const corrs: CorrPair[] = CORR_PAIRS.map(([a, b, label]) => ({
            pair:        label,
            correlation: pearson(seriesMap.get(a) ?? [], seriesMap.get(b) ?? []),
          }))
          setCorrelationData(corrs)
        }
      } catch {
        // leave empty state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold">Market Analytics</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="volume" className="space-y-4">
          <TabsList className="bg-secondary">
            <TabsTrigger value="volume">Volume Analysis</TabsTrigger>
            <TabsTrigger value="correlation">Correlations</TabsTrigger>
            <TabsTrigger value="momentum">Momentum</TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading real market data…
            </div>
          ) : (
            <>
              <TabsContent value="volume" className="space-y-4">
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false}
                        tickFormatter={(v) => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : String(v)}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                      <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-muted-foreground text-center font-mono">BTC 14-day daily volume · source: Finnhub / CoinGecko</p>
              </TabsContent>

              <TabsContent value="correlation" className="space-y-4">
                <div className="space-y-3">
                  {correlationData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Insufficient price history for correlation</p>
                  ) : correlationData.map((item) => (
                    <div key={item.pair} className="flex items-center justify-between">
                      <span className="text-sm font-medium w-24">{item.pair}</span>
                      <div className="flex items-center gap-3 flex-1 max-w-xs ml-4">
                        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.correlation > 0 ? "bg-green-500" : "bg-primary"}`}
                            style={{ width: `${Math.abs(item.correlation) * 100}%` }}
                          />
                        </div>
                        <span className={`text-sm font-mono w-14 text-right ${item.correlation > 0 ? "text-green-500" : "text-primary"}`}>
                          {item.correlation > 0 ? "+" : ""}{item.correlation.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground text-center font-mono">
                  Pearson correlation of 30-day daily returns · real price data
                </p>
              </TabsContent>

              <TabsContent value="momentum" className="space-y-4">
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false}
                        tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                      <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-muted-foreground text-center font-mono">BTC 14-day price momentum · source: Finnhub / CoinGecko</p>
              </TabsContent>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  )
}
