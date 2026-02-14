"""
Flask Blueprint route modules for the Lineage API.

This package contains:
- health.py: Health check endpoint
- openlineage.py: OpenLineage-aligned API endpoints
"""

from routes.health import health_bp
from routes.openlineage import openlineage_bp

__all__ = ["health_bp", "openlineage_bp"]
