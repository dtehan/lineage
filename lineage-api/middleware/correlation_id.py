"""Correlation ID middleware for request tracing.

This module provides before_request and after_request hooks to:
1. Generate or extract a correlation ID for each request
2. Bind it to loguru via contextualize() for thread-safe logging
3. Add X-Correlation-ID header to all responses
4. Log request/response for observability
"""

import uuid
from flask import g, request, Flask
from loguru import logger


def init_correlation_id_middleware(app: Flask):
    """Initialize correlation ID middleware hooks.

    Registers before_request and after_request handlers that:
    - Generate UUID4 correlation ID or extract from incoming headers
    - Store in flask.g.correlation_id
    - Bind to loguru via contextualize() for thread-safe context
    - Add X-Correlation-ID response header
    - Log request method, path, and status code at INFO level

    Args:
        app: Flask application instance
    """

    @app.before_request
    def before_request_correlation_id():
        """Generate or extract correlation ID before request processing.

        Priority order for correlation ID:
        1. X-Correlation-ID header (if provided by client)
        2. X-Request-ID header (alternative header name)
        3. Generate new UUID4

        The correlation ID is stored in flask.g and bound to loguru
        via contextualize() for automatic inclusion in all log messages.
        """
        # Try to extract from incoming headers
        correlation_id = (
            request.headers.get("X-Correlation-ID")
            or request.headers.get("X-Request-ID")
            or str(uuid.uuid4())
        )

        # Store in flask.g for access throughout request lifecycle
        g.correlation_id = correlation_id

        # Bind to loguru using contextualize() for thread-safe context
        # CRITICAL: Use contextualize(), NOT bind()
        # contextualize() uses contextvars, preventing ID leaking across concurrent requests
        logger.contextualize(correlation_id=correlation_id)

    @app.after_request
    def after_request_correlation_id(response):
        """Add correlation ID to response headers and log request completion.

        Args:
            response: Flask response object

        Returns:
            Modified response with X-Correlation-ID header
        """
        # Add correlation ID to response headers
        correlation_id = getattr(g, "correlation_id", "unknown")
        response.headers["X-Correlation-ID"] = correlation_id

        # Log request completion for observability
        logger.info(
            f"{request.method} {request.path} -> {response.status_code}",
            method=request.method,
            path=request.path,
            status_code=response.status_code,
        )

        return response
