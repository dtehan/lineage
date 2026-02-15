"""Logging configuration using loguru for structured JSON output.

This module provides centralized logging setup for the lineage application.
Logs are written to stderr in JSON format for container-friendly deployment.

Usage:
    from utils.logging_config import configure_logging

    logger = configure_logging()
    logger.info("Application started", version="1.0.0")
"""

from loguru import logger


def configure_logging():
    """Configure loguru for structured JSON logging to stderr.

    Setup:
    - Removes default stderr handler
    - Adds new stderr sink with JSON serialization
    - Sets log level to INFO
    - Uses simple format: {time} {level} {message}

    Returns:
        The configured logger instance for convenience.

    Note:
        This is pure loguru setup. Flask integration happens in Plan 02.
        No file sink is configured - stderr only for container deployments.
    """
    # Remove default handler
    logger.remove()

    # Add JSON-serialized stderr handler
    logger.add(
        sink=lambda msg: print(msg, flush=True),  # stderr via print
        format="{time} {level} {message}",
        level="INFO",
        serialize=True,  # JSON output
    )

    return logger
