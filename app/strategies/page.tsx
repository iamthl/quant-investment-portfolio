import { DashboardHeader } from "@/components/dashboard-header"
import { StrategyBuilder } from "@/components/strategy-builder"
import { FinanceAssistant } from "@/components/finance-assistant"

export default function StrategiesPage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Quant Strategy Builder</h1>
          <p className="text-muted-foreground">Select from proven strategies or create your own custom approach</p>
        </div>

        <StrategyBuilder />
      </main>
      <FinanceAssistant />
    </div>
  )
}
