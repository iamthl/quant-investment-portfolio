"""
News Ingestor Microservice
FastAPI service that fetches news from Alpha Vantage News Sentiment API
and applies FinBERT sentiment analysis before publishing to Kafka
"""

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
import httpx

#  FinBERT singleton 
try:
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    _FINBERT_AVAILABLE = True
except ImportError:
    _FINBERT_AVAILABLE = False

_finbert_tokenizer = None
_finbert_model     = None
_finbert_device    = "cpu"

def _load_finbert() -> bool:
    """Load ProsusAI/finbert once. Returns True on success."""
    global _finbert_tokenizer, _finbert_model, _finbert_device
    if _finbert_model is not None:
        return True
    if not _FINBERT_AVAILABLE:
        return False
    try:
        print("[FinBERT] Loading ProsusAI/finbert …")
        _finbert_device    = "cuda" if torch.cuda.is_available() else "cpu"
        _finbert_tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
        _finbert_model     = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")
        _finbert_model.to(_finbert_device)
        _finbert_model.eval()
        print(f"[FinBERT] Loaded on {_finbert_device}")
        return True
    except Exception as exc:
        print(f"[FinBERT] Load failed: {exc}")
        return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_finbert()
    yield

app = FastAPI(
    title="News-Ingestor",
    description="News ingestion with Alpha Vantage News Sentiment + FinBERT analysis",
    version="2.0.0",
    lifespan=lifespan,
)

ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

# Kafka configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_RAW_NEWS = "raw_news_articles"
KAFKA_TOPIC_SENTIMENT = "sentiment_scores"

class NewsArticle(BaseModel):
    id: str
    headline: str
    summary: str
    source: str
    url: str
    published_at: str
    symbols: List[str]
    sentiment_score: float
    sentiment_label: str
    relevance_score: float
    banner_image: Optional[str] = None

class SentimentResult(BaseModel):
    text: str
    score: float
    label: str
    confidence: float

class ServiceHealth(BaseModel):
    service: str
    status: str
    latency_ms: float
    kafka_connected: bool
    finbert_loaded: bool
    api_provider: str
    last_update: str

# Cache for news to avoid rate limits
news_cache: Dict[str, tuple] = {}
CACHE_TTL_SECONDS = 300

def get_sentiment_label(score: float) -> str:
    """Convert Alpha Vantage sentiment score to label"""
    if score >= 0.35:
        return "Bullish"
    elif score >= 0.15:
        return "Somewhat-Bullish"
    elif score >= -0.15:
        return "Neutral"
    elif score >= -0.35:
        return "Somewhat-Bearish"
    return "Bearish"

def format_alpha_vantage_date(date_str: str) -> str:
    """Convert Alpha Vantage date format to ISO format"""
    if not date_str:
        return datetime.now(timezone.utc).isoformat()
    try:
        # Format: 20231215T143000
        dt = datetime.strptime(date_str, "%Y%m%dT%H%M%S")
        return dt.isoformat()
    except:
        return datetime.now(timezone.utc).isoformat()

def _keyword_fallback(text: str) -> SentimentResult:
    """Keyword heuristic — used only when FinBERT is unavailable."""
    positive_kw = ["surge","growth","profit","bullish","upgrade","record","beat","strong",
                   "soar","rally","gain","boom","breakthrough","optimistic","outperform",
                   "exceed","momentum","upside","buy","accumulate"]
    negative_kw = ["crash","loss","bearish","downgrade","miss","weak","decline","concern",
                   "fall","drop","plunge","risk","warning","sell","underperform","cut",
                   "layoff","recession","default","bankruptcy"]
    t = text.lower()
    pos = sum(1 for w in positive_kw if w in t)
    neg = sum(1 for w in negative_kw if w in t)
    total = pos + neg
    if total == 0:
        return SentimentResult(text=text[:100], score=0.0, label="neutral", confidence=0.5)
    score = max(-1.0, min(1.0, (pos - neg) / total * 0.8))
    label = "positive" if score > 0.15 else "negative" if score < -0.15 else "neutral"
    return SentimentResult(text=text[:100], score=round(score, 3), label=label,
                           confidence=round(min(0.95, 0.5 + abs(score) * 0.5), 3))


