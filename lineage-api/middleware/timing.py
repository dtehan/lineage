"""Server-Timing middleware for request performance observability.

This module provides before_request and after_request hooks to:
1. Initialize a per-request timing dict in flask.g
2. Emit a Server-Timing response header containing all recorded metrics
   plus a total request duration metric
3. Expose a record_timing() helper for service-layer instrumentation

Server-Timing format (W3C spec):
    Server-Timing: name;dur=X.XX, name2;dur=Y.YY, total;dur=Z.ZZ

Reference: https://w3c.github.io/server-timing/
"""

import time
from flask import Flask


def init_timing_middleware(app: Flask):
    """Initialize Server-Timing middleware hooks.

    Registers before_request and after_request handlers that:
    - Initialize g.timing dict and g.request_start timestamp before each request
    - Serialize accumulated timing entries plus a total metric into the
      Server-Timing response header after each request
    - Only emits the header when at least one timing entry was recorded

    Args:
        app: Flask application instance
    """

    @app.before_request
    def before_request_timing():
        """Initialize timing dict and start timestamp before request processing."""
        from flask import g
        g.timing = {}
        g.request_start = time.perf_counter()

    @app.after_request
    def after_request_timing(response):
        """Serialize timing entries into Server-Timing response header.

        Computes total request duration from g.request_start and includes
        it as the final metric. Only adds the header when at least one
        timing entry was recorded by the request handler.

        Args:
            response: Flask response object

        Returns:
            Modified response with Server-Timing header (if timings present)
        """
        from flask import g

        timing = getattr(g, "timing", {})
        if not timing:
            return response

        # Compute total request duration
        request_start = getattr(g, "request_start", None)
        total_ms = (time.perf_counter() - request_start) * 1000 if request_start is not None else 0.0

        # Serialize each metric as "name;dur=X.XX"
        parts = [f"{name};dur={elapsed:.2f}" for name, elapsed in timing.items()]
        parts.append(f"total;dur={total_ms:.2f}")

        response.headers["Server-Timing"] = ", ".join(parts)
        return response


def record_timing(name: str, elapsed_ms: float) -> None:
    """Record a timing metric for the current request.

    Stores the elapsed time in flask.g.timing under the given name.
    Silently no-ops when called outside a Flask request context (e.g.,
    background threads, unit tests without app context).

    Args:
        name: Metric name (e.g., "bfs_upstream", "db_downstream").
              Will appear as-is in the Server-Timing header.
        elapsed_ms: Elapsed time in milliseconds. Use time.perf_counter()
                    differences multiplied by 1000 for accurate measurements.
    """
    from flask import g
    if not hasattr(g, "timing"):
        return
    g.timing[name] = elapsed_ms
