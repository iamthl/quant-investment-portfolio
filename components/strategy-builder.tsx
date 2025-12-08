"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Brain,
  TrendingUp,
  Activity,
  Zap,
  Shield,
  Target,
  Settings2,
  Play,
  Sparkles,
  ChevronRight,
  Info,
  Rocket,
  Scale,
  Timer,
  Waves,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Strategy {
  id: string
  name: string
  description: string
  icon: any
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  timeframe: string
  indicators: string[]
  winRate: number
  avgReturn: number
  enabled: boolean
}

const PRESET_STRATEGIES: Strategy[] = [
  {
    id: "momentum",
    name: "Momentum Trading",
    description: "Captures strong price movements using RSI, MACD, and volume analysis",
    icon: Rocket,
    riskLevel: "HIGH",
    timeframe: "1D - 1W",
    indicators: ["RSI", "MACD", "Volume", "ADX"],
    winRate: 62,
    avgReturn: 8.5,
    enabled: false,
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    description: "Trades price reversals to historical averages using Bollinger Bands",
    icon: Waves,
    riskLevel: "MEDIUM",
    timeframe: "4H - 1D",
    indicators: ["Bollinger Bands", "RSI", "SMA"],
    winRate: 58,
    avgReturn: 4.2,
    enabled: false,
  },
  {
    id: "trend-following",
    name: "Trend Following",
    description: "Rides long-term trends using moving average crossovers",
    icon: TrendingUp,
    riskLevel: "MEDIUM",
    timeframe: "1D - 1M",
    indicators: ["EMA 20/50/200", "ADX", "MACD"],
    winRate: 55,
    avgReturn: 12.3,
    enabled: false,
  },
  {
    id: "breakout",
    name: "Breakout Strategy",
    description: "Identifies and trades price breakouts from consolidation zones",
    icon: Zap,
    riskLevel: "HIGH",
    timeframe: "1H - 1D",
    indicators: ["Support/Resistance", "Volume", "ATR"],
    winRate: 48,
    avgReturn: 15.6,
    enabled: false,
  },
  {
    id: "value-investing",
    name: "Value Investing",
    description: "Long-term positions based on fundamental undervaluation",
    icon: Scale,
    riskLevel: "LOW",
    timeframe: "1M - 1Y",
    indicators: ["P/E Ratio", "P/B Ratio", "DCF"],
    winRate: 67,
    avgReturn: 18.2,
    enabled: false,
  },
  {
    id: "scalping",
    name: "Scalping",
    description: "Quick trades capturing small price movements with high frequency",
    icon: Timer,
    riskLevel: "HIGH",
    timeframe: "1M - 15M",
    indicators: ["VWAP", "Order Flow", "Level 2"],
    winRate: 72,
    avgReturn: 1.2,
    enabled: false,
  },
]

const TECHNICAL_INDICATORS = [
  { id: "rsi", name: "RSI", description: "Relative Strength Index - momentum oscillator" },
  { id: "macd", name: "MACD", description: "Moving Average Convergence Divergence" },
  { id: "bollinger", name: "Bollinger Bands", description: "Volatility bands around moving average" },
  { id: "ema", name: "EMA", description: "Exponential Moving Average" },
  { id: "sma", name: "SMA", description: "Simple Moving Average" },
  { id: "adx", name: "ADX", description: "Average Directional Index - trend strength" },
  { id: "atr", name: "ATR", description: "Average True Range - volatility measure" },
  { id: "vwap", name: "VWAP", description: "Volume Weighted Average Price" },
  { id: "obv", name: "OBV", description: "On Balance Volume - volume flow indicator" },
  { id: "stochastic", name: "Stochastic", description: "Momentum indicator comparing closing price" },
]

const SENTIMENT_SOURCES = [
  { id: "finbert", name: "FinBERT", description: "Financial sentiment NLP model" },
  { id: "news", name: "News Analysis", description: "Real-time news sentiment" },
  { id: "social", name: "Social Media", description: "Twitter/Reddit sentiment" },
  { id: "analyst", name: "Analyst Ratings", description: "Wall Street recommendations" },
]