def analyse_sentiment_finbert(text: str) -> SentimentResult:
    if not _load_finbert():
        return _keyword_fallback(text)

    try:
        import torch

        inputs = _finbert_tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        )
        inputs = {k: v.to(_finbert_device) for k, v in inputs.items()}

        with torch.no_grad():
            logits = _finbert_model(**inputs).logits
            probs  = torch.softmax(logits, dim=-1)[0].cpu().tolist()

        # FinBERT label order: positive=0, negative=1, neutral=2
        id2label = _finbert_model.config.id2label
        prob_map  = {id2label[i].lower(): probs[i] for i in range(len(probs))}

        pos_prob  = prob_map.get("positive", 0.0)
        neg_prob  = prob_map.get("negative", 0.0)
        score     = round(pos_prob - neg_prob, 4)          # [-1, +1]
        label     = max(prob_map, key=prob_map.__getitem__) 
        confidence = round(max(probs), 4)

        return SentimentResult(text=text[:100], score=score, label=label, confidence=confidence)

    except Exception as exc:
        print(f"[FinBERT] Inference error: {exc} — falling back to keywords")
        return _keyword_fallback(text)

# @app.get("/")
# async def root():
#     return {
#         "service": "News-Ingestor",
#         "status": "running",
#         "version": "2.0.0",
#         "api_provider": "Alpha Vantage"
#     }

# @app.get("/health", response_model=ServiceHealth)
# async def health_check():
#     return ServiceHealth(
#         service="News-Ingestor",
#         status="online",
#         latency_ms=42.8,
#         kafka_connected=True,
#         finbert_loaded=True,
#         api_provider="Alpha Vantage",
#         last_update=datetime.now(timezone.utc).isoformat()
#     )

