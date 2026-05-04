# ITC-04: Sentiment Aggregate Distribution

import sys
import os
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

for _mod in ("torch", "transformers"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

import pytest
from fastapi.testclient import TestClient



def _mock_av_client(payload: dict):
    """Return a mock AsyncClient class that always replies with payload."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = payload

    class _Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *_): pass
        async def get(self, *_a, **_kw): return mock_resp

    return _Client


def _make_feed(ticker: str, scores: list) -> dict:
    """Build an Alpha Vantage feed with one article per score, all for ticker."""
    return {
        "feed": [
            {"ticker_sentiment": [{"ticker": ticker, "ticker_sentiment_score": str(s)}]}
            for s in scores
        ]
    }



MSFT_SCORES = [0.40, 0.25, 0.05, -0.05, -0.20, -0.50]
# avg = (0.40+0.25+0.05-0.05-0.20-0.50)/6 = -0.05/6 ≈ -0.008
EXPECTED_AVG = round(sum(MSFT_SCORES) / len(MSFT_SCORES), 3)   # -0.008



class TestSentimentAggregateDistribution:
    """ITC-04: /api/v1/sentiment-aggregate/{ticker}"""

    def test_six_article_distribution(self):
        """
        6 MSFT articles with scores [0.40, 0.25, 0.05, -0.05, -0.20, -0.50]:
          article_count = 6
          avg_sentiment ≈ -0.008  (neutral)
          distribution: bullish=2, neutral=2, bearish=2
          overall_label = "Neutral"
        """
        import scripts.news_ingestor as mod

        feed = _make_feed("MSFT", MSFT_SCORES)

        with patch.object(mod.httpx, "AsyncClient", _mock_av_client(feed)):
            client = TestClient(mod.app)
            response = client.get("/api/v1/sentiment-aggregate/MSFT")

        assert response.status_code == 200
        body = response.json()

        assert body["ticker"] == "MSFT"
        assert body["article_count"] == 6

        assert body["avg_sentiment"] == EXPECTED_AVG, (
            f"expected avg_sentiment={EXPECTED_AVG}, got {body['avg_sentiment']}"
        )

        dist = body["sentiment_distribution"]
        assert dist["bullish"] == 2,  f"expected bullish=2, got {dist['bullish']}"
        assert dist["neutral"] == 2,  f"expected neutral=2, got {dist['neutral']}"
        assert dist["bearish"] == 2,  f"expected bearish=2, got {dist['bearish']}"

        assert body["overall_label"] == "Neutral", (
            f"expected 'Neutral', got {body['overall_label']}"
        )

    def test_boundary_score_015_is_bullish(self):
        """Score exactly 0.15 falls into bullish bucket (>= 0.15)."""
        import scripts.news_ingestor as mod

        feed = _make_feed("AAPL", [0.15])
        with patch.object(mod.httpx, "AsyncClient", _mock_av_client(feed)):
            body = TestClient(mod.app).get("/api/v1/sentiment-aggregate/AAPL").json()

        assert body["sentiment_distribution"]["bullish"] == 1
        assert body["sentiment_distribution"]["neutral"] == 0

    def test_boundary_score_neg015_is_bearish(self):
        """Score exactly -0.15 falls into bearish bucket (<= -0.15)."""
        import scripts.news_ingestor as mod

        feed = _make_feed("AAPL", [-0.15])
        with patch.object(mod.httpx, "AsyncClient", _mock_av_client(feed)):
            body = TestClient(mod.app).get("/api/v1/sentiment-aggregate/AAPL").json()

        assert body["sentiment_distribution"]["bearish"] == 1
        assert body["sentiment_distribution"]["neutral"] == 0


    def test_overall_label_bullish_when_avg_above_035(self):
        """avg >= 0.35 → overall_label = 'Bullish'."""
        import scripts.news_ingestor as mod

        feed = _make_feed("AAPL", [0.50, 0.40, 0.35])
        with patch.object(mod.httpx, "AsyncClient", _mock_av_client(feed)):
            body = TestClient(mod.app).get("/api/v1/sentiment-aggregate/AAPL").json()

        assert body["overall_label"] == "Bullish"

    def test_overall_label_bearish_when_avg_below_neg035(self):
        """avg < -0.35 → overall_label = 'Bearish'."""
        import scripts.news_ingestor as mod

        feed = _make_feed("AAPL", [-0.50, -0.40, -0.60])
        with patch.object(mod.httpx, "AsyncClient", _mock_av_client(feed)):
            body = TestClient(mod.app).get("/api/v1/sentiment-aggregate/AAPL").json()

        assert body["overall_label"] == "Bearish"

 
    def test_lowercase_ticker_normalised_to_uppercase(self):
        """Sending 'msft' should match ticker_sentiment for 'MSFT' and return ticker='MSFT'."""
        import scripts.news_ingestor as mod

        feed = _make_feed("MSFT", [0.30])
        with patch.object(mod.httpx, "AsyncClient", _mock_av_client(feed)):
            body = TestClient(mod.app).get("/api/v1/sentiment-aggregate/msft").json()

        assert body["ticker"] == "MSFT"
        assert body["article_count"] == 1

    def test_empty_feed_returns_zeros(self):
        """Empty Alpha Vantage feed → article_count=0, all buckets=0."""
        import scripts.news_ingestor as mod

        with patch.object(mod.httpx, "AsyncClient", _mock_av_client({"feed": []})):
            body = TestClient(mod.app).get("/api/v1/sentiment-aggregate/AAPL").json()

        assert body["article_count"] == 0
        assert body["avg_sentiment"] == 0
        dist = body["sentiment_distribution"]
        assert dist["bullish"] == dist["neutral"] == dist["bearish"] == 0

    def test_articles_for_other_ticker_ignored(self):
        """Articles whose ticker_sentiment doesn't match the requested ticker are skipped."""
        import scripts.news_ingestor as mod

        feed = {
            "feed": [
                {"ticker_sentiment": [{"ticker": "NVDA", "ticker_sentiment_score": "0.80"}]},
                {"ticker_sentiment": [{"ticker": "AAPL", "ticker_sentiment_score": "0.20"}]},
            ]
        }
        with patch.object(mod.httpx, "AsyncClient", _mock_av_client(feed)):
            body = TestClient(mod.app).get("/api/v1/sentiment-aggregate/AAPL").json()

        assert body["article_count"] == 1
        assert body["avg_sentiment"] == 0.20
        assert body["sentiment_distribution"]["bullish"] == 1

    def test_rate_limit_returns_429(self):
        """Alpha Vantage 'Note' key → 429."""
        import scripts.news_ingestor as mod

        with patch.object(mod.httpx, "AsyncClient",
                          _mock_av_client({"Note": "API call frequency exceeded."})):
            response = TestClient(mod.app, raise_server_exceptions=False).get(
                "/api/v1/sentiment-aggregate/AAPL"
            )

        assert response.status_code == 429
