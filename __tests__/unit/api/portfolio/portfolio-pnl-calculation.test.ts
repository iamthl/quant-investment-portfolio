// UTC-05: Portfolio P&L Calculation


jest.mock("next-auth", () => ({ default: jest.fn(), getServerSession: jest.fn() }));
jest.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

import { computePortfolioStats } from "@/app/api/portfolio/route";


describe("UTC-05: P&L calculation", () => {
  const holdings = [{ symbol: "AAPL", quantity: 10, avgCost: 150 }];

  const prices = new Map([
    ["AAPL", { price: 165, changePercent: 1.0 }],
  ]);

  let result: ReturnType<typeof computePortfolioStats>;

  beforeAll(() => {
    result = computePortfolioStats(holdings, prices);
  });

  it("totalPnL = (165 - 150) × 10 = $150", () => {
    expect(result.stats.totalPnL).toBe(150);
  });

  it("totalPnLPercent = (150 / 1500) × 100 = 10.00%", () => {
    expect(result.stats.totalPnLPercent).toBe(10);
  });

  it("totalValue = 10 × 165 = $1,650", () => {
    expect(result.stats.totalValue).toBe(1650);
  });

  it("totalCost = 10 × 150 = $1,500", () => {
    expect(result.stats.totalCost).toBe(1500);
  });

  it("position unrealizedPnL = $150", () => {
    expect(result.positions[0].unrealizedPnL).toBe(150);
  });

  it("position unrealizedPnLPercent = 10%", () => {
    expect(result.positions[0].unrealizedPnLPercent).toBe(10);
  });

  it("position currentPrice = $165", () => {
    expect(result.positions[0].currentPrice).toBe(165);
  });
});


describe("UTC-05: edge cases", () => {
  it("filters out positions with no live price", () => {
    const holdings = [
      { symbol: "AAPL", quantity: 10, avgCost: 150 },
      { symbol: "NVDA", quantity: 5,  avgCost: 400 },
    ];
    const prices = new Map([["AAPL", { price: 165, changePercent: 0 }]]);

    const { stats, positions } = computePortfolioStats(holdings, prices);

    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe("AAPL");
    // totalCost still includes NVDA's cost basis
    expect(stats.totalCost).toBe(10 * 150 + 5 * 400);
    // totalPnL only accounts for priced positions
    expect(stats.totalPnL).toBe(1650 - stats.totalCost);
  });

  it("returns zero P&L when live price equals avgCost", () => {
    const holdings = [{ symbol: "AAPL", quantity: 10, avgCost: 150 }];
    const prices   = new Map([["AAPL", { price: 150, changePercent: 0 }]]);

    const { stats } = computePortfolioStats(holdings, prices);

    expect(stats.totalPnL).toBe(0);
    expect(stats.totalPnLPercent).toBe(0);
  });

  it("calculates negative P&L correctly when price falls below avgCost", () => {
    const holdings = [{ symbol: "AAPL", quantity: 10, avgCost: 150 }];
    const prices   = new Map([["AAPL", { price: 120, changePercent: -5 }]]);

    const { stats, positions } = computePortfolioStats(holdings, prices);

    expect(stats.totalPnL).toBe(-300);                 // (120 - 150) × 10
    expect(stats.totalPnLPercent).toBe(-20);           // (-300 / 1500) × 100
    expect(positions[0].unrealizedPnL).toBe(-300);
    expect(positions[0].unrealizedPnLPercent).toBe(-20);
  });

  it("calculates allocation % correctly for multiple holdings", () => {
    const holdings = [
      { symbol: "AAPL", quantity: 10, avgCost: 150 },
      { symbol: "NVDA", quantity: 10, avgCost: 400 },
    ];
    const prices = new Map([
      ["AAPL", { price: 165, changePercent: 0 }],  // marketValue = 1650
      ["NVDA", { price: 500, changePercent: 0 }],  // marketValue = 5000
    ]);

    const { positions } = computePortfolioStats(holdings, prices);
    const total = 1650 + 5000;

    const aapl = positions.find((p) => p.symbol === "AAPL")!;
    const nvda = positions.find((p) => p.symbol === "NVDA")!;

    expect(aapl.allocation).toBeCloseTo((1650 / total) * 100, 1);
    expect(nvda.allocation).toBeCloseTo((5000 / total) * 100, 1);
    expect(aapl.allocation + nvda.allocation).toBeCloseTo(100, 1);
  });
});
