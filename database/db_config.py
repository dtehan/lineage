#!/usr/bin/env python3
"""
Database Configuration Module

Reads database credentials from .env file and environment variables with fallback defaults.
Environment variables take precedence over .env file values.

Environment Variables:
    TD_HOST     - Teradata host
    TD_USER     - Teradata username
    TD_PASSWORD - Teradata password
    TD_DATABASE - Default database
"""

import os
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


def get_config():
    """Get database configuration from environment variables."""
    return {
        "host": os.environ.get("TD_HOST", "test-sad3sstx4u4llczi.env.clearscape.teradata.com"),
        "user": os.environ.get("TD_USER", "demo_user"),
        "password": os.environ.get("TD_PASSWORD", "password"),
        "database": os.environ.get("TD_DATABASE", "demo_user")
    }


CONFIG = get_config()