export function StrategyBuilder() {
  const [strategies, setStrategies] = useState(PRESET_STRATEGIES)
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(["rsi", "macd", "ema"])
  const [selectedSentiment, setSelectedSentiment] = useState<string[]>(["finbert", "news"])
  const [riskTolerance, setRiskTolerance] = useState([50])
  const [positionSize, setPositionSize] = useState([10])
  const [stopLossPercent, setStopLossPercent] = useState([5])
  const [takeProfitPercent, setTakeProfitPercent] = useState([15])
  const [useAI, setUseAI] = useState(true)
  const [generatedSignal, setGeneratedSignal] = useState<any>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [symbols, setSymbols] = useState("AAPL,NVDA,MSFT")

  const toggleStrategy = (id: string) => {
    setStrategies(strategies.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))
  }

  const toggleIndicator = (id: string) => {
    setSelectedIndicators((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const toggleSentiment = (id: string) => {
    setSelectedSentiment((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "LOW":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "MEDIUM":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      case "HIGH":
        return "bg-primary/20 text-primary border-primary/30"
      default:
        return ""
    }
  }

  const generateSignals = async () => {
    setIsGenerating(true)

    // Simulate AI signal generation
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const enabledStrategies = strategies.filter((s) => s.enabled)
    const strategyNames = enabledStrategies.map((s) => s.name).join(", ") || "Custom Mix"

    setGeneratedSignal({
      symbol: symbols.split(",")[0],
      action: Math.random() > 0.5 ? "BUY" : "HOLD",
      confidence: Math.floor(65 + Math.random() * 30),
      strategies: strategyNames,
      indicators: selectedIndicators,
      reasoning: `Based on ${strategyNames} analysis with ${selectedIndicators.length} technical indicators and ${selectedSentiment.length} sentiment sources. Risk tolerance set to ${riskTolerance[0]}% with ${stopLossPercent[0]}% stop loss and ${takeProfitPercent[0]}% take profit targets.`,
      technicalScore: Math.floor(50 + Math.random() * 40),
      sentimentScore: Math.floor(50 + Math.random() * 40),
      riskLevel: riskTolerance[0] < 30 ? "LOW" : riskTolerance[0] < 70 ? "MEDIUM" : "HIGH",
      entryPrice: 150 + Math.random() * 50,
      targetPrice: 180 + Math.random() * 40,
      stopLoss: 140 + Math.random() * 10,
    })

    setIsGenerating(false)
  }

  return (
    <TooltipProvider>
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Strategy Selection */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="preset" className="space-y-4">
            <TabsList className="grid grid-cols-2 bg-secondary">
              <TabsTrigger value="preset">Preset Strategies</TabsTrigger>
              <TabsTrigger value="custom">Custom Builder</TabsTrigger>
            </TabsList>

            <TabsContent value="preset" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {strategies.map((strategy) => {
                  const Icon = strategy.icon
                  return (
                    <Card
                      key={strategy.id}
                      className={`border-border bg-card cursor-pointer transition-all ${
                        strategy.enabled ? "border-primary ring-1 ring-primary/50" : "hover:border-primary/50"
                      }`}
                      onClick={() => toggleStrategy(strategy.id)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                strategy.enabled ? "bg-primary/30" : "bg-secondary"
                              }`}
                            >
                              <Icon
                                className={`h-4 w-4 ${strategy.enabled ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <CardTitle className="text-base">{strategy.name}</CardTitle>
                          </div>
                          <Switch checked={strategy.enabled} />
                        </div>
                        <CardDescription className="text-xs">{strategy.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-1 mb-3">
                          {strategy.indicators.map((ind) => (
                            <Badge key={ind} variant="outline" className="text-[10px] border-border">
                              {ind}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <Badge className={getRiskColor(strategy.riskLevel)}>{strategy.riskLevel} Risk</Badge>
                          <span className="text-muted-foreground">{strategy.timeframe}</span>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-xs">
                          <div className="flex items-center gap-1">
                            <Target className="h-3 w-3 text-green-400" />
                            <span className="text-green-400">{strategy.winRate}% Win</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3 text-primary" />
                            <span className="text-primary">+{strategy.avgReturn}% Avg</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              {/* Technical Indicators */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Technical Indicators</CardTitle>
                  </div>
                  <CardDescription>Select indicators for your custom strategy</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 md:grid-cols-2">
                    {TECHNICAL_INDICATORS.map((ind) => (
                      <div
                        key={ind.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedIndicators.includes(ind.id)
                            ? "border-primary bg-primary/10"
                            : "border-border bg-secondary/30 hover:border-primary/50"
                        }`}
                        onClick={() => toggleIndicator(ind.id)}
                      >
                        <div className="flex items-center gap-2">
                          <Switch checked={selectedIndicators.includes(ind.id)} />
                          <div>
                            <span className="font-medium text-sm">{ind.name}</span>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 ml-1 text-muted-foreground inline" />
                              </TooltipTrigger>
                              <TooltipContent>{ind.description}</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Sentiment Sources */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Sentiment Analysis</CardTitle>
                  </div>
                  <CardDescription>AI-powered sentiment from multiple sources</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 md:grid-cols-2">
                    {SENTIMENT_SOURCES.map((source) => (
                      <div
                        key={source.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedSentiment.includes(source.id)
                            ? "border-primary bg-primary/10"
                            : "border-border bg-secondary/30 hover:border-primary/50"
                        }`}
                        onClick={() => toggleSentiment(source.id)}
                      >
                        <div className="flex items-center gap-2">
                          <Switch checked={selectedSentiment.includes(source.id)} />
                          <div>
                            <span className="font-medium text-sm">{source.name}</span>
                            <p className="text-[10px] text-muted-foreground">{source.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Configuration Panel */}
        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Configuration</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Symbols */}
              <div className="space-y-2">
                <Label>Target Symbols</Label>
                <Input
                  value={symbols}
                  onChange={(e) => setSymbols(e.target.value)}
                  placeholder="AAPL,NVDA,MSFT"
                  className="bg-secondary border-border"
                />
                <p className="text-[10px] text-muted-foreground">Comma-separated symbols</p>
              </div>

              {/* Risk Tolerance */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Risk Tolerance</Label>
                  <span className="text-sm text-primary">{riskTolerance[0]}%</span>
                </div>
                <Slider value={riskTolerance} onValueChange={setRiskTolerance} max={100} step={5} className="py-2" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Conservative</span>
                  <span>Aggressive</span>
                </div>
              </div>

              {/* Position Size */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Position Size</Label>
                  <span className="text-sm text-primary">{positionSize[0]}%</span>
                </div>
                <Slider value={positionSize} onValueChange={setPositionSize} max={50} step={1} className="py-2" />
              </div>

              {/* Stop Loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-primary" />
                    Stop Loss
                  </Label>
                  <span className="text-sm text-primary">{stopLossPercent[0]}%</span>
                </div>
                <Slider value={stopLossPercent} onValueChange={setStopLossPercent} max={20} step={1} className="py-2" />
              </div>

              {/* Take Profit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-green-400" />
                    Take Profit
                  </Label>
                  <span className="text-sm text-green-400">{takeProfitPercent[0]}%</span>
                </div>
                <Slider
                  value={takeProfitPercent}
                  onValueChange={setTakeProfitPercent}
                  max={50}
                  step={1}
                  className="py-2"
                />
              </div>

              {/* AI Enhancement */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <div>
                    <span className="text-sm font-medium">AI Enhancement</span>
                    <p className="text-[10px] text-muted-foreground">Use GPT for signal analysis</p>
                  </div>
                </div>
                <Switch checked={useAI} onCheckedChange={setUseAI} />
              </div>

              {/* Generate Button */}
              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={generateSignals}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Activity className="h-4 w-4 mr-2 animate-pulse" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Generate Signals
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Generated Signal */}
          {generatedSignal && (
            <Card className="border-primary/50 bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Generated Signal</CardTitle>
                  </div>
                  <Badge
                    className={
                      generatedSignal.action === "BUY"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-yellow-500/20 text-yellow-400"
                    }
                  >
                    {generatedSignal.action}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{generatedSignal.symbol}</span>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Confidence</div>
                    <div className="text-xl font-bold text-primary">{generatedSignal.confidence}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded bg-secondary/50">
                    <span className="text-muted-foreground text-xs">Entry</span>
                    <div className="font-medium">${generatedSignal.entryPrice.toFixed(2)}</div>
                  </div>
                  <div className="p-2 rounded bg-secondary/50">
                    <span className="text-muted-foreground text-xs">Target</span>
                    <div className="font-medium text-green-400">${generatedSignal.targetPrice.toFixed(2)}</div>
                  </div>
                  <div className="p-2 rounded bg-secondary/50">
                    <span className="text-muted-foreground text-xs">Stop Loss</span>
                    <div className="font-medium text-primary">${generatedSignal.stopLoss.toFixed(2)}</div>
                  </div>
                  <div className="p-2 rounded bg-secondary/50">
                    <span className="text-muted-foreground text-xs">Risk</span>
                    <div className="font-medium">{generatedSignal.riskLevel}</div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{generatedSignal.reasoning}</p>

                <Button
                  variant="outline"
                  className="w-full border-primary text-primary hover:bg-primary/10 bg-transparent"
                >
                  View Full Analysis
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
