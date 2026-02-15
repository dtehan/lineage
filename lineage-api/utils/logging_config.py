"""Logging configuration using loguru for structured JSON output.

This module provides centralized logging setup for the lineage application.
Logs are written to both stdout and a rotating log file in JSON format.

Usage:
    from utils.logging_config import configure_logging

    logger = configure_logging()
    logger.info("Application started", version="1.0.0")
"""

import sys
from loguru import logger


def configure_logging():
    """Configure loguru for dual-sink structured JSON logging.

    Setup:
    - Removes default stderr handler
    - Adds stdout sink with JSON serialization
    - Adds rotating file sink with JSON serialization
    - Sets log level to INFO for both sinks
    - Uses simple format: {time} {level} {message}

    File Sink Configuration:
    - Path: logs/lineage-api.log (relative to working directory)
    - Rotation: 100 MB per file
    - Retention: 30 days
    - Compression: gzip for rotated files

    Returns:
        The configured logger instance for convenience.

    Note:
        This is pure loguru setup. Flask integration happens in Plan 02.
        Both stdout and file sinks use JSON format for consistency.
    """
    # Remove default handler
    logger.remove()

    # Add JSON-serialized stdout handler
    logger.add(
        sink=sys.stdout,
        format="{time} {level} {message}",
        level="INFO",
        serialize=True,  # JSON output
    )

    # Add JSON-serialized rotating file handler
    logger.add(
        sink="logs/lineage-api.log",
        format="{time} {level} {message}",
        level="INFO",
        serialize=True,  # JSON output
        rotation="100 MB",  # Rotate when file reaches 100 MB
        retention="30 days",  # Delete rotated files older than 30 days
        compression="gz",  # Compress rotated files to save disk space
    )

    return logger
