"""Global error handlers for Flask application.

This module registers error handlers that:
1. Catch domain exceptions (DatasetNotFoundError, LineageException)
2. Catch werkzeug HTTPException and pass through unchanged
3. Catch all other exceptions with sanitized error messages
4. Return consistent {"error": string} JSON responses
5. Log exceptions with correlation ID context
"""

from flask import Flask, jsonify, g
from werkzeug.exceptions import HTTPException
from loguru import logger

from exceptions.base import LineageException
from exceptions.domain import DatasetNotFoundError
from utils.sanitize import sanitize_error_message


def register_error_handlers(app: Flask):
    """Register global error handlers for the Flask application.

    Handlers are registered in order from most specific to most general:
    1. DatasetNotFoundError (404) - Expected errors, logged at WARNING level
    2. LineageException (500) - Application errors, logged at ERROR level
    3. HTTPException - werkzeug exceptions, passed through unchanged
    4. Exception - Catch-all for unexpected errors, sanitized and logged

    Args:
        app: Flask application instance
    """

    @app.errorhandler(DatasetNotFoundError)
    def handle_dataset_not_found(e: DatasetNotFoundError):
        """Handle DatasetNotFoundError exceptions.

        These are expected operational errors (404s), so log at WARNING level
        rather than ERROR. The correlation ID is automatically included via
        contextualize() but we also explicitly mention it in the log message.

        Args:
            e: DatasetNotFoundError instance

        Returns:
            JSON response with 404 status code
        """
        correlation_id = getattr(g, "correlation_id", "unknown")
        logger.warning(
            f"Dataset not found: {e.message}",
            correlation_id=correlation_id,
            error_type="DatasetNotFoundError",
        )
        return jsonify(e.to_dict()), e.status_code

    @app.errorhandler(LineageException)
    def handle_lineage_exception(e: LineageException):
        """Handle LineageException and its subclasses.

        These are application errors that should be logged with full traceback.
        Uses logger.exception() to capture the stack trace automatically.

        Args:
            e: LineageException instance

        Returns:
            JSON response with exception's status code
        """
        correlation_id = getattr(g, "correlation_id", "unknown")
        logger.exception(
            f"Lineage exception: {e.message}",
            correlation_id=correlation_id,
            error_type=e.__class__.__name__,
            status_code=e.status_code,
        )
        return jsonify(e.to_dict()), e.status_code

    @app.errorhandler(Exception)
    def handle_generic_exception(e: Exception):
        """Handle all other exceptions not caught by specific handlers.

        First checks if it's a werkzeug HTTPException (like 404, 405, etc.)
        and passes those through unchanged. For other exceptions, sanitizes
        the error message and returns a generic 500 response.

        Args:
            e: Exception instance

        Returns:
            JSON response (werkzeug passes through original, others get 500)
        """
        correlation_id = getattr(g, "correlation_id", "unknown")

        # Pass through werkzeug HTTPExceptions unchanged (404, 405, etc.)
        if isinstance(e, HTTPException):
            logger.info(
                f"HTTP exception: {e.code} {e.name}",
                correlation_id=correlation_id,
                status_code=e.code,
            )
            return e

        # For all other exceptions: sanitize, log with traceback, return 500
        sanitized_message = sanitize_error_message(str(e))
        logger.exception(
            f"Unhandled exception: {sanitized_message}",
            correlation_id=correlation_id,
            error_type=e.__class__.__name__,
        )

        return jsonify({"error": sanitized_message}), 500
