"""
Database and Server Configuration

Reads configuration from .env file and environment variables.
Environment variables take precedence over .env file values.

DATABASE Environment Variables:
    TERADATA_HOST     - Teradata host (default: ClearScape test environment)
    TERADATA_USER     - Teradata username (default: demo_user)
    TERADATA_PASSWORD - Teradata password (REQUIRED)
    TERADATA_DATABASE - Default database (default: demo_user)

    Legacy aliases (deprecated): TD_HOST, TD_USER, TD_PASSWORD, TD_DATABASE

SERVER Environment Variables:
    API_PORT - Server port (default: 8080)
    PORT     - Legacy alias for API_PORT
"""

import os
import sys
from pathlib import Path
import teradatasql

# Try to load .env file (python-dotenv is optional)
try:
    from dotenv import load_dotenv
    # Look for .env in project root (parent of lineage-api/)
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Also check current working directory
        load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, rely on environment variables


# Required credentials that must be provided (primary, fallback) - at least one must be set
REQUIRED_CREDENTIALS = [
    ("TERADATA_PASSWORD", "TD_PASSWORD"),  # At least one must be set
]


def validate_required_credentials():
    """
    Validate that all required credentials are set.
    Exits with code 1 if any required credentials are missing.
    """
    missing = []

    for primary, fallback in REQUIRED_CREDENTIALS:
        primary_val = os.environ.get(primary, "").strip()
        fallback_val = os.environ.get(fallback, "").strip()

        if not primary_val and not fallback_val:
            missing.append(f"{primary} (or {fallback})")

    if missing:
        print("ERROR: Missing required environment variables:", file=sys.stderr)
        for var in missing:
            print(f"  - {var}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Please set these in your environment or .env file.", file=sys.stderr)
        print("See .env.example for configuration template.", file=sys.stderr)
        sys.exit(1)


# Run validation at module load time (after dotenv loading)
validate_required_credentials()


# Database configuration - supports both TD_* (database scripts) and TERADATA_* (Go server) prefixes
# Password is required - validation already ran, so at least one is set
DB_CONFIG = {
    "host": os.environ.get("TERADATA_HOST") or os.environ.get("TD_HOST", "test-sad3sstx4u4llczi.env.clearscape.teradata.com"),
    "user": os.environ.get("TERADATA_USER") or os.environ.get("TD_USER", "demo_user"),
    "password": os.environ.get("TERADATA_PASSWORD") or os.environ.get("TD_PASSWORD"),
    "database": os.environ.get("TERADATA_DATABASE") or os.environ.get("TD_DATABASE", "demo_user"),
}

# Redis cache configuration (optional - app gracefully degrades without Redis)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL = int(os.environ.get("CACHE_TTL", "3600"))


def get_db_connection():
    """Create a database connection."""
    return teradatasql.connect(
        host=DB_CONFIG["host"],
        user=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        database=DB_CONFIG["database"],
    )
