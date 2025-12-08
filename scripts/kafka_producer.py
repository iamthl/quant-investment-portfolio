"""
Kafka Producer Configuration
Utility module for producing messages to Kafka topics
"""

import json
from datetime import datetime
from typing import Dict, Any, Optional

# Kafka configuration
KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"

# Topic definitions
TOPICS = {
    "raw_market_data": {
        "partitions": 6,
        "replication_factor": 3,
        "retention_ms": 86400000  # 24 hours
    },
    "raw_news_articles": {
        "partitions": 3,
        "replication_factor": 3,
        "retention_ms": 604800000  # 7 days
    },
    "sentiment_scores": {
        "partitions": 3,
        "replication_factor": 3,
        "retention_ms": 604800000
    },
    "quant_insights": {
        "partitions": 6,
        "replication_factor": 3,
        "retention_ms": 86400000
    },
    "trading_signals": {
        "partitions": 6,
        "replication_factor": 3,
        "retention_ms": 86400000
    }
}

class KafkaProducerWrapper:
    """
    Wrapper for Kafka producer with serialization and error handling.
    
    In production, use:
    from aiokafka import AIOKafkaProducer
    
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8'),
        key_serializer=lambda k: k.encode('utf-8') if k else None
    )
    """
    
    def __init__(self):
        self.connected = False
        
    async def connect(self):
        """Initialize connection to Kafka"""
        # In production: await producer.start()
        self.connected = True
        print(f"[Kafka] Connected to {KAFKA_BOOTSTRAP_SERVERS}")
        
    async def disconnect(self):
        """Close Kafka connection"""
        # In production: await producer.stop()
        self.connected = False
        print("[Kafka] Disconnected")
        
    async def send(self, topic: str, value: Dict[str, Any], key: Optional[str] = None):
        """Send message to Kafka topic"""
        if not self.connected:
            raise ConnectionError("Kafka producer not connected")
            
        message = {
            **value,
            "_metadata": {
                "topic": topic,
                "timestamp": datetime.utcnow().isoformat(),
                "producer": "quant-platform"
            }
        }
        
        # In production: await producer.send_and_wait(topic, message, key=key)
        print(f"[Kafka] Sent to {topic}: {json.dumps(message)[:100]}...")
        return True

# Message schemas
def create_market_data_message(symbol: str, price: float, volume: int, bid: float, ask: float) -> Dict[str, Any]:
    """Create standardized market data message"""
    return {
        "symbol": symbol,
        "price": price,
        "volume": volume,
        "bid": bid,
        "ask": ask,
        "spread": ask - bid,
        "timestamp": datetime.utcnow().isoformat()
    }

def create_news_message(headline: str, source: str, symbols: list, sentiment_score: float) -> Dict[str, Any]:
    """Create standardized news message with sentiment"""
    return {
        "headline": headline,
        "source": source,
        "symbols": symbols,
        "sentiment_score": sentiment_score,
        "sentiment_label": "positive" if sentiment_score > 0.2 else "negative" if sentiment_score < -0.2 else "neutral",
        "timestamp": datetime.utcnow().isoformat()
    }

def create_insight_message(symbol: str, technical_score: float, sentiment_score: float, action: str) -> Dict[str, Any]:
    """Create standardized quant insight message"""
    fused_score = (technical_score * 0.6) + (sentiment_score * 0.4)
    return {
        "symbol": symbol,
        "technical_score": technical_score,
        "sentiment_score": sentiment_score,
        "fused_score": round(fused_score, 2),
        "action": action,
        "timestamp": datetime.utcnow().isoformat()
    }

# Example usage
if __name__ == "__main__":
    import asyncio
    
    async def demo():
        producer = KafkaProducerWrapper()
        await producer.connect()
        
        # Send market data
        await producer.send(
            "raw_market_data",
            create_market_data_message("AAPL", 178.50, 1500000, 178.48, 178.52),
            key="AAPL"
        )
        
        # Send news with sentiment
        await producer.send(
            "raw_news_articles",
            create_news_message(
                "Bitcoin ETF sees record inflows",
                "Bloomberg",
                ["BTC", "ETH"],
                0.85
            )
        )
        
        # Send quant insight
        await producer.send(
            "quant_insights",
            create_insight_message("BTC", 78, 85, "STRONG_BUY"),
            key="BTC"
        )
        
        await producer.disconnect()
    
    asyncio.run(demo())
