import asyncio
import json
import os
import time
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional, Set
import httpx
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from kafka_producer import AIOKafkaProducerWrapper
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False

try:
    from redis_cache import RedisCache
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration

FINNHUB_API_KEY          = os.getenv("FINNHUB_API_KEY")
ALPHA_VANTAGE_API_KEY    = os.getenv("ALPHA_VANTAGE_API_KEY")
KAFKA_BOOTSTRAP_SERVERS  = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
REDIS_URL                = os.getenv("REDIS_URL", "redis://localhost:6379")

FINNHUB_WS_URL   = "wss://ws.finnhub.io"
KAFKA_TOPIC_MKT  = "raw_market_data"
POLL_INTERVAL_S  = 15          # Alpha Vantage fallback polling cadence (seconds)
CACHE_TTL_S      = 30

# Default symbols to subscribe
DEFAULT_SYMBOLS: List[str] = [
    "AAPL", "NVDA", "MSFT", "TSLA", "GOOGL",
    "AMZN", "META", "AMD", "JPM", "V",
]

# ─────────────────────────────────────────────────────────────────────────────
# Data models
# ─────────────────────────────────────────────────────────────────────────────

class MarketTick(BaseModel):
    symbol: str
    price: float
    volume: int
    bid: float
    ask: float
    spread: float
    change: float
    change_pct: float
    high: float
    low: float
    open: float
    prev_close: float
    timestamp: str
    source: str


# Finnhub WebSocket client

class FinnhubWSClient:
    """
    Opens a single WebSocket connection to Finnhub and fans out trades
    to a shared in-memory store + Redis + Kafka.
    """

    def __init__(self, symbols: List[str], tick_store: Dict[str, MarketTick]):
        self.symbols    = symbols
        self.tick_store = tick_store
        self._ws        = None
        self._running   = False
        self._last_prices: Dict[str, float] = {}

    async def connect_and_stream(self):
        """Main loop: connect, subscribe, process, reconnect on failure."""
        self._running = True

        while self._running:
            try:
                url = f"{FINNHUB_WS_URL}?token={FINNHUB_API_KEY}"
                logger.info("[FinnhubWS] Connecting …")

                async with websockets.connect(url, ping_interval=20) as ws:
                    self._ws = ws
                    logger.info("[FinnhubWS] Connected")

                    # Subscribe to all symbols
                    for sym in self.symbols:
                        await ws.send(json.dumps({"type": "subscribe", "symbol": sym}))

                    async for raw in ws:
                        if not self._running:
                            break
                        await self._handle_message(raw)

            except (websockets.exceptions.ConnectionClosed,
                    ConnectionRefusedError, OSError) as exc:
                logger.warning(f"[FinnhubWS] Disconnected ({exc}), reconnecting in 5 s …")
                await asyncio.sleep(5)
            except Exception as exc:
                logger.error(f"[FinnhubWS] Unexpected error: {exc}", exc_info=True)
                await asyncio.sleep(10)

    async def _handle_message(self, raw: str):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return

        if msg.get("type") != "trade":
            return

        for trade in msg.get("data", []):
            symbol = trade.get("s", "")
            price  = float(trade.get("p", 0))
            volume = int(trade.get("v", 0))

            if not symbol or not price:
                continue

            prev = self._last_prices.get(symbol, price)
            chg  = price - prev
            chg_pct = (chg / prev * 100) if prev else 0

            tick = MarketTick(
                symbol=symbol,
                price=price,
                volume=volume,
                bid=price - 0.01,
                ask=price + 0.01,
                spread=0.02,
                change=round(chg, 4),
                change_pct=round(chg_pct, 4),
                high=price,
                low=price,
                open=price,
                prev_close=prev,
                timestamp=datetime.utcfromtimestamp(
                    trade.get("t", time.time() * 1000) / 1000
                ).isoformat(),
                source="finnhub_ws",
            )

            self._last_prices[symbol] = price
            self.tick_store[symbol]   = tick

            # Push to Redis (non-blocking)
            asyncio.create_task(_push_redis(symbol, tick))
            # Push to Kafka (non-blocking)
            asyncio.create_task(_push_kafka(KAFKA_TOPIC_MKT, tick.dict()))

    async def stop(self):
        self._running = False
        if self._ws:
            await self._ws.close()

    async def add_symbol(self, symbol: str):
        if symbol not in self.symbols:
            self.symbols.append(symbol)
            if self._ws:
                await self._ws.send(json.dumps({"type": "subscribe", "symbol": symbol}))

    async def remove_symbol(self, symbol: str):
        if symbol in self.symbols:
            self.symbols.remove(symbol)
            if self._ws:
                await self._ws.send(json.dumps({"type": "unsubscribe", "symbol": symbol}))


