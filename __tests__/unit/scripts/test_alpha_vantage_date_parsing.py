# UTC-07: Alpha Vantage Date Parsing


import sys
import os
import re
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from scripts.news_ingestor import format_alpha_vantage_date

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


class TestAlphaVantageDateParsing:

    def test_valid_timestamp_converts_to_iso(self):
        result = format_alpha_vantage_date("20051020T073000")
        assert result == "2005-10-20T07:30:00"

    def test_empty_string_returns_valid_iso_without_exception(self):
        result = format_alpha_vantage_date("")
        # Must be a non-empty ISO-8601-shaped string
        assert isinstance(result, str)
        assert len(result) > 0
        assert ISO_RE.match(result), f"Not a valid ISO timestamp: {result!r}"

    def test_empty_string_returns_current_utc_time(self):
        before = datetime.now(timezone.utc)
        result = format_alpha_vantage_date("")
        after  = datetime.now(timezone.utc)

        parsed = datetime.fromisoformat(result)
        assert before <= parsed <= after, (
            f"Returned time {result!r} is outside the [{before}, {after}] window"
        )


class TestAlphaVantageDateParsingExtended:

    def test_typical_av_timestamp(self):
        assert format_alpha_vantage_date("20231215T143000") == "2023-12-15T14:30:00"

    def test_midnight(self):
        assert format_alpha_vantage_date("20240101T000000") == "2024-01-01T00:00:00"

    def test_end_of_day(self):
        assert format_alpha_vantage_date("20240131T235959") == "2024-01-31T23:59:59"

    def test_invalid_string_returns_valid_iso_without_exception(self):
        result = format_alpha_vantage_date("not-a-date")
        assert isinstance(result, str)
        assert ISO_RE.match(result), f"Not a valid ISO timestamp: {result!r}"

    def test_seven_digit_after_T_is_invalid_falls_back_gracefully(self):
        result = format_alpha_vantage_date("20051020T1073000")
        assert isinstance(result, str)
        assert ISO_RE.match(result), (
            f"Expected graceful fallback to ISO timestamp, got: {result!r}"
        )
        assert result != "2005-10-20T07:30:00", (
            "Parsed a 7-digit hour field — this should have been a fallback, not a parse"
        )
