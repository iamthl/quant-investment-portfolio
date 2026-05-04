# UTC-08: ML Model Confidence

import pytest


def confidence(prob: float) -> float:
    """Mirror of predictive_model.py line 367."""
    return min(1.0, abs(prob - 0.5) * 3)


class TestMLModelConfidence:

    def test_prob_0_50_gives_0_0(self):
        """No conviction — sitting on the boundary."""
        assert confidence(0.50) == 0.0

    def test_prob_two_thirds_gives_0_5(self):
        """Moderate conviction — exact boundary value (spec approximated as 0.67)."""
        assert confidence(2 / 3) == pytest.approx(0.5, abs=1e-9)

    def test_prob_0_67_gives_0_51_not_0_50(self):
        """
        The spec stated prob=0.67 -> 0.5, but abs(0.67-0.5)*3 = 0.51.
        Documented here so the approximation error is explicit.
        """
        result = confidence(0.67)
        assert result == pytest.approx(0.51, abs=1e-9)
        assert result != pytest.approx(0.50, abs=0.005)

    def test_prob_0_83_gives_0_99(self):
        """High conviction, approaching the cap."""
        assert confidence(0.83) == pytest.approx(0.99, abs=1e-9)

    def test_prob_1_00_gives_1_0_clamped(self):
        """Maximum probability — clamped at 1.0."""
        assert confidence(1.00) == 1.0

    def test_prob_0_20_gives_0_9(self):
        """Strong bearish signal — below 0.5 is symmetric."""
        assert confidence(0.20) == pytest.approx(0.9, abs=1e-9)



@pytest.mark.parametrize("prob, expected", [
    # Exact boundary - centre
    (0.50,      0.00),
    # Clamp boundary - anything >= 5/6 saturates at 1.0
    (5 / 6,     1.00),    # abs(5/6 - 0.5) * 3 = (1/3) * 3 = 1.0 exactly
    (1.00,      1.00),
    (0.00,      1.00),    # symmetric: abs(0.0 - 0.5) * 3 = 1.5 -> clamped
    # Mid-range values
    (2 / 3,     0.50),    # bullish moderate
    (1 / 3,     0.50),    # bearish moderate (symmetric)
    (0.83,      0.99),
    (0.17,      0.99),    # symmetric counterpart of 0.83
    (0.20,      0.90),
    (0.80,      0.90),    # symmetric counterpart of 0.20
])
def test_confidence_boundaries(prob, expected):
    assert confidence(prob) == pytest.approx(expected, abs=1e-9)


class TestConfidenceFormulaProperties:

    def test_symmetric_around_0_5(self):
        """Bearish and bullish equidistant from 0.5 produce the same confidence."""
        for delta in [0.05, 0.10, 0.20, 0.30, 0.40, 0.50]:
            assert confidence(0.5 + delta) == pytest.approx(confidence(0.5 - delta), abs=1e-9)

    def test_monotonically_increases_away_from_0_5(self):
        """Confidence grows as prob moves further from 0.5 (before clamping)."""
        probs = [0.50, 0.55, 0.60, 0.65, 0.70, 0.80, 0.85]
        scores = [confidence(p) for p in probs]
        assert scores == sorted(scores)

    def test_clamp_never_exceeds_1_0(self):
        """Output is always in [0, 1] for any probability in [0, 1]."""
        for p in [i / 100 for i in range(101)]:
            assert 0.0 <= confidence(p) <= 1.0
