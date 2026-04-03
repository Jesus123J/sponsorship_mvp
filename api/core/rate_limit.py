"""Rate limiting simple por IP — sin dependencias externas."""
import time
from collections import defaultdict
from fastapi import Request, HTTPException
from api.core.config import RATE_LIMIT_PER_MINUTE


class RateLimiter:
    """Rate limiter en memoria por IP. Limita requests por minuto."""

    def __init__(self, max_requests: int = RATE_LIMIT_PER_MINUTE):
        self.max_requests = max_requests
        self.requests: dict[str, list[float]] = defaultdict(list)

    def check(self, client_ip: str):
        """Verifica si el IP puede hacer un request. Lanza 429 si excede el limite."""
        now = time.time()
        window_start = now - 60

        # Limpiar requests viejos
        self.requests[client_ip] = [
            t for t in self.requests[client_ip] if t > window_start
        ]

        if len(self.requests[client_ip]) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"Demasiadas solicitudes. Limite: {self.max_requests}/minuto",
            )

        self.requests[client_ip].append(now)


rate_limiter = RateLimiter()
