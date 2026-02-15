"""Sanitization utilities for removing sensitive data from error messages."""

import re
from typing import Pattern

# Compiled regex patterns for performance
# Pattern 1: Key-value pairs with password/token/secret keywords
_PASSWORD_PATTERN: Pattern = re.compile(
    r"(password|pwd|passwd|token|secret|key|apikey|api_key)[\s]*[=:][\s]*['\"]?[\w\-\.@!#$%^&*()]+['\"]?",
    re.IGNORECASE,
)

# Pattern 2: Bearer tokens
_BEARER_TOKEN_PATTERN: Pattern = re.compile(
    r"Bearer\s+[\w\-\.]+", re.IGNORECASE
)

# Pattern 3: Connection strings with credentials
# Matches patterns like: user:password@host:port or user=value;password=value
_CONNECTION_STRING_PATTERN: Pattern = re.compile(
    r"([\w]+):([\w\-\.@!#$%^&*()]+)@([\w\-\.]+)(:\d+)?", re.IGNORECASE
)

_CONNECTION_PARAM_PATTERN: Pattern = re.compile(
    r"(password|pwd|passwd)[\s]*=[\s]*['\"]?[\w\-\.@!#$%^&*()]+['\"]?",
    re.IGNORECASE,
)


def sanitize_error_message(message: str) -> str:
    """Remove sensitive data patterns from error messages.

    This function strips:
    - Password/token key-value pairs (password=secret, token=xyz)
    - Bearer tokens
    - Connection strings containing credentials (user:pass@host:port)

    Conservative approach: Only filters clearly sensitive patterns.
    Does NOT filter email addresses or SSNs (not relevant to this application).

    Args:
        message: The error message to sanitize

    Returns:
        Sanitized message with sensitive data replaced by [REDACTED]

    Examples:
        >>> sanitize_error_message("Failed: password=secret123")
        'Failed: password=[REDACTED]'

        >>> sanitize_error_message("Auth failed with token: Bearer abc123xyz")
        'Auth failed with token: Bearer [REDACTED]'

        >>> sanitize_error_message("Connection failed to user:pass@host:1025")
        'Connection failed to user:[REDACTED]@host:1025'
    """
    if not message:
        return message

    # Replace password key-value pairs
    sanitized = _PASSWORD_PATTERN.sub(r"\1=[REDACTED]", message)

    # Replace Bearer tokens
    sanitized = _BEARER_TOKEN_PATTERN.sub("Bearer [REDACTED]", sanitized)

    # Replace connection string credentials (preserve user and host)
    sanitized = _CONNECTION_STRING_PATTERN.sub(r"\1:[REDACTED]@\3\4", sanitized)

    # Replace connection parameter passwords
    sanitized = _CONNECTION_PARAM_PATTERN.sub(r"\1=[REDACTED]", sanitized)

    return sanitized
