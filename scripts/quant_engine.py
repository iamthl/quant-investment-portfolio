"""
Quant Engine Microservice - ML Enhanced Version
FastAPI service that combines Alpha Vantage technical analysis with sentiment
to generate trading signals and insights using predictive modeling.
"""

import asyncio
import json
import os
import logging
import uuid
from datetime import datetime
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
import httpx
from databases import Database
from predictive_model import get_model, fetch_historical_ohlcv

app = FastAPI(
    title="Quant-Engine-ML",
    description="ML-based Technical analysis + Sentiment fusion engine using Alpha Vantage",
    version="3.0.0"
)

# Configuration
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://quant_user:quant_password@postgres:5432/quant_platform")

# Kafka topics
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_QUANT_INSIGHTS = "quant_insights"
KAFKA_TOPIC_TRADING_SIGNALS = "trading_signals"

# Initialize Database
database = Database(DATABASE_URL)

@app.on_event("startup")
async def startup():
    await database.connect()

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

# Data Models 

class TechnicalIndicators(BaseModel):
    symbol: str
    rsi: float
    macd: float
    macd_signal: float
    macd_histogram: float
    sma_20: float
    sma_50: float
    ema_12: float
    ema_26: float
    bollinger_upper: float
    bollinger_middle: float
    bollinger_lower: float
    atr: float
    adx: float
    stoch_k: float
    stoch_d: float
    obv: float
    timestamp: str

class QuantInsight(BaseModel):
    symbol: str
    technical_score: float
    sentiment_score: float
    fused_score: float
    action: str
    confidence: float
    reasoning: str
    probability_increase: Optional[float] = None
    feature_importances: Optional[Dict[str, float]] = None
    model_type: str
    technical_factors: List[str] = []
    sentiment_factors: List[str] = []
    risk_level: str
    entry_zone: Optional[Dict] = None
    timestamp: str

class TradingSignal(BaseModel):
    symbol: str
    action: str
    entry_price: float
    stop_loss: float
    take_profit: float
    position_size_pct: float
    confidence: float
    risk_reward_ratio: float
    timestamp: str

class ServiceHealth(BaseModel):
    service: str
    status: str
    latency_ms: float
    kafka_connected: bool
    models_loaded: bool
    api_provider: str
    last_update: str

# ── Utility Functions ────────────────────────────────────────────────────────

def calculate_sentiment_score(sentiment_data: dict) -> tuple:
    avg_sentiment = sentiment_data.get("avg_sentiment", 0)
    article_count = sentiment_data.get("article_count", 0)
    factors = []
    score = 50 + (avg_sentiment * 50)
    if avg_sentiment >= 0.35:
        factors.append(f"Strong bullish sentiment ({avg_sentiment:.2f})")
    elif avg_sentiment <= -0.35:
        factors.append(f"Strong bearish sentiment ({avg_sentiment:.2f})")
    else:
        factors.append(f"Neutral sentiment ({avg_sentiment:.2f})")
    factors.append(f"Based on {article_count} recent articles")
    return max(0, min(100, score)), factors

async def publish_to_kafka(topic: str, message: dict):
    print(f"[Kafka] Publishing to {topic}: {json.dumps(message)[:100]}...")
    return True

# API Endpoints 

@app.get("/")
async def root():
    return {"service": "Quant-Engine-ML", "status": "running", "version": "3.0.0"}

@app.post("/api/v1/admin/train/{symbol}")
async def train_model(symbol: str):
    try:
        model = get_model()
        df = await fetch_historical_ohlcv(symbol.upper(), outputsize="full")
        metrics = model.train(df)
        model.save()
        return {"status": "success", "symbol": symbol, "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/insights")
