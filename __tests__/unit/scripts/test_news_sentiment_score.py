# UTC-10: News Sentiment Score

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from scripts.news_ingestor import get_sentiment_label


def combined_sentiment(overall_score: float, finbert_score: float) -> float:
    """Mirror of news_ingestor.py line 256."""
    return (overall_score * 0.6) + (finbert_score * 0.4)

class TestNewsSentimentScore:

    def test_bullish_av_neutral_finbert_gives_somewhat_bullish(self):
        """(0.50 × 0.6) + (0.00 × 0.4) = 0.30 → Somewhat-Bullish."""
        score = combined_sentiment(overall_score=0.50, finbert_score=0.00)
        assert score == pytest.approx(0.30, abs=1e-9)
        assert get_sentiment_label(score) == "Somewhat-Bullish"

    def test_bearish_av_mildly_bullish_finbert_gives_somewhat_bearish(self):
        """(-0.50 × 0.6) + (0.20 × 0.4) = -0.30 + 0.08 = -0.22 → Somewhat-Bearish."""
        score = combined_sentiment(overall_score=-0.50, finbert_score=0.20)
        assert score == pytest.approx(-0.22, abs=1e-9)
        assert get_sentiment_label(score) == "Somewhat-Bearish"

class TestSentimentWeightingProperties:

    def test_av_carries_60_percent_weight(self):
        """Isolate AV contribution: finbert=0 → combined = overall × 0.6."""
        assert combined_sentiment(1.0, 0.0) == pytest.approx(0.6, abs=1e-9)
        assert combined_sentiment(0.5, 0.0) == pytest.approx(0.3, abs=1e-9)

    def test_finbert_carries_40_percent_weight(self):
        """Isolate FinBERT contribution: overall=0 → combined = finbert × 0.4."""
        assert combined_sentiment(0.0, 1.0) == pytest.approx(0.4, abs=1e-9)
        assert combined_sentiment(0.0, 0.5) == pytest.approx(0.2, abs=1e-9)

    def test_weights_sum_to_1_equal_scores_are_identity(self):
        """When both inputs are equal, the combined score equals each input."""
        assert combined_sentiment(0.5,  0.5)  == pytest.approx(0.5,  abs=1e-9)
        assert combined_sentiment(-0.3, -0.3) == pytest.approx(-0.3, abs=1e-9)


@pytest.mark.parametrize("overall, finbert, expected_score, expected_label", [
    # Bullish
    ( 0.80,  0.50,  0.68, "Bullish"),          # (0.80x0.6)+(0.50x0.4)=0.68
    # Somewhat-Bullish
    ( 0.50,  0.00,  0.30, "Somewhat-Bullish"), # UTC-10 required case 1
    ( 0.30,  0.10,  0.22, "Somewhat-Bullish"), # (0.30x0.6)+(0.10x0.4)=0.22
    # Neutral
    ( 0.10, -0.10,  0.02, "Neutral"),          # (0.10x0.6)+(-0.10x0.4)=0.02
    ( 0.00,  0.00,  0.00, "Neutral"),
    # Somewhat-Bearish
    (-0.50,  0.20, -0.22, "Somewhat-Bearish"), # UTC-10 required case 2
    (-0.30, -0.10, -0.22, "Somewhat-Bearish"), # (-0.30x0.6)+(-0.10x0.4)=-0.22
    # Bearish
    (-0.80, -0.50, -0.68, "Bearish"),          # (-0.80x0.6)+(-0.50x0.4)=-0.68
])
def test_combined_score_and_label(overall, finbert, expected_score, expected_label):
    score = combined_sentiment(overall, finbert)
    assert score == pytest.approx(expected_score, abs=1e-9)
    assert get_sentiment_label(score) == expected_label
