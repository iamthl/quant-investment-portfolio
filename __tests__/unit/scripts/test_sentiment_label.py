# UTC-03: Sentiment Label Assignment

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest
from scripts.news_ingestor import get_sentiment_label


class TestSentimentLabelAssignment:
    """UTC-03 — boundary values specified in the test case."""

    def test_score_0_40_is_bullish(self):
        assert get_sentiment_label(0.40) == "Bullish"

    def test_score_0_20_is_somewhat_bullish(self):
        assert get_sentiment_label(0.20) == "Somewhat-Bullish"

    def test_score_0_00_is_neutral(self):
        assert get_sentiment_label(0.00) == "Neutral"

    def test_score_neg_0_20_is_somewhat_bearish(self):
        assert get_sentiment_label(-0.20) == "Somewhat-Bearish"

    def test_score_neg_0_40_is_bearish(self):
        assert get_sentiment_label(-0.40) == "Bearish"


@pytest.mark.parametrize("score,expected", [
    # Bullish boundary
    ( 0.35, "Bullish"),           # exact lower edge of Bullish
    ( 1.00, "Bullish"),           # extreme positive

    # Somewhat-Bullish band
    ( 0.15, "Somewhat-Bullish"),  # exact lower edge
    ( 0.34, "Somewhat-Bullish"),  # just below Bullish threshold

    # Neutral band
    (-0.15, "Neutral"),           # exact lower edge of Neutral
    ( 0.14, "Neutral"),           # just below Somewhat-Bullish threshold

    # Somewhat-Bearish band
    (-0.35, "Somewhat-Bearish"),  # exact lower edge
    (-0.16, "Somewhat-Bearish"),  # just below Neutral threshold

    # Bearish
    (-0.36, "Bearish"),           # just past Somewhat-Bearish boundary
    (-1.00, "Bearish"),           # extreme negative
])
def test_threshold_boundaries(score, expected):
    assert get_sentiment_label(score) == expected, (
        f"get_sentiment_label({score}) expected '{expected}'"
    )
