// UTC-04: Fused Score Action Mapping

jest.mock("@/lib/prisma", () => ({
  prisma: {
    aIPrediction: { create: jest.fn().mockResolvedValue({}) },
  },
}));

import { determineAction } from "@/app/api/quant-insights/route";


describe("UTC-04: fused score to trading signal", () => {
  it("fused = 80 → STRONG_BUY", () => {
    expect(determineAction(80)).toBe("STRONG_BUY");
  });

  it("fused = 65 → BUY", () => {
    expect(determineAction(65)).toBe("BUY");
  });

  it("fused = 50 → HOLD", () => {
    expect(determineAction(50)).toBe("HOLD");
  });

  it("fused = 30 → SELL", () => {
    expect(determineAction(30)).toBe("SELL");
  });

  it("fused = 20 → STRONG_SELL", () => {
    expect(determineAction(20)).toBe("STRONG_SELL");
  });
});


describe("UTC-04: exact threshold edges", () => {
  test.each([
    // STRONG_BUY
    [100, "STRONG_BUY"],   // maximum
    [78,  "STRONG_BUY"],   // exact lower edge

    // BUY
    [77,  "BUY"],          // one below STRONG_BUY
    [62,  "BUY"],          // exact lower edge

    // HOLD
    [61,  "HOLD"],         // one below BUY
    [42,  "HOLD"],         // exact lower edge

    // SELL
    [41,  "SELL"],         // one below HOLD
    [28,  "SELL"],         // exact lower edge

    // STRONG_SELL
    [27,  "STRONG_SELL"],  // one below SELL
    [0,   "STRONG_SELL"],  // minimum
  ])("fused = %i → %s", (fused, expected) => {
    expect(determineAction(fused)).toBe(expected);
  });
});
