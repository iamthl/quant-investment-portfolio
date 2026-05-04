// UTC-06: Fused Score Weighted Formula


jest.mock("@/lib/prisma", () => ({
  prisma: { aIPrediction: { create: jest.fn().mockResolvedValue({}) } },
}));

import { determineAction } from "@/app/api/quant-insights/route";

function computeFusedScore(technicalScore: number, sentimentScore: number): number {
  return Math.round(technicalScore * 0.7 + sentimentScore * 0.3);
}

describe("UTC-06: fused score weighted formula", () => {
  it("(80 × 0.7) + (60 × 0.3) = 56 + 18 = 74", () => {
    expect(computeFusedScore(80, 60)).toBe(74);
  });

  it("fused = 74 -> determineAction returns BUY (threshold >= 62)", () => {
    expect(determineAction(74)).toBe("BUY");
  });

  it("(20 × 0.7) + (30 × 0.3) = 14 + 9 = 23", () => {
    expect(computeFusedScore(20, 30)).toBe(23);
  });

  it("fused = 23 -> determineAction returns STRONG_SELL (threshold < 28)", () => {
    expect(determineAction(23)).toBe("STRONG_SELL");
  });
});

describe("UTC-06: full fusion pipeline", () => {
  test.each([
    // [technicalScore, sentimentScore, expectedFused, expectedAction]
    [80, 60,  74, "BUY"],
    [20, 30,  23, "STRONG_SELL"],
    [90, 90,  90, "STRONG_BUY"],   // (90×0.7)+(90×0.3) = 90
    [50, 50,  50, "HOLD"],         // (50×0.7)+(50×0.3) = 50
    [70, 40,  61, "HOLD"],         // (70×0.7)+(40×0.3) = 49+12 = 61 — just below BUY (62)
    [71, 40,  62, "BUY"],          // (71×0.7)+(40×0.3) = 49.7+12 = 61.7 -> rounds to 62
    [40, 10,  31, "SELL"],         // (40×0.7)+(10×0.3) = 28+3 = 31
    [38,  5,  28, "SELL"],         // (38×0.7)+(5×0.3)  = 26.6+1.5 = 28.1 -> rounds to 28
    [37,  5,  27, "STRONG_SELL"],  // (37×0.7)+(5×0.3)  = 25.9+1.5 = 27.4 -> rounds to 27
  ])(
    "tech=%i sent=%i -> fused=%i -> %s",
    (tech, sent, expectedFused, expectedAction) => {
      const fused = computeFusedScore(tech, sent);
      expect(fused).toBe(expectedFused);
      expect(determineAction(fused)).toBe(expectedAction);
    }
  );
});


describe("UTC-06: weighting properties", () => {
  it("technical score carries 70% weight", () => {
    expect(computeFusedScore(100, 0)).toBe(70);
    expect(computeFusedScore(50,  0)).toBe(35);
  });

  it("sentiment score carries 30% weight", () => {
    expect(computeFusedScore(0, 100)).toBe(30);
    expect(computeFusedScore(0,  50)).toBe(15);
  });

  it("weights sum to 1.0 equal, scores produce the same fused score", () => {
    expect(computeFusedScore(60, 60)).toBe(60);
    expect(computeFusedScore(75, 75)).toBe(75);
  });
});