async def get_quant_insights(symbols: str = Query("AAPL,NVDA,MSFT")):
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    insights = []
    model = get_model(horizon_days=5)
    
    async with httpx.AsyncClient() as client:
        for symbol in symbol_list[:5]:
            try:
                # Fetch data & Prediction
                df = await fetch_historical_ohlcv(symbol, db=database, outputsize="compact")
                prediction = model.predict(df, symbol)
                tech_score = prediction.technical_score
                
                # Sentiment analysis
                sentiment_response = await client.get(
                    ALPHA_VANTAGE_BASE_URL,
                    params={"function": "NEWS_SENTIMENT", "tickers": symbol, "limit": 20, "apikey": ALPHA_VANTAGE_API_KEY},
                    timeout=30.0
                )
                sentiment_score = 50
                sentiment_factors = ["No sentiment data"]
                if sentiment_response.status_code == 200:
                    sentiment_data = sentiment_response.json()
                    if "feed" in sentiment_data:
                        scores = [float(ts.get("ticker_sentiment_score", 0)) for article in sentiment_data["feed"] for ts in article.get("ticker_sentiment", []) if ts.get("ticker", "").upper() == symbol]
                        if scores:
                            avg_sentiment = sum(scores) / len(scores)
                            sentiment_score, sentiment_factors = calculate_sentiment_score({"avg_sentiment": avg_sentiment, "article_count": len(scores)})

                # Fuse scores
                fused = round((tech_score * 0.7) + (sentiment_score * 0.3), 2)
                
                # LOG TO DATABASE (FOR HISTORY OVERLAY)
                query = """
                    INSERT INTO "AIPrediction" 
                    (id, symbol, "probabilityIncrease", confidence, action, "modelType", "featureImportances", timestamp)
                    VALUES (:id, :symbol, :prob, :conf, :action, :model, :features, :ts)
                """
                await database.execute(query=query, values={
                    "id": str(uuid.uuid4()),
                    "symbol": symbol,
                    "prob": prediction.probability_increase,
                    "conf": prediction.confidence * 100,
                    "action": prediction.action,
                    "model": prediction.model_type,
                    "features": json.dumps(prediction.feature_importances),
                    "ts": datetime.utcnow()
                })

                insight = QuantInsight(
                    symbol=symbol, technical_score=tech_score, sentiment_score=sentiment_score,
                    fused_score=fused, action=prediction.action, confidence=prediction.confidence * 100,
                    reasoning=f"ML Model ({prediction.model_type}) predicts {prediction.probability_increase:.1%} chance of increase.",
                    probability_increase=prediction.probability_increase,
                    feature_importances=prediction.feature_importances,
                    model_type=prediction.model_type, sentiment_factors=sentiment_factors,
                    risk_level="MEDIUM" if 0.4 < prediction.probability_increase < 0.6 else "LOW",
                    timestamp=datetime.utcnow().isoformat()
                )
                insights.append(insight)
                await publish_to_kafka(KAFKA_TOPIC_QUANT_INSIGHTS, insight.model_dump())
                await asyncio.sleep(12)
                
            except Exception as e:
                logging.error(f"Error processing {symbol}: {str(e)}")
                continue
    
    return {"insights": [i.model_dump() for i in insights], "count": len(insights)}

@app.get("/api/v1/signals/{symbol}", response_model=TradingSignal)
async def get_trading_signal(symbol: str):
    symbol = symbol.upper()
    async with httpx.AsyncClient() as client:
        quote_response = await client.get(ALPHA_VANTAGE_BASE_URL, params={"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": ALPHA_VANTAGE_API_KEY}, timeout=30.0)
        current_price = 100.0
        if quote_response.status_code == 200:
            quote_data = quote_response.json()
            current_price = float(quote_data.get("Global Quote", {}).get("05. price", 100))
    
    insights_res = await get_quant_insights(symbol)
    insight = insights_res["insights"][0] if insights_res["insights"] else None
    if not insight: raise HTTPException(status_code=404, detail="Signal error")
    
    sl_tp = {"STRONG_BUY": (0.95, 1.12), "BUY": (0.95, 1.12), "STRONG_SELL": (1.05, 0.88), "SELL": (1.05, 0.88)}
    mults = sl_tp.get(insight["action"], (1.0, 1.0))
    
    signal = TradingSignal(
        symbol=symbol, action=insight["action"], entry_price=round(current_price, 2),
        stop_loss=round(current_price * mults[0], 2), take_profit=round(current_price * mults[1], 2),
        position_size_pct=5.0 if "STRONG" in insight["action"] else 3.0,
        confidence=insight["confidence"], risk_reward_ratio=2.4, timestamp=datetime.utcnow().isoformat()
    )
    await publish_to_kafka(KAFKA_TOPIC_TRADING_SIGNALS, signal.model_dump())
    return signal

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)