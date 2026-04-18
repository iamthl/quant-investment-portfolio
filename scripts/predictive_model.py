import numpy as np
import pandas as pd
import json
import os
import pickle
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass

import httpx

# Optional heavy deps (graceful fallback) 
try:
    from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, roc_auc_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logging.warning("scikit-learn not installed – using heuristic fallback")

try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    logging.warning("shap not installed – feature attribution will be unavailable")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "demo")
MODEL_CACHE_PATH = "/tmp/quant_model.pkl"
SCALER_CACHE_PATH = "/tmp/quant_scaler.pkl"


# Data structures

@dataclass
class PredictionResult:
    symbol: str
    probability_increase: float   # 0–1
    confidence: float             # 0–1
    action: str                   # STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL
    technical_score: float        # 0–100 (legacy compatibility)
    feature_importances: Dict[str, float]
    model_type: str
    horizon_days: int
    timestamp: str
    # Real per-sample SHAP values (positive = pushes toward "price increase")
    shap_values: Optional[Dict[str, float]] = None



# Feature engineering

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build a rich feature matrix from OHLCV data.
    All features are look-back only (no leakage).
    """
    df = df.copy().sort_index()

    close = df["close"]
    high  = df["high"]
    low   = df["low"]
    vol   = df["volume"]

    # Returns 
    for n in [1, 3, 5, 10, 20]:
        df[f"ret_{n}d"] = close.pct_change(n)

    # Moving averages 
    for n in [5, 10, 20, 50]:
        df[f"sma_{n}"] = close.rolling(n).mean()
        df[f"sma_{n}_ratio"] = close / df[f"sma_{n}"]   # price / MA ratio

    # RSI (Wilder's) 
    delta = close.diff()
    gain  = delta.clip(lower=0)
    loss  = (-delta).clip(lower=0)
    avg_g = gain.ewm(com=13, adjust=False).mean()
    avg_l = loss.ewm(com=13, adjust=False).mean()
    rs    = avg_g / avg_l.replace(0, np.nan)
    df["rsi_14"] = 100 - (100 / (1 + rs))

    # MACD 
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    df["macd"]        = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"]   = df["macd"] - df["macd_signal"]

    # Bollinger Bands 
    sma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    df["bb_upper"] = sma20 + 2 * std20
    df["bb_lower"] = sma20 - 2 * std20
    df["bb_pct"]   = (close - df["bb_lower"]) / (df["bb_upper"] - df["bb_lower"] + 1e-9)
    df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / sma20

    # ATR 
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low  - close.shift()).abs()
    ], axis=1).max(axis=1)
    df["atr_14"]     = tr.rolling(14).mean()
    df["atr_14_pct"] = df["atr_14"] / close   # normalised volatility

    # Volume features 
    df["vol_ratio_20"] = vol / vol.rolling(20).mean()
    df["vol_trend"]    = vol.rolling(5).mean() / vol.rolling(20).mean()

    # Momentum 
    df["momentum_10"] = close / close.shift(10) - 1
    df["momentum_20"] = close / close.shift(20) - 1

    # Stochastic %K 
    lo14 = low.rolling(14).min()
    hi14 = high.rolling(14).max()
    df["stoch_k"] = 100 * (close - lo14) / (hi14 - lo14 + 1e-9)
    df["stoch_d"] = df["stoch_k"].rolling(3).mean()

    # Target: did price rise > 1 % over next horizon days? 
    # (set externally before training; NaN for inference rows)
    return df


FEATURE_COLS = [
    "ret_1d", "ret_3d", "ret_5d", "ret_10d", "ret_20d",
    "sma_5_ratio", "sma_10_ratio", "sma_20_ratio", "sma_50_ratio",
    "rsi_14", "macd", "macd_signal", "macd_hist",
    "bb_pct", "bb_width",
    "atr_14_pct",
    "vol_ratio_20", "vol_trend",
    "momentum_10", "momentum_20",
    "stoch_k", "stoch_d",
]



# Alpha Vantage data loader

async def fetch_historical_ohlcv(symbol: str, db=None, outputsize: str = "compact") -> pd.DataFrame:
    """ Checks the local database cache first. If data is missing or older than 24h,
    it fetches from Alpha Vantage and updates the cache."""
    # Attempt to fetch from the local TimescaleDB cache
    if db:
        query = """
            SELECT timestamp as date, open, high, low, price as close, volume 
            FROM market_data 
            WHERE symbol = :symbol AND source = 'alpha_vantage_cache'
            ORDER BY timestamp DESC LIMIT 100
        """
        rows = await db.fetch_all(query=query, values={"symbol": symbol})
        
        if rows:
            df_cache = pd.DataFrame([dict(r) for r in rows]).set_index("date").sort_index()
            # Determine freshness (is the latest bar from today?)
            last_bar_time = df_cache.index.max()
            if (datetime.utcnow() - last_bar_time.to_pydatetime().replace(tzinfo=None)).total_seconds() < 86400:
                return df_cache

    # Cache Miss: Fetch from Alpha Vantage
    url = "https://www.alphavantage.co/query"
    params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": symbol,
        "outputsize": outputsize,
        "apikey": ALPHA_VANTAGE_API_KEY,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params)
        data = resp.json()

    # Handle AV Rate Limit Note
    if "Note" in data or "Information" in data:
        logger.warning(f"Alpha Vantage Rate Limit Hit for {symbol}")
        # If have ANY cached data (even if slightly stale), return it rather than crashing
        if db and rows: return pd.DataFrame([dict(r) for r in rows]).set_index("date").sort_index()
        raise HTTPException(status_code=429, detail="Upstream Rate Limit")

    ts = data.get("Time Series (Daily)", {})
    rows_to_insert = []
    
    # Process and prepare for DB save
    for date_str, v in ts.items():
        rows_to_insert.append({
            "date": pd.to_datetime(date_str),
            "open": float(v["1. open"]),
            "high": float(v["2. high"]),
            "low": float(v["3. low"]),
            "close": float(v["4. close"]),
            "volume": float(v["5. volume"]),
        })

    df = pd.DataFrame(rows_to_insert).set_index("date").sort_index()

    # Save to DB for future use (upsert logic)
    if db and not df.empty:
        insert_query = """
            INSERT INTO market_data (symbol, open, high, low, price, volume, timestamp, source)
            VALUES (:symbol, :open, :high, :low, :close, :volume, :ts, 'alpha_vantage_cache')
            ON CONFLICT DO NOTHING
        """
        for timestamp, row in df.tail(100).iterrows():
            await db.execute(insert_query, {
                "symbol": symbol, "open": row['open'], "high": row['high'], 
                "low": row['low'], "close": row['close'], "volume": row['volume'],
                "ts": timestamp
            })

    return df


# Model trainer

class QuantPredictiveModel:
    """
    Trains and serves a probability-of-increase model.
    Supports GradientBoosting (scikit-learn) and XGBoost.
    """

    def __init__(self, horizon_days: int = 5, threshold_pct: float = 0.01,
                 model_type: str = "gradient_boosting"):
        self.horizon_days  = horizon_days
        self.threshold_pct = threshold_pct
        self.model_type    = model_type
        self.model         = None
        self.scaler        = None
        self.explainer     = None   # shap.TreeExplainer — created lazily after model is ready
        self.feature_names = FEATURE_COLS
        self.trained_at    = None
        self.train_auc     = None

    def _create_explainer(self) -> None:
        """Create a shap.TreeExplainer for the current model (no-op if shap unavailable)."""
        if not SHAP_AVAILABLE or self.model is None:
            return
        try:
            self.explainer = shap.TreeExplainer(self.model)
            logger.info("SHAP TreeExplainer created")
        except Exception as e:
            logger.warning(f"Could not create SHAP explainer: {e}")
            self.explainer = None

    # Training 

    def build_dataset(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Feature matrix X and binary target y."""
        df = engineer_features(df)

        # Target: forward return > threshold
        fwd_ret = df["close"].shift(-self.horizon_days) / df["close"] - 1
        df["target"] = (fwd_ret > self.threshold_pct).astype(int)

        df = df.dropna(subset=self.feature_names + ["target"])
        X = df[self.feature_names].values.astype(float)
        y = df["target"].values.astype(int)
        return X, y

    def train(self, df: pd.DataFrame) -> Dict:
        """Train on a DataFrame of OHLCV data."""
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn required for training")

        X, y = self.build_dataset(df)
        logger.info(f"Dataset: {len(X)} samples, {y.mean():.1%} positive")

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, shuffle=False  # time-ordered split
        )

        self.scaler = StandardScaler()
        X_train_s = self.scaler.fit_transform(X_train)
        X_test_s  = self.scaler.transform(X_test)

        if self.model_type == "xgboost" and XGBOOST_AVAILABLE:
            self.model = xgb.XGBClassifier(
                n_estimators=300,
                max_depth=5,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                use_label_encoder=False,
                eval_metric="logloss",
                random_state=42,
            )
            self.model.fit(X_train_s, y_train,
                           eval_set=[(X_test_s, y_test)],
                           verbose=False)
        else:
            self.model = GradientBoostingClassifier(
                n_estimators=200,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.8,
                random_state=42,
            )
            self.model.fit(X_train_s, y_train)

        proba_test  = self.model.predict_proba(X_test_s)[:, 1]
        self.train_auc = roc_auc_score(y_test, proba_test)
        self.trained_at = datetime.utcnow().isoformat()

        self._create_explainer()
        logger.info(f"Model trained | AUC={self.train_auc:.3f} | type={self.model_type}")
        return {"auc": self.train_auc, "n_samples": len(X), "trained_at": self.trained_at}

    #  Inference 

    def predict(self, df: pd.DataFrame, symbol: str) -> PredictionResult:
        """
        Predict from the latest row of OHLCV data.
        Falls back to heuristic score if model not trained.
        """
        df_feat = engineer_features(df)
        df_feat = df_feat.dropna(subset=self.feature_names)

        if df_feat.empty:
            return self._heuristic_fallback(df, symbol)

        latest = df_feat[self.feature_names].iloc[[-1]].values.astype(float)

        if self.model is None or self.scaler is None:
            return self._heuristic_fallback(df, symbol)

        latest_s = self.scaler.transform(latest)
        prob     = float(self.model.predict_proba(latest_s)[0, 1])

        # Global feature importances (model-level, top-5)
        importances = {}
        if hasattr(self.model, "feature_importances_"):
            imp = self.model.feature_importances_
            top = sorted(zip(self.feature_names, imp), key=lambda x: -x[1])[:5]
            importances = {k: round(float(v), 4) for k, v in top}

        # Real per-sample SHAP values via TreeExplainer
        shap_dict: Optional[Dict[str, float]] = None
        if SHAP_AVAILABLE and self.explainer is not None:
            try:
                sv = self.explainer.shap_values(latest_s)
                # GradientBoosting returns (n_samples, n_features) directly;
                # some versions/models return a list [class0, class1] — take class 1
                if isinstance(sv, list):
                    sv = sv[1] if len(sv) > 1 else sv[0]
                sv_flat = sv[0] if sv.ndim == 2 else sv
                shap_dict = {
                    feat: round(float(v), 4)
                    for feat, v in zip(self.feature_names, sv_flat)
                }
                logger.debug(f"SHAP computed for {symbol}: {list(shap_dict.items())[:3]}")
            except Exception as e:
                logger.warning(f"SHAP inference failed for {symbol}: {e}")

        # Confidence = distance from 0.5, amplified
        confidence = min(1.0, abs(prob - 0.5) * 3)

        action = self._prob_to_action(prob, confidence)
        tech_score = round(prob * 100, 1)

        return PredictionResult(
            symbol=symbol,
            probability_increase=round(prob, 4),
            confidence=round(confidence, 4),
            action=action,
            technical_score=tech_score,
            feature_importances=importances,
            model_type=self.model_type,
            horizon_days=self.horizon_days,
            timestamp=datetime.utcnow().isoformat(),
            shap_values=shap_dict,
        )

    # Persistence 

    def save(self, model_path: str = MODEL_CACHE_PATH,
             scaler_path: str = SCALER_CACHE_PATH):
        with open(model_path, "wb") as f:
            pickle.dump(self.model, f)
        with open(scaler_path, "wb") as f:
            pickle.dump(self.scaler, f)
        logger.info(f"Model saved to {model_path}")

    def load(self, model_path: str = MODEL_CACHE_PATH,
             scaler_path: str = SCALER_CACHE_PATH) -> bool:
        if os.path.exists(model_path) and os.path.exists(scaler_path):
            with open(model_path, "rb") as f:
                self.model = pickle.load(f)
            with open(scaler_path, "rb") as f:
                self.scaler = pickle.load(f)
            self._create_explainer()
            logger.info("Loaded cached model")
            return True
        return False

    # Helpers 

    @staticmethod
    def _prob_to_action(prob: float, confidence: float) -> str:
        if prob >= 0.70 and confidence >= 0.4:
            return "STRONG_BUY"
        elif prob >= 0.58:
            return "BUY"
        elif prob <= 0.30 and confidence >= 0.4:
            return "STRONG_SELL"
        elif prob <= 0.42:
            return "SELL"
        return "HOLD"

    def _heuristic_fallback(self, df: pd.DataFrame, symbol: str) -> PredictionResult:
        """Rule-based score when model is unavailable."""
        close = df["close"]
        score = 50.0
        if len(close) >= 14:
            delta = close.diff()
            gain  = delta.clip(lower=0).rolling(14).mean().iloc[-1]
            loss  = (-delta).clip(lower=0).rolling(14).mean().iloc[-1]
            rs    = gain / (loss + 1e-9)
            rsi   = 100 - 100 / (1 + rs)
            if rsi < 30: score += 15
            elif rsi > 70: score -= 15

        prob = score / 100
        return PredictionResult(
            symbol=symbol,
            probability_increase=round(prob, 4),
            confidence=0.3,
            action=self._prob_to_action(prob, 0.3),
            technical_score=round(score, 1),
            feature_importances={},
            model_type="heuristic_fallback",
            horizon_days=self.horizon_days,
            timestamp=datetime.utcnow().isoformat(),
        )