# Alpha Vantage polling fallback

class AlphaVantagePoller:
    """
    Polls Alpha Vantage REST API on a timer.
    Used when Finnhub WS is unavailable or for AV-only symbols.
    """

    def __init__(self, symbols: List[str], tick_store: Dict[str, MarketTick]):
        self.symbols    = symbols
        self.tick_store = tick_store
        self._running   = False
        self._prev_prices: Dict[str, float] = {}

    async def start(self):
        self._running = True
        logger.info("[AVPoller] Started")
        while self._running:
            await self._poll_all()
            await asyncio.sleep(POLL_INTERVAL_S)

    async def stop(self):
        self._running = False

    async def _poll_all(self):
        async with httpx.AsyncClient(timeout=10) as client:
            for sym in self.symbols:
                try:
                    await self._fetch_one(client, sym)
                    await asyncio.sleep(0.5)          # respect rate limit
                except Exception as exc:
                    logger.warning(f"[AVPoller] {sym}: {exc}")

    async def _fetch_one(self, client: httpx.AsyncClient, symbol: str):
        resp = await client.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "GLOBAL_QUOTE",
                "symbol": symbol,
                "apikey": ALPHA_VANTAGE_API_KEY,
            },
        )
        data  = resp.json()
        quote = data.get("Global Quote", {})
        if not quote:
            return

        price     = float(quote.get("05. price", 0))
        prev      = self._prev_prices.get(symbol, float(quote.get("08. previous close", price)))
        chg       = float(quote.get("09. change", 0))
        chg_pct   = float(quote.get("10. change percent", "0%").replace("%", ""))
        volume    = int(float(quote.get("06. volume", 0)))

        tick = MarketTick(
            symbol=symbol,
            price=price,
            volume=volume,
            bid=price - 0.05,
            ask=price + 0.05,
            spread=0.10,
            change=chg,
            change_pct=chg_pct,
            high=float(quote.get("03. high", price)),
            low=float(quote.get("04. low", price)),
            open=float(quote.get("02. open", price)),
            prev_close=float(quote.get("08. previous close", price)),
            timestamp=datetime.utcnow().isoformat(),
            source="alpha_vantage_poll",
        )

        self._prev_prices[symbol] = price
        self.tick_store[symbol]   = tick
        asyncio.create_task(_push_redis(symbol, tick))
        asyncio.create_task(_push_kafka(KAFKA_TOPIC_MKT, tick.dict()))


# Integration helpers (Redis & Kafka)

_redis_cache: Optional[object] = None
_kafka_producer: Optional[object] = None


async def _push_redis(symbol: str, tick: MarketTick):
    global _redis_cache
    if not REDIS_AVAILABLE or _redis_cache is None:
        return
    try:
        await _redis_cache.set(f"tick:{symbol}", tick.json(), ttl=CACHE_TTL_S)
    except Exception as exc:
        logger.debug(f"[Redis] push failed: {exc}")


async def _push_kafka(topic: str, payload: dict):
    global _kafka_producer
    if not KAFKA_AVAILABLE or _kafka_producer is None:
        return
    try:
        await _kafka_producer.send(topic, payload, key=payload.get("symbol"))
    except Exception as exc:
        logger.debug(f"[Kafka] push failed: {exc}")


# WebSocket connection manager (server-side fans to browser clients)

class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, message: str):
        dead = set()
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self.active -= dead


# FastAPI app

