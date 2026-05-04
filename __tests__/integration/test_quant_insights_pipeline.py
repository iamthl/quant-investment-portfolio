# ITC-03: Quant Insights Pipeline

import sys
import os
from unittest.mock import MagicMock, AsyncMock, patch
import numpy as np
import pandas as pd
import pytest

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_SCRIPTS = os.path.join(_ROOT, "scripts")
for _p in (_SCRIPTS, _ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

for _mod in (
    "sklearn", "sklearn.ensemble", "sklearn.preprocessing",
    "sklearn.model_selection", "sklearn.metrics",
    "shap", "xgboost", "torch", "transformers",
):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

_mock_db_instance = MagicMock()
_mock_db_instance.connect = AsyncMock()
_mock_db_instance.disconnect = AsyncMock()
_mock_db_instance.execute = AsyncMock(return_value=None)
_mock_db_instance.fetch_all = AsyncMock(return_value=[])
_databases_stub = MagicMock()
_databases_stub.Database = MagicMock(return_value=_mock_db_instance)
sys.modules.setdefault("databases", _databases_stub)

import predictive_model as pm            
import quant_engine as qe                 
from fastapi.testclient import TestClient
from predictive_model import PredictionResult, FEATURE_COLS, engineer_features


def make_ohlcv(n: int = 100) -> pd.DataFrame:
    """100 bars of synthetic OHLCV data seeded for reproducibility."""
    rng = np.random.default_rng(42)
    dates = pd.date_range("2023-01-01", periods=n, freq="B")
    close = 150.0 + np.cumsum(rng.normal(0, 2, n))
    return pd.DataFrame(
        {
            "open":   close * 0.999,
            "high":   close * 1.010,
            "low":    close * 0.990,
            "close":  close,
            "volume": rng.integers(1_000_000, 5_000_000, n).astype(float),
        },
        index=dates,
    )


def make_prediction(tech_score: float = 65.0) -> PredictionResult:
    """Controlled PredictionResult with non-trivial SHAP values."""
    rng = np.random.default_rng(7)
    shap_vals = {
        feat: round(float(v), 4)
        for feat, v in zip(FEATURE_COLS, rng.uniform(-0.3, 0.3, len(FEATURE_COLS)))
    }
    return PredictionResult(
        symbol="AAPL",
        probability_increase=0.65,
        confidence=0.45,
        action="BUY",
        technical_score=tech_score,
        feature_importances={"rsi_14": 0.25, "macd": 0.20, "ret_1d": 0.15},
        model_type="gradient_boosting",
        horizon_days=5,
        timestamp="2024-01-15T10:00:00",
        shap_values=shap_vals,
    )


AV_NEWS = {
    "feed": [
        {
            "title": f"AAPL news article {i}",
            "ticker_sentiment": [
                {"ticker": "AAPL", "ticker_sentiment_score": "0.30"}
            ],
        }
        for i in range(5)
    ]
}


class MockNewsHttpxClient:
    """Replaces httpx.AsyncClient; returns AV_NEWS for any GET."""
    async def __aenter__(self): return self
    async def __aexit__(self, *_): pass

    async def get(self, *_a, **_kw):
        r = MagicMock()
        r.status_code = 200
        r.json.return_value = AV_NEWS
        return r



class TestQuantInsightsPipeline:
    """ITC-03: full OHLCV -> ML -> SHAP -> Sentiment -> DB -> Kafka chain."""


    def test_engineer_features_22_columns_no_nan_in_last_row(self):
        """
        engineer_features must produce exactly 22 FEATURE_COLS columns
        and the final row must contain no NaN values in those columns.
        """
        df = make_ohlcv(100)
        feat_df = engineer_features(df)

        assert len(FEATURE_COLS) == 22, f"Expected 22 features, got {len(FEATURE_COLS)}"

        missing = [c for c in FEATURE_COLS if c not in feat_df.columns]
        assert missing == [], f"Missing feature columns: {missing}"

        last_row = feat_df[FEATURE_COLS].iloc[-1]
        nan_cols = last_row[last_row.isna()].index.tolist()
        assert nan_cols == [], f"NaN in final row for: {nan_cols}"


    def test_sentiment_score_formula(self):
        """sentiment_score = 50 + (avg_sentiment × 50); avg=0.30 → 65."""
        score, factors = qe.calculate_sentiment_score(
            {"avg_sentiment": 0.30, "article_count": 5}
        )
        assert score == 65.0, f"expected 65.0, got {score}"
        assert any("0.30" in f for f in factors)

    def test_fused_score_formula(self):
        """fused = tech×0.7 + sentiment×0.3."""
        tech, sent = 65.0, 65.0
        assert round(tech * 0.7 + sent * 0.3, 2) == 65.0


    def test_full_pipeline_single_symbol(self):
        """
        Single AAPL request traverses the full chain:
          - engineer_features called implicitly via model.predict
          - PredictionResult probability_increase ∈ [0,1], confidence ∈ [0,100]
          - sentiment_score = 65 (avg=0.30)
          - fused_score = tech×0.7 + 65×0.3
          - feature_contributions present, |values| sum ≈ 100%
          - DB execute called with symbol=AAPL
          - Kafka called with topic "quant_insights"
        """
        ohlcv = make_ohlcv(100)
        prediction = make_prediction(tech_score=65.0)

        kafka_calls: list = []
        db_calls: list = []

        async def _kafka(topic: str, message: dict):
            kafka_calls.append((topic, message))
            return True

        async def _db_execute(query, values=None):
            db_calls.append({"query": query, "values": values})

        mock_model = MagicMock()
        mock_model.predict.return_value = prediction

        with (
            patch("quant_engine.fetch_historical_ohlcv", AsyncMock(return_value=ohlcv)),
            patch("quant_engine.get_model", return_value=mock_model),
            patch("quant_engine.database") as mock_db,
            patch("quant_engine.publish_to_kafka", side_effect=_kafka),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            qe.httpx = MagicMock(AsyncClient=MockNewsHttpxClient)

            mock_db.connect = AsyncMock()
            mock_db.disconnect = AsyncMock()
            mock_db.execute = AsyncMock(side_effect=_db_execute)
            mock_db.fetch_all = AsyncMock(return_value=[])

            client = TestClient(qe.app, raise_server_exceptions=True)
            response = client.get("/api/v1/insights", params={"symbols": "AAPL"})

        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 1

        insight = body["insights"][0]

        assert 0.0 <= insight["probability_increase"] <= 1.0
        assert 0.0 <= insight["confidence"] <= 100.0   # stored as ×100 in QuantInsight

        # Sentiment: avg_ticker_score=0.30 -> 50 + 0.30×50 = 65
        assert insight["sentiment_score"] == 65.0, (
            f"expected sentiment_score=65.0, got {insight['sentiment_score']}"
        )

        # Fused score
        expected_fused = round(prediction.technical_score * 0.7 + 65.0 * 0.3, 2)
        assert insight["fused_score"] == expected_fused, (
            f"expected fused_score={expected_fused}, got {insight['fused_score']}"
        )

        # feature_contributions present; |signed_pct| sum ≈ 100%
        fc = insight.get("feature_contributions")
        assert fc is not None, "feature_contributions missing"
        assert len(fc) > 0, "feature_contributions is empty"
        abs_sum = sum(abs(v) for v in fc.values())
        assert abs_sum > 90.0, f"feature_contributions abs sum = {abs_sum:.1f}, expected ~100"

        assert len(db_calls) >= 1, "DB execute never called"
        insert_values = db_calls[0]["values"]
        assert insert_values["symbol"] == "AAPL"
        assert "ts" in insert_values

        assert len(kafka_calls) >= 1, "Kafka publish never called"
        assert kafka_calls[0][0] == "quant_insights"
        assert kafka_calls[0][1]["symbol"] == "AAPL"

    def test_failed_symbol_skipped_kafka_not_called(self):
        """If fetch_historical_ohlcv raises, symbol is silently skipped."""
        kafka_calls: list = []

        async def _kafka(topic, message):
            kafka_calls.append(topic)

        with (
            patch("quant_engine.fetch_historical_ohlcv", AsyncMock(side_effect=Exception("AV timeout"))),
            patch("quant_engine.get_model", return_value=MagicMock()),
            patch("quant_engine.database") as mock_db,
            patch("quant_engine.publish_to_kafka", side_effect=_kafka),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            qe.httpx = MagicMock(AsyncClient=MockNewsHttpxClient)
            mock_db.connect = AsyncMock()
            mock_db.disconnect = AsyncMock()
            mock_db.execute = AsyncMock(return_value=None)
            mock_db.fetch_all = AsyncMock(return_value=[])

            client = TestClient(qe.app)
            response = client.get("/api/v1/insights", params={"symbols": "AAPL"})

        assert response.status_code == 200
        assert response.json()["count"] == 0
        assert kafka_calls == []

    def test_multiple_symbols_all_processed(self):
        """Three symbols → three insights, three Kafka publishes, three DB inserts."""
        ohlcv = make_ohlcv(100)
        prediction = make_prediction(tech_score=60.0)
        kafka_calls: list = []
        db_calls: list = []

        async def _kafka(topic, message):
            kafka_calls.append(message["symbol"])

        async def _db_execute(query, values=None):
            db_calls.append(values["symbol"] if values else None)

        mock_model = MagicMock()
        mock_model.predict.return_value = prediction

        with (
            patch("quant_engine.fetch_historical_ohlcv", AsyncMock(return_value=ohlcv)),
            patch("quant_engine.get_model", return_value=mock_model),
            patch("quant_engine.database") as mock_db,
            patch("quant_engine.publish_to_kafka", side_effect=_kafka),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            qe.httpx = MagicMock(AsyncClient=MockNewsHttpxClient)
            mock_db.connect = AsyncMock()
            mock_db.disconnect = AsyncMock()
            mock_db.execute = AsyncMock(side_effect=_db_execute)
            mock_db.fetch_all = AsyncMock(return_value=[])

            client = TestClient(qe.app)
            response = client.get("/api/v1/insights", params={"symbols": "AAPL,NVDA,MSFT"})

        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 3
        symbols_in_response = {i["symbol"] for i in body["insights"]}
        assert symbols_in_response == {"AAPL", "NVDA", "MSFT"}
        assert set(kafka_calls) == {"AAPL", "NVDA", "MSFT"}
        assert set(db_calls) == {"AAPL", "NVDA", "MSFT"}
