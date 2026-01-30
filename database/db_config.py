#!/usr/bin/env python3
"""
Database Configuration Module

Reads database credentials from .env file and environment variables with fallback defaults.
Environment variables take precedence over .env file values.

REQUIRED Environment Variables (at least one must be set):
    TD_PASSWORD or TERADATA_PASSWORD - Teradata password (required)

OPTIONAL Environment Variables (with defaults):
    TD_HOST     - Teradata host (default: ClearScape test environment)
    TD_USER     - Teradata username (default: demo_user)
    TD_DATABASE - Default database (default: demo_user)
"""

import os
import sys
from pathlib import Path

# Try to load .env file (python-dotenv is optional)
try:
    from dotenv import load_dotenv
    # Look for .env in project root (parent of database/)
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


def get_config():
    """Get database configuration from environment variables."""
    # Password is required - validation already ran, so at least one is set
    password = os.environ.get("TERADATA_PASSWORD") or os.environ.get("TD_PASSWORD")

    return {
        "host": os.environ.get("TD_HOST", "test-sad3sstx4u4llczi.env.clearscape.teradata.com"),
        "user": os.environ.get("TD_USER", "demo_user"),
        "password": password,
        "database": os.environ.get("TD_DATABASE", "demo_user")
    }


CONFIG = get_config()
