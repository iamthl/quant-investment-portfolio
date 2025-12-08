"""
Market Data Ingestor Microservice
FastAPI service that connects to Finnhub (primary) & Alpha Vantage (backup)
and publishes to Kafka topic: raw_market_data
"""

import asyncio
import json
import os
import httpx
from datetime import datetime
from typing import Optional, Dict
from fastapi import FastAPI, WebSocket, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(
    title="MarketData-Ingestor",
    description="Real-time market data ingestion (Finnhub + Alpha Vantage)",
    version="2.1.0"
)

# Configuration
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_RAW_MARKET = "raw_market_data"

class MarketDataPoint(BaseModel):
    symbol: str
    price: float
    volume: int
    timestamp: str
    high: float
    low: float
    open: float
    previous_close: float
    change: float
    change_percent: float
    source: str

# In-memory cache
price_cache: Dict[str, tuple] = {}
CACHE_TTL_SECONDS = 30

async def fetch_finnhub_quote(client: httpx.AsyncClient, symbol: str) -> Optional[MarketDataPoint]:
    try:
        response = await client.get(
            f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={FINNHUB_API_KEY}",
            timeout=5.0
        )
        if response.status_code != 200: return None
        
        data = response.json()
        if data.get("c", 0) == 0: return None # Invalid symbol or no data

        return MarketDataPoint(
            symbol=symbol,
            price=float(data["c"]),
            volume=0, # Finnhub quote doesn't strictly provide volume on free tier
            timestamp=datetime.utcnow().isoformat(),
            high=float(data["h"]),
            low=float(data["l"]),
            open=float(data["o"]),
            previous_close=float(data["pc"]),
            change=float(data["d"]),
            change_percent=float(data["dp"]),
            source="finnhub"
        )
    except Exception as e:
        print(f"[Finnhub] Error: {e}")
        return None

async def fetch_alpha_vantage_quote(client: httpx.AsyncClient, symbol: str) -> Optional[MarketDataPoint]:
    try:
        response = await client.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "GLOBAL_QUOTE",
                "symbol": symbol,
                "apikey": ALPHA_VANTAGE_API_KEY
            },
            timeout=5.0
        )
        if response.status_code != 200: return None
        data = response.json()
        
        quote = data.get("Global Quote", {})
        if not quote: return None

        return MarketDataPoint(
            symbol=symbol,
            price=float(quote.get("05. price", 0)),
            volume=int(quote.get("06. volume", 0)),
            timestamp=datetime.utcnow().isoformat(),
            high=float(quote.get("03. high", 0)),
            low=float(quote.get("04. low", 0)),
            open=float(quote.get("02. open", 0)),
            previous_close=float(quote.get("08. previous close", 0)),
            change=float(quote.get("09. change", 0)),
            change_percent=float(quote.get("10. change percent", "0%").replace("%", "")),
            source="alpha_vantage"
        )
    except Exception as e:
        print(f"[AlphaVantage] Error: {e}")
        return None

@app.get("/api/v1/quote/{symbol}", response_model=MarketDataPoint)
async def get_quote(symbol: str):
    symbol = symbol.upper()
    
    # Check cache
    if symbol in price_cache:
        cached_data, cached_time = price_cache[symbol]
        if (datetime.utcnow() - cached_time).seconds < CACHE_TTL_SECONDS:
            return cached_data

    async with httpx.AsyncClient() as client:
        # Try Finnhub first (Primary)
        data = await fetch_finnhub_quote(client, symbol)
        
        # Fallback to Alpha Vantage
        if not data:
            data = await fetch_alpha_vantage_quote(client, symbol)
            
        if not data:
            raise HTTPException(status_code=404, detail="Symbol not found or API limits reached")

        # Cache and return
        price_cache[symbol] = (data, datetime.utcnow())
        
        # In production: await publish_to_kafka(KAFKA_TOPIC_RAW_MARKET, data.model_dump())
        
        return data

async def publish_to_kafka(topic: str, message: dict):
    # Stub for Kafka publishing
    print(f"[Kafka] Publishing to {topic}: {message['symbol']} ${message['price']}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)