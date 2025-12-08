"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

const volumeData = [
  { time: "09:00", volume: 1200, price: 43100 },
  { time: "10:00", volume: 1800, price: 43250 },
  { time: "11:00", volume: 2200, price: 43180 },
  { time: "12:00", volume: 1600, price: 43320 },
  { time: "13:00", volume: 2800, price: 43450 },
  { time: "14:00", volume: 3200, price: 43380 },
  { time: "15:00", volume: 2400, price: 43520 },
  { time: "16:00", volume: 1900, price: 43480 },
]

const correlationData = [
  { pair: "BTC-ETH", correlation: 0.85 },
  { pair: "BTC-SPY", correlation: 0.42 },
  { pair: "ETH-SOL", correlation: 0.78 },
  { pair: "AAPL-MSFT", correlation: 0.72 },
  { pair: "GOLD-USD", correlation: -0.35 },
]

export function MarketAnalytics() {
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

          <TabsContent value="volume" className="space-y-4">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="correlation" className="space-y-4">
            <div className="space-y-3">
              {correlationData.map((item) => (
                <div key={item.pair} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.pair}</span>
                  <div className="flex items-center gap-3 flex-1 max-w-xs ml-4">
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.correlation > 0 ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${Math.abs(item.correlation) * 100}%` }}
                      />
                    </div>
                    <span
                      className={`text-sm font-mono w-14 text-right ${
                        item.correlation > 0 ? "text-green-500" : "text-primary"
                      }`}
                    >
                      {item.correlation > 0 ? "+" : ""}
                      {item.correlation.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="momentum" className="space-y-4">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
