-- Initialize Quant Trading Platform Database
-- PostgreSQL with TimescaleDB extension

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Market Data Table (Time-series)
CREATE TABLE IF NOT EXISTS market_data (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    volume BIGINT NOT NULL,
    bid DECIMAL(20, 8),
    ask DECIMAL(20, 8),
    spread DECIMAL(10, 8),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'alpaca',
    PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('market_data', 'timestamp', if_not_exists => TRUE);

-- Create index for faster symbol lookups
CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data (symbol, timestamp DESC);

-- News Articles Table
CREATE TABLE IF NOT EXISTS news_articles (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(255) UNIQUE,
    headline TEXT NOT NULL,
    summary TEXT,
    source VARCHAR(100),
    url TEXT,
    published_at TIMESTAMPTZ,
    symbols VARCHAR(50)[],
    sentiment_score DECIMAL(5, 4),
    sentiment_label VARCHAR(20),
    sentiment_confidence DECIMAL(5, 4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_symbols ON news_articles USING GIN(symbols);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles (published_at DESC);

-- Quant Insights Table
CREATE TABLE IF NOT EXISTS quant_insights (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    technical_score DECIMAL(5, 2),
    sentiment_score DECIMAL(5, 2),
    fused_score DECIMAL(5, 2),
    action VARCHAR(20),
    confidence DECIMAL(5, 2),
    reasoning TEXT,
    technical_factors TEXT[],
    sentiment_factors TEXT[],
    risk_level VARCHAR(20),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('quant_insights', 'timestamp', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_insights_symbol ON quant_insights (symbol, timestamp DESC);

-- Trading Signals Table
CREATE TABLE IF NOT EXISTS trading_signals (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    entry_price DECIMAL(20, 8),
    target_price DECIMAL(20, 8),
    stop_loss DECIMAL(20, 8),
    position_size_pct DECIMAL(5, 2),
    confidence DECIMAL(5, 2),
    risk_reward DECIMAL(5, 2),
    reasoning TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    executed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    actual_pnl DECIMAL(20, 8),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('trading_signals', 'timestamp', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON trading_signals (symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status ON trading_signals (status);

-- Portfolio Positions Table
CREATE TABLE IF NOT EXISTS portfolio_positions (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    quantity DECIMAL(20, 8) NOT NULL,
    avg_cost DECIMAL(20, 8) NOT NULL,
    current_price DECIMAL(20, 8),
    market_value DECIMAL(20, 8),
    unrealized_pnl DECIMAL(20, 8),
    allocation_pct DECIMAL(5, 2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio History Table (Time-series)
CREATE TABLE IF NOT EXISTS portfolio_history (
    id BIGSERIAL,
    total_value DECIMAL(20, 2) NOT NULL,
    daily_pnl DECIMAL(20, 2),
    daily_pnl_pct DECIMAL(8, 4),
    sharpe_ratio DECIMAL(6, 4),
    win_rate DECIMAL(5, 2),
    max_drawdown DECIMAL(8, 4),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('portfolio_history', 'timestamp', if_not_exists => TRUE);

-- Trade History Table
CREATE TABLE IF NOT EXISTS trade_history (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    total_value DECIMAL(20, 8) NOT NULL,
    fees DECIMAL(20, 8) DEFAULT 0,
    pnl DECIMAL(20, 8),
    strategy VARCHAR(100),
    signal_id BIGINT,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trade_history (symbol, executed_at DESC);

-- Technical Indicators Cache Table
CREATE TABLE IF NOT EXISTS technical_indicators (
    id BIGSERIAL,
    symbol VARCHAR(20) NOT NULL,
    rsi DECIMAL(6, 2),
    macd DECIMAL(12, 4),
    macd_signal DECIMAL(12, 4),
    macd_histogram DECIMAL(12, 4),
    momentum DECIMAL(10, 4),
    adx DECIMAL(6, 2),
    atr DECIMAL(12, 4),
    sma_20 DECIMAL(20, 8),
    sma_50 DECIMAL(20, 8),
    ema_12 DECIMAL(20, 8),
    ema_26 DECIMAL(20, 8),
    bollinger_upper DECIMAL(20, 8),
    bollinger_lower DECIMAL(20, 8),
    stoch_k DECIMAL(6, 2),
    stoch_d DECIMAL(6, 2),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('technical_indicators', 'timestamp', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_indicators_symbol ON technical_indicators (symbol, timestamp DESC);

-- Service Health Metrics Table
CREATE TABLE IF NOT EXISTS service_health (
    id BIGSERIAL,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    latency_ms INTEGER,
    requests_per_second INTEGER,
    error_rate DECIMAL(6, 4),
    memory_usage DECIMAL(6, 2),
    kafka_lag INTEGER,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('service_health', 'timestamp', if_not_exists => TRUE);

-- Create continuous aggregates for analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data_hourly
WITH (timescaledb.continuous) AS
SELECT
    symbol,
    time_bucket('1 hour', timestamp) AS bucket,
    first(price, timestamp) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, timestamp) AS close,
    sum(volume) AS volume,
    avg(spread) AS avg_spread
FROM market_data
GROUP BY symbol, bucket;

-- Retention policy: keep raw data for 30 days, aggregates forever
SELECT add_retention_policy('market_data', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('service_health', INTERVAL '7 days', if_not_exists => TRUE);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO quant_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO quant_user;
