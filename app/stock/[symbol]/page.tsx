import { DashboardHeader } from "@/components/dashboard-header"
import { LiveMarketTicker } from "@/components/live-market-ticker"
import { StockDetail } from "@/components/stock-detail"
import { FinanceAssistant } from "@/components/finance-assistant"

interface StockPageProps {
  params: Promise<{ symbol: string }>
}

export default async function StockPage({ params }: StockPageProps) {
  const { symbol } = await params

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <LiveMarketTicker />
      <main className="container mx-auto px-4 py-6">
        <StockDetail symbol={symbol.toUpperCase()} />
      </main>

      <FinanceAssistant />
    </div>
  )
}
