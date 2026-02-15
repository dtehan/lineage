"""Base exception class for the lineage application."""


class LineageException(Exception):
    """Base exception for all domain exceptions in the lineage application.

    Attributes:
        message: Human-readable error message
        status_code: HTTP status code (default 500)
        details: Additional context (not exposed to clients)
    """

    def __init__(self, message: str, status_code: int = 500, details: dict = None):
        """Initialize a LineageException.

        Args:
            message: Human-readable error message
            status_code: HTTP status code (default 500)
            details: Additional context dict (default {})
        """
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details if details is not None else {}

    def to_dict(self) -> dict:
        """Convert exception to API response format.

        Returns:
            Dict with single "error" key containing the message.
            This preserves the existing {"error": string} API contract.
        """
        return {"error": self.message}
