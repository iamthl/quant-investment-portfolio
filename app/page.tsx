import { DashboardHeader } from "@/components/dashboard-header"
import { PortfolioOverview } from "@/components/portfolio-overview"
import { AssetAllocation } from "@/components/asset-allocation"
import { RecentTrades } from "@/components/recent-trades"
import { LiveMarketTicker } from "@/components/live-market-ticker"
import { FinanceAssistant } from "@/components/finance-assistant"

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <LiveMarketTicker />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Your portfolio at a glance</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <PortfolioOverview />
            <RecentTrades />
          </div>
          {/* Sidebar */}
          <div className="space-y-6">
            <AssetAllocation />
          </div>
        </div>
      </main>

      {/* AI Finance Assistant Chatbot */}
      <FinanceAssistant />
    </div>
  )
}
