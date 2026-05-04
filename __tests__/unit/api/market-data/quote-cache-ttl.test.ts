// UTC-02: Quote Cache TTL


import { GET, quoteCache, CACHE_TTL } from "@/app/api/market-data/route";


function buildRequest(symbols: string): Request {
  return new Request(`http://localhost/api/market-data?symbols=${symbols}`);
}

function makeFinnhubResponse(price: number) {
  return {
    c: price,   // current price
    d: 1.5,     // change
    dp: 0.75,   // change percent
    h: price + 5,
    l: price - 5,
    o: price - 1,
    pc: price - 1.5,
  };
}


beforeEach(() => {
  quoteCache.clear();
  process.env.FINNHUB_API_KEY = "test-api-key";
  jest.restoreAllMocks();
});

afterEach(() => {
  quoteCache.clear();
  delete process.env.FINNHUB_API_KEY;
});


describe("UTC-02: GET /api/market-data — quote cache TTL", () => {
  const SYMBOL = "AAPL";
  const FRESH_PRICE = 200.0;
  const STALE_PRICE = 150.0;

  it("should bypass cache and fetch fresh data when cached quote is older than CACHE_TTL", async () => {
    const staleTimestamp = Date.now() - 90_000;
    quoteCache.set(SYMBOL, {
      data: {
        symbol: SYMBOL,
        price: STALE_PRICE,
        change: 0,
        changePercent: 0,
        volume: 0,
        high: STALE_PRICE,
        low: STALE_PRICE,
        open: STALE_PRICE,
        previousClose: STALE_PRICE,
        timestamp: new Date(staleTimestamp).toISOString(),
      },
      timestamp: staleTimestamp,
    });

    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeFinnhubResponse(FRESH_PRICE)), { status: 200 })
    );

    const response = await GET(buildRequest(SYMBOL));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0].price).toBe(FRESH_PRICE);
    expect(body.quotes[0].symbol).toBe(SYMBOL);

    const updated = quoteCache.get(SYMBOL);
    expect(updated).toBeDefined();
    expect(updated!.data.price).toBe(FRESH_PRICE);
    expect(updated!.timestamp).toBeGreaterThan(staleTimestamp);
    expect(Date.now() - updated!.timestamp).toBeLessThan(5_000);
  });

  it("should serve cached data without calling fetch when cache is still fresh", async () => {
    const freshTimestamp = Date.now() - 10_000;
    quoteCache.set(SYMBOL, {
      data: {
        symbol: SYMBOL,
        price: STALE_PRICE,
        change: 0,
        changePercent: 0,
        volume: 0,
        high: STALE_PRICE,
        low: STALE_PRICE,
        open: STALE_PRICE,
        previousClose: STALE_PRICE,
        timestamp: new Date(freshTimestamp).toISOString(),
      },
      timestamp: freshTimestamp,
    });

    const fetchSpy = jest.spyOn(global, "fetch");

    const response = await GET(buildRequest(SYMBOL));
    const body = await response.json();

    expect(body.quotes[0].price).toBe(STALE_PRICE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should confirm CACHE_TTL is exactly 60,000 ms", () => {
    expect(CACHE_TTL).toBe(60_000);
  });

  it("should update quoteCache entry timestamp to approximately now after a cache miss", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeFinnhubResponse(FRESH_PRICE)), { status: 200 })
    );

    const before = Date.now();
    await GET(buildRequest(SYMBOL));
    const after = Date.now();

    const entry = quoteCache.get(SYMBOL);
    expect(entry).toBeDefined();
    expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry!.timestamp).toBeLessThanOrEqual(after);
  });
});
