# ITC-02: News Ingestion Pipeline


import sys
import os
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

for _mod in ("torch", "transformers"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

import pytest

AV_FEED_TWO_ARTICLES = {
    "feed": [
        {
            "title": "Apple reports record quarterly earnings",
            "summary": "Apple Inc. beats analyst expectations with record revenue.",
            "source": "Reuters",
            "url": "https://reuters.com/apple-earnings",
            "time_published": "20240115T143000",
            "overall_sentiment_score": 0.5,
            "ticker_sentiment": [
                {"ticker": "AAPL", "relevance_score": "0.9", "ticker_sentiment_score": "0.55"}
            ],
            "banner_image": None,
        },
        {
            "title": "Tech sector faces headwinds amid rate concerns",
            "summary": "Rising interest rates pressure tech valuations.",
            "source": "Bloomberg",
            "url": "https://bloomberg.com/tech-headwinds",
            "time_published": "20240115T120000",
            "overall_sentiment_score": -0.3,
            "ticker_sentiment": [
                {"ticker": "AAPL", "relevance_score": "0.7", "ticker_sentiment_score": "-0.25"}
            ],
            "banner_image": None,
        },
    ]
}


def _make_av_client(feed_payload: dict):
    """Return a mock AsyncClient class whose .get() returns feed_payload."""

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = feed_payload

    class _MockAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

        async def get(self, *_args, **_kwargs):
            return mock_response

    return _MockAsyncClient



@pytest.fixture(autouse=True)
def clear_news_cache():
    """Wipe the in-memory cache before and after every test."""
    import importlib
    import scripts.news_ingestor as mod
    mod.news_cache.clear()
    yield
    mod.news_cache.clear()



class TestNewsIngestionPipeline:
    """ITC-02: Full Alpha Vantage → FinBERT → Kafka pipeline."""

    def test_fetch_analyse_publish_full_pipeline(self):
        """
        Given 2 Alpha Vantage articles and stubbed FinBERT scores:
          article 1  overall=0.5,  finbert=0.40  → combined = 0.5×0.6 + 0.40×0.4 = 0.46  → "Bullish"
          article 2  overall=-0.3, finbert=-0.10 → combined = -0.3×0.6 + -0.10×0.4 = -0.22 → "Somewhat-Bearish"
        Kafka must be called twice with topic "raw_news_articles".
        Result must be cached under key "AAPL-technology,earnings-2".
        """
        from fastapi.testclient import TestClient
        import scripts.news_ingestor as mod

        finbert_side_effects = [
            MagicMock(score=0.40),   # article 1 - bullish
            MagicMock(score=-0.10),  # article 2 - somewhat-bearish
        ]

        kafka_calls: list = []

        async def _mock_kafka(topic: str, message: dict):
            kafka_calls.append((topic, message))
            return True

        with (
            patch.object(mod.httpx, "AsyncClient", _make_av_client(AV_FEED_TWO_ARTICLES)),
            patch("scripts.news_ingestor.analyse_sentiment_finbert", side_effect=finbert_side_effects),
            patch("scripts.news_ingestor.publish_to_kafka", side_effect=_mock_kafka),
        ):
            client = TestClient(mod.app)
            response = client.get(
                "/api/v1/news",
                params={"tickers": "AAPL", "topics": "technology,earnings", "limit": 2},
            )

        assert response.status_code == 200
        body = response.json()

        assert body["count"] == 2
        assert body["source"] == "alpha_vantage"

        articles = body["articles"]

        # --- article 1 sentiment ---
        a1 = articles[0]
        assert round(a1["sentiment_score"], 2) == 0.46, f"expected 0.46, got {a1['sentiment_score']}"
        assert a1["sentiment_label"] == "Bullish"

        # --- article 2 sentiment ---
        a2 = articles[1]
        assert round(a2["sentiment_score"], 2) == -0.22, f"expected -0.22, got {a2['sentiment_score']}"
        assert a2["sentiment_label"] == "Somewhat-Bearish"

        # --- Kafka ---
        assert len(kafka_calls) == 2, f"expected 2 Kafka publishes, got {len(kafka_calls)}"
        assert kafka_calls[0][0] == "raw_news_articles"
        assert kafka_calls[1][0] == "raw_news_articles"

        # --- cache populated ---
        assert "AAPL-technology,earnings-2" in mod.news_cache

    def test_kafka_payload_contains_required_fields(self):
        """Each Kafka message must include id, headline, sentiment_score, sentiment_label."""
        from fastapi.testclient import TestClient
        import scripts.news_ingestor as mod

        kafka_messages: list = []

        async def _capture_kafka(topic: str, message: dict):
            kafka_messages.append(message)
            return True

        with (
            patch.object(mod.httpx, "AsyncClient", _make_av_client(AV_FEED_TWO_ARTICLES)),
            patch("scripts.news_ingestor.analyse_sentiment_finbert", return_value=MagicMock(score=0.0)),
            patch("scripts.news_ingestor.publish_to_kafka", side_effect=_capture_kafka),
        ):
            client = TestClient(mod.app)
            client.get("/api/v1/news", params={"tickers": "AAPL", "limit": 2})

        for msg in kafka_messages:
            assert "id" in msg
            assert "headline" in msg
            assert "sentiment_score" in msg
            assert "sentiment_label" in msg


    def test_rate_limit_note_returns_429(self):
        """Alpha Vantage 'Note' key in response → 429."""
        from fastapi.testclient import TestClient
        import scripts.news_ingestor as mod

        rate_limit_payload = {"Note": "Thank you for using Alpha Vantage! API call frequency exceeded."}

        with patch.object(mod.httpx, "AsyncClient", _make_av_client(rate_limit_payload)):
            client = TestClient(mod.app, raise_server_exceptions=False)
            response = client.get("/api/v1/news", params={"tickers": "AAPL"})

        assert response.status_code == 429

    def test_empty_feed_returns_zero_articles(self):
        """Empty Alpha Vantage feed → articles=[], count=0, no Kafka calls."""
        from fastapi.testclient import TestClient
        import scripts.news_ingestor as mod

        kafka_calls: list = []

        async def _mock_kafka(topic, message):
            kafka_calls.append((topic, message))

        with (
            patch.object(mod.httpx, "AsyncClient", _make_av_client({"feed": []})),
            patch("scripts.news_ingestor.publish_to_kafka", side_effect=_mock_kafka),
        ):
            client = TestClient(mod.app)
            response = client.get("/api/v1/news", params={"tickers": "AAPL"})

        assert response.status_code == 200
        body = response.json()
        assert body["articles"] == []
        assert body["count"] == 0
        assert kafka_calls == []

    def test_upstream_http_error_returns_error_status(self):
        """Non-200 from Alpha Vantage → propagated error status."""
        from fastapi.testclient import TestClient
        import scripts.news_ingestor as mod

        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.json.return_value = {}

        class _ErrorClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *_): pass
            async def get(self, *_a, **_kw): return mock_response

        with patch.object(mod.httpx, "AsyncClient", _ErrorClient):
            client = TestClient(mod.app, raise_server_exceptions=False)
            response = client.get("/api/v1/news", params={"tickers": "AAPL"})

        assert response.status_code == 503