# Singleton used by quant_engine.py

_MODEL_INSTANCE: Optional[QuantPredictiveModel] = None


def get_model(horizon_days: int = 5) -> QuantPredictiveModel:
    global _MODEL_INSTANCE
    if _MODEL_INSTANCE is None:
        _MODEL_INSTANCE = QuantPredictiveModel(horizon_days=horizon_days)
        _MODEL_INSTANCE.load()          # no-op if no cache exists yet
    return _MODEL_INSTANCE


# CLI: python predictive_model.py train AAPL

if __name__ == "__main__":
    import asyncio
    import sys

    async def main():
        symbol = sys.argv[2] if len(sys.argv) > 2 else "AAPL"
        cmd    = sys.argv[1] if len(sys.argv) > 1 else "train"

        model = QuantPredictiveModel(horizon_days=5, model_type="gradient_boosting")

        if cmd == "train":
            print(f"Fetching historical data for {symbol}…")
            df = await fetch_historical_ohlcv(symbol, outputsize="full")
            print(f"  {len(df)} bars retrieved")
            metrics = model.train(df)
            model.save()
            print(f"  Done! {metrics}")

        elif cmd == "predict":
            loaded = model.load()
            if not loaded:
                print("No cached model found – run `train` first")
                return
            df  = await fetch_historical_ohlcv(symbol, outputsize="compact")
            res = model.predict(df, symbol)
            print(json.dumps(res.__dict__, indent=2))

    asyncio.run(main())