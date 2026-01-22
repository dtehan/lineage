#!/usr/bin/env python3
"""
Database Configuration Module

Reads database credentials from environment variables with fallback defaults.

Environment Variables:
    TD_HOST     - Teradata host
    TD_USER     - Teradata username
    TD_PASSWORD - Teradata password
    TD_DATABASE - Default database
"""

import os


def get_config():
    """Get database configuration from environment variables."""
    return {
        "host": os.environ.get("TD_HOST", "test-sad3sstx4u4llczi.env.clearscape.teradata.com"),
        "user": os.environ.get("TD_USER", "demo_user"),
        "password": os.environ.get("TD_PASSWORD", "password"),
        "database": os.environ.get("TD_DATABASE", "demo_user")
    }


CONFIG = get_config()
