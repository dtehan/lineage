#!/usr/bin/env python3
"""
Database Configuration Module

Reads database credentials from .env file and environment variables with fallback defaults.
Environment variables take precedence over .env file values.

PRIMARY Environment Variables (recommended):
    TERADATA_HOST     - Teradata host (default: ClearScape test environment)
    TERADATA_USER     - Teradata username (default: demo_user)
    TERADATA_PASSWORD - Teradata password (REQUIRED)
    TERADATA_DATABASE - Default database (default: demo_user)
    TERADATA_PORT     - Teradata port (default: 1025)

LEGACY Environment Variables (deprecated, still supported):
    TD_HOST     - Fallback for TERADATA_HOST
    TD_USER     - Fallback for TERADATA_USER
    TD_PASSWORD - Fallback for TERADATA_PASSWORD
    TD_DATABASE - Fallback for TERADATA_DATABASE
    TD_PORT     - Fallback for TERADATA_PORT

Migration: Replace TD_* variables with TERADATA_* equivalents for consistency
with the Go backend and Python server configurations.
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


def get_env(*names: str, required: bool = False, default: str = None) -> str:
    """
    Get an environment variable, trying multiple names in priority order.

    Args:
        *names: Variable names to try, in priority order (TERADATA_* first, TD_* second)
        required: If True, exit with error if no value found
        default: Default value if not required and no value found

    Returns:
        First non-empty value found, or default if none found
    """
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    if required:
        print("ERROR: Missing required environment variable:", file=sys.stderr)
        print(f"  Set one of: {', '.join(names)}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Please set these in your environment or .env file.", file=sys.stderr)
        print("See .env.example for configuration template.", file=sys.stderr)
        sys.exit(1)
    return default


def get_config():
    """Get database configuration from environment variables.

    Note: The Teradata Python driver (teradatasql) doesn't use 'port' or 'dbs_port'.
    For non-default ports, include port in host as 'hostname:port' format.
    For default port 1025, just use the hostname.
    """
    host = get_env("TERADATA_HOST", "TD_HOST", default="test-sad3sstx4u4llczi.env.clearscape.teradata.com")
    port = get_env("TERADATA_PORT", "TD_PORT", default="1025")

    # Only append port to host if it's not the default (1025) and not already present
    if port != "1025" and ":" not in host:
        host = f"{host}:{port}"

    return {
        "host": host,
        "user": get_env("TERADATA_USER", "TD_USER", default="demo_user"),
        "password": get_env("TERADATA_PASSWORD", "TD_PASSWORD", required=True),
        "database": get_env("TERADATA_DATABASE", "TD_DATABASE", default="demo_user")
    }


CONFIG = get_config()


def get_openlineage_namespace():
    """Generate OpenLineage namespace URI from Teradata connection config.

    Format: teradata://{host}:{port}
    Example: teradata://demo.teradata.com:1025
    """
    host = CONFIG.get('host', 'localhost:1025')
    # host parameter already includes port (host:port format)
    # If no port specified, add default
    if ":" not in host:
        host = f"{host}:1025"
    return f"teradata://{host}"
