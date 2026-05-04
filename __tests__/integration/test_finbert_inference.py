# ITC-05: FinBERT End-to-End Text Inference

import sys
import os
import time
from unittest.mock import MagicMock

_stubs_to_remove = [
    k for k in list(sys.modules)
    if k.startswith(("torch", "transformers"))
    and isinstance(sys.modules[k], MagicMock)
]
for _k in _stubs_to_remove:
    del sys.modules[_k]

for _k in [k for k in list(sys.modules) if "news_ingestor" in k]:
    del sys.modules[_k]

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi.testclient import TestClient

try:
    import torch
    import transformers
    if isinstance(torch, MagicMock) or isinstance(transformers, MagicMock):
        raise ImportError
except ImportError:
    pytest.skip("Real torch/transformers not installed — skipping ITC-05", allow_module_level=True)

import scripts.news_ingestor as mod
from scripts.news_ingestor import _load_finbert, analyse_sentiment_finbert



@pytest.fixture(scope="module", autouse=True)
def preload_model():
    """
    Load ProsusAI/finbert once for the whole module.
    Model loading takes ~2 s; subsequent inference calls are ~0.1–0.3 s.
    If loading fails (no internet / model cache), the entire module is skipped.
    """
    ok = _load_finbert()
    if not ok:
        pytest.skip("FinBERT could not be loaded — check torch/transformers installation")
    yield


@pytest.fixture(scope="module")
def client():
    """Single TestClient instance shared across all tests in this module."""
    return TestClient(mod.app)



POSITIVE_TEXT = "Apple reported record quarterly earnings, beating analyst expectations by 15%"
NEGATIVE_TEXT = "The company filed for bankruptcy amid mounting debt concerns"

LATENCY_LIMIT = 2.0   # seconds — model must be pre-loaded; only inference counted


class TestFinBERTEndToEnd:
    """ITC-05: REST → analyse_sentiment_finbert → Tokeniser → PyTorch → Result"""


    def test_load_finbert_returns_true(self):
        """_load_finbert() must return True once the model is in memory."""
        assert _load_finbert() is True


    def test_positive_text_label(self, client):
        """Strong positive earnings text → label = 'positive'."""
        response = client.post("/api/v1/analyze-sentiment", params={"text": POSITIVE_TEXT})
        assert response.status_code == 200
        assert response.json()["label"] == "positive"

    def test_positive_text_score_above_threshold(self, client):
        """Positive text → score > 0.30."""
        body = client.post("/api/v1/analyze-sentiment", params={"text": POSITIVE_TEXT}).json()
        assert body["score"] > 0.30, f"expected score > 0.30, got {body['score']}"

    def test_positive_text_confidence_above_threshold(self, client):
        """Positive text → confidence > 0.70 (model is decisive)."""
        body = client.post("/api/v1/analyze-sentiment", params={"text": POSITIVE_TEXT}).json()
        assert body["confidence"] > 0.70, f"expected confidence > 0.70, got {body['confidence']}"

    def test_positive_text_latency(self, client):
        """Positive text inference must complete within 2 seconds (model pre-loaded)."""
        t0 = time.perf_counter()
        client.post("/api/v1/analyze-sentiment", params={"text": POSITIVE_TEXT})
        latency = time.perf_counter() - t0
        assert latency < LATENCY_LIMIT, f"latency {latency:.2f}s exceeds {LATENCY_LIMIT}s"


    def test_negative_text_label(self, client):
        """Bankruptcy / debt text → label = 'negative'."""
        response = client.post("/api/v1/analyze-sentiment", params={"text": NEGATIVE_TEXT})
        assert response.status_code == 200
        assert response.json()["label"] == "negative"

    def test_negative_text_score_below_threshold(self, client):
        """Negative text → score < -0.30."""
        body = client.post("/api/v1/analyze-sentiment", params={"text": NEGATIVE_TEXT}).json()
        assert body["score"] < -0.30, f"expected score < -0.30, got {body['score']}"

    def test_negative_text_confidence_above_threshold(self, client):
        """Negative text → confidence > 0.70."""
        body = client.post("/api/v1/analyze-sentiment", params={"text": NEGATIVE_TEXT}).json()
        assert body["confidence"] > 0.70, f"expected confidence > 0.70, got {body['confidence']}"

    def test_negative_text_latency(self, client):
        """Negative text inference must complete within 2 seconds."""
        t0 = time.perf_counter()
        client.post("/api/v1/analyze-sentiment", params={"text": NEGATIVE_TEXT})
        latency = time.perf_counter() - t0
        assert latency < LATENCY_LIMIT, f"latency {latency:.2f}s exceeds {LATENCY_LIMIT}s"



    def test_response_contains_required_fields(self, client):
        """Response must include text, score, label, confidence."""
        body = client.post("/api/v1/analyze-sentiment", params={"text": POSITIVE_TEXT}).json()
        for field in ("text", "score", "label", "confidence"):
            assert field in body, f"Missing field: {field}"

    def test_score_is_in_valid_range(self, client):
        """score ∈ [-1, 1] for both texts."""
        for text in (POSITIVE_TEXT, NEGATIVE_TEXT):
            score = client.post("/api/v1/analyze-sentiment", params={"text": text}).json()["score"]
            assert -1.0 <= score <= 1.0, f"score {score} out of range for: {text[:40]}"

    def test_confidence_is_in_valid_range(self, client):
        """confidence ∈ [0, 1] for both texts."""
        for text in (POSITIVE_TEXT, NEGATIVE_TEXT):
            conf = client.post("/api/v1/analyze-sentiment", params={"text": text}).json()["confidence"]
            assert 0.0 <= conf <= 1.0, f"confidence {conf} out of range"

    def test_direct_function_positive(self):
        """analyse_sentiment_finbert called directly — validates logic independently of FastAPI."""
        result = analyse_sentiment_finbert(POSITIVE_TEXT)
        assert result.label == "positive"
        assert result.score > 0.30
        assert result.confidence > 0.70

    def test_direct_function_negative(self):
        result = analyse_sentiment_finbert(NEGATIVE_TEXT)
        assert result.label == "negative"
        assert result.score < -0.30
        assert result.confidence > 0.70