app = FastAPI(
    title="MarketData-Ingestor (WebSocket)",
    description="Real-time WebSocket-based market data ingestion",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared state
tick_store:  Dict[str, MarketTick] = {}
conn_mgr     = ConnectionManager()
finnhub_ws:  Optional[FinnhubWSClient]    = None
av_poller:   Optional[AlphaVantagePoller] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global finnhub_ws, av_poller, _redis_cache, _kafka_producer

    # Redis
    if REDIS_AVAILABLE:
        _redis_cache = RedisCache(REDIS_URL)
        await _redis_cache.connect()

    # Kafka
    if KAFKA_AVAILABLE:
        _kafka_producer = AIOKafkaProducerWrapper(KAFKA_BOOTSTRAP_SERVERS)
        await _kafka_producer.connect()

    # Finnhub WebSocket (primary)
    if FINNHUB_API_KEY:
        finnhub_ws = FinnhubWSClient(list(DEFAULT_SYMBOLS), tick_store)
        asyncio.create_task(finnhub_ws.connect_and_stream())
        logger.info("[Startup] Finnhub WS task launched")
    else:
        logger.warning("[Startup] FINNHUB_API_KEY not set – falling back to AV poller")

    # Alpha Vantage poller (always on for REST-based symbols / fallback)
    av_poller = AlphaVantagePoller(list(DEFAULT_SYMBOLS), tick_store)
    asyncio.create_task(av_poller.start())

    # Broadcaster: push tick_store changes to browser WebSocket clients every second
    broadcast_task = asyncio.create_task(_broadcast_loop())

    # Yield control to the FastAPI application
    yield 

    broadcast_task.cancel() # Cleanly cancel the infinite broadcast loop
    
    if finnhub_ws:
        await finnhub_ws.stop()
    if av_poller:
        await av_poller.stop()
    if _kafka_producer and KAFKA_AVAILABLE:
        await _kafka_producer.disconnect()
    if _redis_cache and REDIS_AVAILABLE:
        await _redis_cache.disconnect()


# Broadcaster

async def _broadcast_loop():
    """Push the current tick_store snapshot to all browser WS clients every second."""
    while True:
        if tick_store and conn_mgr.active:
            payload = {
                "type": "market_update",
                "data": {sym: tick.dict() for sym, tick in tick_store.items()},
                "timestamp": datetime.utcnow().isoformat(),
            }
            await conn_mgr.broadcast(json.dumps(payload))
        await asyncio.sleep(1)


# Routes

@app.websocket("/ws/market")
async def ws_market(websocket: WebSocket):
    """
    Browser/client WebSocket endpoint.
    Receives real-time market ticks pushed from the broadcaster loop.
    Accepts subscribe/unsubscribe commands from the client.
    """
    await conn_mgr.connect(websocket)
    # Send current snapshot immediately
    if tick_store:
        await websocket.send_text(json.dumps({
            "type": "snapshot",
            "data": {sym: tick.dict() for sym, tick in tick_store.items()},
        }))

    try:
        while True:
            # Listen for client commands (subscribe / unsubscribe)
            raw = await websocket.receive_text()
            cmd = json.loads(raw)
            action = cmd.get("action")
            symbol = cmd.get("symbol", "").upper()

            if action == "subscribe" and symbol:
                if finnhub_ws:
                    await finnhub_ws.add_symbol(symbol)
                if av_poller and symbol not in av_poller.symbols:
                    av_poller.symbols.append(symbol)
                await websocket.send_text(json.dumps({"type": "subscribed", "symbol": symbol}))

            elif action == "unsubscribe" and symbol:
                if finnhub_ws:
                    await finnhub_ws.remove_symbol(symbol)
                await websocket.send_text(json.dumps({"type": "unsubscribed", "symbol": symbol}))

    except WebSocketDisconnect:
        conn_mgr.disconnect(websocket)
    except Exception as exc:
        logger.warning(f"[WS] client error: {exc}")
        conn_mgr.disconnect(websocket)


@app.get("/api/v1/quote/{symbol}", response_model=MarketTick)
async def get_quote(symbol: str):
    """REST fallback – returns the latest cached tick."""
    sym = symbol.upper()

    # Check Redis first
    if REDIS_AVAILABLE and _redis_cache:
        cached = await _redis_cache.get(f"tick:{sym}")
        if cached:
            return MarketTick(**json.loads(cached))

    # Check in-memory store
    if sym in tick_store:
        return tick_store[sym]

    raise HTTPException(status_code=404, detail=f"No data for {sym}")


@app.get("/api/v1/quotes")
async def get_quotes(symbols: str = Query(default=",".join(DEFAULT_SYMBOLS))):
    sym_list = [s.strip().upper() for s in symbols.split(",")]
    return {
        "quotes": [tick_store[s].dict() for s in sym_list if s in tick_store],
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/api/v1/subscribe/{symbol}")
async def subscribe_symbol(symbol: str):
    sym = symbol.upper()
    if finnhub_ws:
        await finnhub_ws.add_symbol(sym)
    if av_poller and sym not in av_poller.symbols:
        av_poller.symbols.append(sym)
    return {"status": "subscribed", "symbol": sym}


@app.delete("/api/v1/subscribe/{symbol}")
async def unsubscribe_symbol(symbol: str):
    sym = symbol.upper()
    if finnhub_ws:
        await finnhub_ws.remove_symbol(sym)
    if av_poller and sym in av_poller.symbols:
        av_poller.symbols.remove(sym)
    return {"status": "unsubscribed", "symbol": sym}


@app.get("/health")
async def health():
    return {
        "service": "MarketData-Ingestor",
        "version": "3.0.0",
        "finnhub_ws": finnhub_ws is not None,
        "av_poller": av_poller is not None,
        "tracked_symbols": len(tick_store),
        "ws_clients": len(conn_mgr.active),
        "kafka": KAFKA_AVAILABLE,
        "redis": REDIS_AVAILABLE,
        "timestamp": datetime.utcnow().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)