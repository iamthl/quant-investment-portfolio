import { DashboardHeader } from "@/components/dashboard-header"
import { LiveMarketTicker } from "@/components/live-market-ticker"
import { MarketExplorer } from "@/components/market-explorer"
import { TradingSignalsPanel } from "@/components/trading-signals-panel"
import { NewsFeed } from "@/components/news-feed"
import { FinanceAssistant } from "@/components/finance-assistant"

export default function MarketsPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <LiveMarketTicker />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Markets & AI Signals</h1>
          <p className="text-muted-foreground">Explore unlimited stocks and get AI-powered trading signals</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <MarketExplorer />
            <NewsFeed />
          </div>
          {/* Sidebar */}
          <div className="space-y-6">
            <TradingSignalsPanel />
          </div>
        </div>
      </main>

      <FinanceAssistant />
    </div>
  )
}