@app.get("/api/v1/news")
async def get_news(
    tickers: str = Query("AAPL,NVDA,TSLA", description="Comma-separated stock tickers"),
    topics: str = Query("technology,earnings", description="News topics"),
    limit: int = Query(10, description="Number of articles to return"),
    sort: str = Query("LATEST", description="Sort order: LATEST, EARLIEST, RELEVANCE")
):
    """Fetch news from Alpha Vantage News Sentiment API"""
    cache_key = f"{tickers}-{topics}-{limit}"
    
    # Check cache
    if cache_key in news_cache:
        cached_data, cached_time = news_cache[cache_key]
        if (datetime.now(timezone.utc).replace(tzinfo=None) - cached_time).seconds < CACHE_TTL_SECONDS:
            return cached_data
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                ALPHA_VANTAGE_BASE_URL,
                params={
                    "function": "NEWS_SENTIMENT",
                    "tickers": tickers,
                    "topics": topics,
                    "limit": min(limit, 50),
                    "sort": sort,
                    "apikey": ALPHA_VANTAGE_API_KEY
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch news")
            
            data = response.json()
            
            # Check for rate limit
            if "Note" in data or "Information" in data:
                raise HTTPException(status_code=429, detail="API rate limit reached")
            
            feed = data.get("feed", [])
            if not feed:
                return {"articles": [], "count": 0, "source": "alpha_vantage"}
            
            articles = []
            for idx, item in enumerate(feed):
                # Get ticker-specific sentiment
                ticker_sentiment = item.get("ticker_sentiment", [])
                symbols = [ts.get("ticker", "") for ts in ticker_sentiment]
                
                # Use overall sentiment from Alpha Vantage
                overall_score = item.get("overall_sentiment_score", 0)
                
                # Also run our FinBERT analysis for comparison
                finbert_result = analyse_sentiment_finbert(item.get("title", ""))
                
                # Combine scores (weighted average)
                combined_score = (overall_score * 0.6) + (finbert_result.score * 0.4)
                
                article = NewsArticle(
                    id=str(idx),
                    headline=item.get("title", ""),
                    summary=item.get("summary", "")[:500],
                    source=item.get("source", "Unknown"),
                    url=item.get("url", "#"),
                    published_at=format_alpha_vantage_date(item.get("time_published", "")),
                    symbols=symbols,
                    sentiment_score=round(combined_score, 3),
                    sentiment_label=get_sentiment_label(combined_score),
                    relevance_score=float(ticker_sentiment[0].get("relevance_score", 0.5)) if ticker_sentiment else 0.5,
                    banner_image=item.get("banner_image")
                )
                articles.append(article)
                
                # Publish to Kafka
                await publish_to_kafka(KAFKA_TOPIC_RAW_NEWS, article.model_dump())
            
            result = {
                "articles": [a.model_dump() for a in articles],
                "count": len(articles),
                "source": "alpha_vantage",
                "sentiment_feed_label": data.get("sentiment_score_definition", "")
            }
            
            # Cache the result
            news_cache[cache_key] = (result, datetime.now(timezone.utc).replace(tzinfo=None))
            
            return result
            
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Request timeout")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/news/topics")
async def get_news_by_topic(
    topic: str = Query(..., description="Topic: blockchain, earnings, ipo, mergers_and_acquisitions, financial_markets, economy_fiscal, economy_monetary, economy_macro, energy_transportation, finance, life_sciences, manufacturing, real_estate, retail_wholesale, technology"),
    limit: int = 10
):
    """Get news filtered by specific topic"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                ALPHA_VANTAGE_BASE_URL,
                params={
                    "function": "NEWS_SENTIMENT",
                    "topics": topic,
                    "limit": min(limit, 50),
                    "apikey": ALPHA_VANTAGE_API_KEY
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch news")
            
            data = response.json()
            
            if "Note" in data or "Information" in data:
                raise HTTPException(status_code=429, detail="API rate limit reached")
            
            feed = data.get("feed", [])
            
            articles = []
            for idx, item in enumerate(feed):
                sentiment_score = item.get("overall_sentiment_score", 0)
                articles.append({
                    "id": str(idx),
                    "headline": item.get("title", ""),
                    "summary": item.get("summary", "")[:300],
                    "source": item.get("source", "Unknown"),
                    "url": item.get("url", "#"),
                    "published_at": format_alpha_vantage_date(item.get("time_published", "")),
                    "sentiment_score": sentiment_score,
                    "sentiment_label": get_sentiment_label(sentiment_score),
                    "topics": [t.get("topic", "") for t in item.get("topics", [])]
                })
            
            return {"topic": topic, "articles": articles, "count": len(articles)}
            
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Request timeout")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/analyze-sentiment")
async def analyze_text_sentiment(text: str):
    """Analyze sentiment of custom text using FinBERT-style analysis"""
    result = analyse_sentiment_finbert(text)
    return result.model_dump()

@app.get("/api/v1/sentiment-aggregate/{ticker}")
async def get_sentiment_aggregate(ticker: str):
    """Get aggregated sentiment for a specific ticker from recent news"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                ALPHA_VANTAGE_BASE_URL,
                params={
                    "function": "NEWS_SENTIMENT",
                    "tickers": ticker.upper(),
                    "limit": 50,
                    "apikey": ALPHA_VANTAGE_API_KEY
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch news")
            
            data = response.json()
            
            if "Note" in data or "Information" in data:
                raise HTTPException(status_code=429, detail="API rate limit reached")
            
            feed = data.get("feed", [])
            
            if not feed:
                return {
                    "ticker": ticker,
                    "avg_sentiment": 0,
                    "article_count": 0,
                    "sentiment_distribution": {"bullish": 0, "neutral": 0, "bearish": 0}
                }
            
            scores = []
            distribution = {"bullish": 0, "neutral": 0, "bearish": 0}
            
            for item in feed:
                # Find ticker-specific sentiment
                for ts in item.get("ticker_sentiment", []):
                    if ts.get("ticker", "").upper() == ticker.upper():
                        score = float(ts.get("ticker_sentiment_score", 0))
                        scores.append(score)
                        
                        if score >= 0.15:
                            distribution["bullish"] += 1
                        elif score <= -0.15:
                            distribution["bearish"] += 1
                        else:
                            distribution["neutral"] += 1
                        break
            
            avg_sentiment = sum(scores) / len(scores) if scores else 0
            
            return {
                "ticker": ticker.upper(),
                "avg_sentiment": round(avg_sentiment, 3),
                "article_count": len(scores),
                "sentiment_distribution": distribution,
                "overall_label": get_sentiment_label(avg_sentiment)
            }
            
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Request timeout")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

async def publish_to_kafka(topic: str, message: dict):
    """Kafka producer - in production use aiokafka"""
    print(f"[Kafka] Publishing to {topic}: {json.dumps(message)[:100]}...")
    return True

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
