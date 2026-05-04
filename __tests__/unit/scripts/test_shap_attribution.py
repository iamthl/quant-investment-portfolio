# UTC-09: SHAP Attribution

import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from scripts.quant_engine import compute_unified_attributions


class TestSHAPAttribution:

    SHAP_VALUES = {"rsi_14": 0.4, "macd_hist": -0.2, "ret_5d": 0.1}
    TECH_SCORE  = 70
    SENT_SCORE  = 60

    def _run(self):
        return compute_unified_attributions(self.SHAP_VALUES, self.TECH_SCORE, self.SENT_SCORE)

    def test_abs_pct_sum_is_100(self):
        """sum(abs_pct) must equal 100.0 within ±0.5 floating-point tolerance."""
        results = self._run()
        total = sum(abs_pct for _, _, abs_pct in results)
        assert abs(total - 100.0) <= 0.5, f"Expected 100.0 ± 0.5, got {total}"

    def test_no_feature_below_0_5_pct(self):
        """Features contributing < 0.5% of total absolute attribution are excluded."""
        results = self._run()
        for feat, _, abs_pct in results:
            assert abs_pct >= 0.5, (
                f"Feature '{feat}' has abs_pct={abs_pct} — below the 0.5% filter threshold"
            )

    def test_returns_list_of_tuples(self):
        results = self._run()
        assert isinstance(results, list)
        assert all(isinstance(row, tuple) and len(row) == 3 for row in results)

    def test_sorted_by_abs_pct_descending(self):
        """Results must be ordered from highest to lowest absolute contribution."""
        results = self._run()
        abs_pcts = [abs_pct for _, _, abs_pct in results]
        assert abs_pcts == sorted(abs_pcts, reverse=True)

    def test_known_features_present(self):
        """rsi_14 has the largest SHAP value and must appear in the output."""
        results = self._run()
        feature_keys = [feat for feat, _, _ in results]
        assert "rsi_14" in feature_keys

    def test_sentiment_contribution_included(self):
        """Sentiment score=60 gives (60-50)*0.3=3.0 — non-trivial, must appear."""
        results = self._run()
        feature_keys = [feat for feat, _, _ in results]
        assert "_sentiment" in feature_keys

class TestSHAPAttributionEdgeCases:

    def test_empty_shap_values_with_sentiment(self):
        """No SHAP features but non-neutral sentiment — sentiment is the sole driver."""
        results = compute_unified_attributions({}, tech_score=50, sentiment_score=80)
        assert len(results) == 1
        feat, _, abs_pct = results[0]
        assert feat == "_sentiment"
        assert abs(abs_pct - 100.0) <= 0.5

    def test_none_shap_values_with_sentiment(self):
        """None passed as shap_values — treated identically to empty dict."""
        results = compute_unified_attributions(None, tech_score=50, sentiment_score=80)
        assert len(results) == 1
        assert results[0][0] == "_sentiment"

    def test_neutral_everything_returns_empty(self):
        """tech_score=50 and sentiment_score=50 produce zero contributions → []."""
        results = compute_unified_attributions({}, tech_score=50, sentiment_score=50)
        assert results == []

    def test_abs_pct_sum_with_single_feature(self):
        """Single non-zero SHAP value — that feature must own 100% after normalisation."""
        results = compute_unified_attributions(
            {"rsi_14": 0.9}, tech_score=80, sentiment_score=50
        )
        assert len(results) == 1
        assert abs(results[0][2] - 100.0) <= 0.5

    def test_abs_pct_sum_multi_feature(self):
        """Sum invariant holds for a larger feature set."""
        shap = {
            "rsi_14":    0.35,
            "macd_hist": -0.25,
            "bb_pct":     0.15,
            "ret_5d":    -0.10,
            "adx_14":     0.05,
        }
        results = compute_unified_attributions(shap, tech_score=75, sentiment_score=65)
        total = sum(abs_pct for _, _, abs_pct in results)
        assert abs(total - 100.0) <= 0.5

    def test_signed_pct_preserves_direction(self):
        """Positive SHAP → positive signed_pct when tech_score > 50."""
        results = compute_unified_attributions(
            {"rsi_14": 0.9}, tech_score=80, sentiment_score=50
        )
        _, signed_pct, _ = results[0]
        assert signed_pct > 0

    def test_negative_shap_yields_negative_signed_pct(self):
        """Negative SHAP → negative signed_pct when tech_score > 50."""
        results = compute_unified_attributions(
            {"macd_hist": -0.9}, tech_score=80, sentiment_score=50
        )
        _, signed_pct, _ = results[0]
        assert signed_pct < 0
