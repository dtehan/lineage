# Phase 2: Credential Security - Research

**Researched:** 2026-01-29
**Domain:** Environment variable validation, fail-fast startup, credential security
**Confidence:** HIGH

## Summary

This phase addresses a critical security gap: the codebase contains hardcoded default credentials in `database/db_config.py` (lines 35-38) and `lineage-api/python_server.py` (lines 35-38). Both files fall back to `"password"` as the default password, which is a security vulnerability that should never exist in production code.

The standard approach for credential security follows the "fail-fast" pattern: applications must validate that all required credentials are present at startup and immediately terminate with a clear error message if any are missing. This prevents the application from running in an insecure state and provides immediate feedback to operators about misconfiguration.

The implementation scope is limited to Python only (db_config.py and python_server.py) since the Go server's config.go already uses viper without hardcoded defaults for credentials. The Go server will fail on database connection if credentials are missing, but adding explicit startup validation would be a good enhancement.

**Primary recommendation:** Remove all hardcoded credential defaults and implement a `validate_required_credentials()` function that runs at module load time, exiting with error code 1 and a clear message listing all missing environment variables.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| python-dotenv | >=1.0.0 | Load .env files | Already in requirements.txt, widely adopted |
| os (stdlib) | N/A | Access environment variables | Built-in, no additional dependencies |
| sys (stdlib) | N/A | System exit with error codes | Built-in, standard for fail-fast |

### Supporting (Not Needed for This Phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pydantic-settings | 2.x | Type-safe settings with validation | When you need complex validation, nested models |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual os.environ checks | pydantic-settings | pydantic adds dependency for simple use case |
| sys.exit(1) | raise SystemExit | sys.exit() is more explicit, same behavior |
| Print errors | logging | Logging adds complexity; print to stderr is standard for startup errors |

**Installation:**
No new dependencies required. Uses existing python-dotenv and stdlib.

## Architecture Patterns

### Recommended Pattern: Centralized Validation at Module Load

```
db_config.py (or config.py)
├── REQUIRED_VARS = ["TD_PASSWORD", ...]   # List of required vars
├── validate_required_credentials()         # Check all, collect missing
├── get_config()                            # Build config dict (no defaults for secrets)
└── CONFIG = get_config()                   # Module-level (fails on import if invalid)
```

### Pattern 1: Fail-Fast Credential Validation
**What:** Check all required environment variables at startup, fail immediately if any missing
**When to use:** Always for credential configuration
**Example:**
```python
# Source: Best practices from pydantic docs, 12-factor app methodology
import os
import sys

REQUIRED_ENV_VARS = [
    "TD_PASSWORD",  # Required - no safe default exists
]

def validate_required_credentials():
    """Validate all required credentials are present. Exit if any missing."""
    missing = [var for var in REQUIRED_ENV_VARS if not os.environ.get(var)]
    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}",
              file=sys.stderr)
        print("Please set these variables in your environment or .env file.",
              file=sys.stderr)
        sys.exit(1)

# Run validation at module load time
validate_required_credentials()

def get_config():
    """Get database configuration from environment variables."""
    return {
        "host": os.environ.get("TD_HOST", "localhost"),  # Safe default
        "user": os.environ.get("TD_USER", "demo_user"),  # Safe default
        "password": os.environ["TD_PASSWORD"],  # No default - validated above
        "database": os.environ.get("TD_DATABASE", "demo_user"),  # Safe default
    }

CONFIG = get_config()
```

### Pattern 2: Dual Variable Support (TERADATA_* and TD_*)
**What:** Support both naming conventions with clear precedence
**When to use:** When migrating or supporting multiple environments
**Example:**
```python
# Source: Current codebase pattern, extended with validation
def get_env_with_fallback(primary: str, fallback: str, default: str = None):
    """Get environment variable with fallback to alternate name."""
    return os.environ.get(primary) or os.environ.get(fallback) or default

# For password: no default allowed
password = os.environ.get("TERADATA_PASSWORD") or os.environ.get("TD_PASSWORD")
if not password:
    sys.exit(1)
```

### Anti-Patterns to Avoid
- **Hardcoded default credentials:** `os.environ.get("PASSWORD", "password")` - Never use a real-looking default for secrets
- **Silent fallback to insecure values:** Application appears to work but uses default credentials
- **Late validation:** Discovering missing credentials during first database call instead of at startup
- **Catching SystemExit:** Tests should verify the exit behavior, not suppress it

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Complex config validation | Custom validation logic | pydantic-settings | Type coercion, nested models, better errors |
| Secret rotation | Custom file watching | Cloud secret managers | Production security, audit trails |
| Config file parsing | Custom YAML/JSON parser | python-dotenv or viper | Edge cases, encoding, comments |

**Key insight:** For this phase, manual validation is appropriate because the requirements are simple (check if env vars exist). If validation needs grow to include type checking, ranges, or nested configuration, migrate to pydantic-settings.

## Common Pitfalls

### Pitfall 1: Testing Makes Validation Pass Accidentally
**What goes wrong:** Tests set environment variables globally, masking validation failures
**Why it happens:** pytest fixtures or conftest.py set credentials for all tests
**How to avoid:** Create specific tests that run in subprocess or use monkeypatch to clear variables
**Warning signs:** Tests pass locally but app fails in production

### Pitfall 2: Validation Runs Multiple Times
**What goes wrong:** Importing module from multiple places triggers validation repeatedly
**Why it happens:** Module-level code runs on every import (in some scenarios)
**How to avoid:** Python caches module imports; validation runs once per interpreter. Use `if __name__ == "__main__"` only for script-specific code, not validation
**Warning signs:** Multiple "Missing credentials" messages

### Pitfall 3: Empty String vs Unset Variable
**What goes wrong:** `os.environ.get("VAR")` returns empty string "" if VAR is set but empty
**Why it happens:** Environment variable is set to empty: `export VAR=""`
**How to avoid:** Check for both None and empty: `if not os.environ.get("VAR")`
**Warning signs:** Validation passes but database connection fails with empty password

### Pitfall 4: .env File Not Loaded Before Validation
**What goes wrong:** Validation runs before dotenv loads the .env file
**Why it happens:** Module import order - validation runs at module load time
**How to avoid:** Load dotenv at the very top of the module, before any os.environ access
**Warning signs:** Validation fails when .env file exists with correct values

### Pitfall 5: Different Behavior in Go vs Python Servers
**What goes wrong:** Go server starts successfully but Python server fails (or vice versa)
**Why it happens:** Different validation logic, different environment variable names
**How to avoid:** Document both TERADATA_* and TD_* naming conventions clearly
**Warning signs:** One server works, other doesn't, with same .env file

## Code Examples

Verified patterns from official sources:

### Complete db_config.py Refactor
```python
#!/usr/bin/env python3
"""
Database Configuration Module

Reads database credentials from .env file and environment variables.
Environment variables take precedence over .env file values.

REQUIRED ENVIRONMENT VARIABLES:
    TD_PASSWORD or TERADATA_PASSWORD - Database password (no default)

OPTIONAL (with defaults):
    TD_HOST / TERADATA_HOST - Teradata host (default: localhost)
    TD_USER / TERADATA_USER - Username (default: demo_user)
    TD_DATABASE / TERADATA_DATABASE - Database name (default: demo_user)
"""

import os
import sys
from pathlib import Path

# Load .env file FIRST, before any validation
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()  # Try current directory
except ImportError:
    pass  # python-dotenv not installed, rely on environment variables

# Required environment variables (at least one of each pair must be set)
REQUIRED_CREDENTIALS = [
    ("TERADATA_PASSWORD", "TD_PASSWORD"),  # Primary, Fallback
]

def validate_required_credentials():
    """
    Validate all required credentials are present.
    Exits with code 1 if any required credentials are missing.
    """
    missing = []
    for primary, fallback in REQUIRED_CREDENTIALS:
        value = os.environ.get(primary) or os.environ.get(fallback)
        if not value:
            missing.append(f"{primary} (or {fallback})")

    if missing:
        print("ERROR: Missing required environment variables:", file=sys.stderr)
        for var in missing:
            print(f"  - {var}", file=sys.stderr)
        print("\nPlease set these in your environment or .env file.", file=sys.stderr)
        print("See .env.example for configuration template.", file=sys.stderr)
        sys.exit(1)

# Validate at module load time - fail fast
validate_required_credentials()

def get_config():
    """Get database configuration from environment variables."""
    return {
        "host": os.environ.get("TERADATA_HOST") or os.environ.get("TD_HOST", "localhost"),
        "user": os.environ.get("TERADATA_USER") or os.environ.get("TD_USER", "demo_user"),
        "password": os.environ.get("TERADATA_PASSWORD") or os.environ["TD_PASSWORD"],
        "database": os.environ.get("TERADATA_DATABASE") or os.environ.get("TD_DATABASE", "demo_user"),
    }

CONFIG = get_config()
```

### Test for Missing Credentials (subprocess approach)
```python
# Source: pytest best practices for testing startup failures
import subprocess
import sys
import os

def test_missing_password_exits_with_error():
    """Verify application fails to start when TERADATA_PASSWORD is missing."""
    # Create clean environment without password
    env = os.environ.copy()
    env.pop("TD_PASSWORD", None)
    env.pop("TERADATA_PASSWORD", None)

    # Run db_config as subprocess to test exit behavior
    result = subprocess.run(
        [sys.executable, "-c", "import db_config"],
        capture_output=True,
        text=True,
        env=env,
        cwd="/path/to/database"
    )

    assert result.returncode == 1
    assert "Missing required environment variables" in result.stderr
    assert "TERADATA_PASSWORD" in result.stderr

def test_valid_credentials_starts_successfully():
    """Verify application starts when all credentials are present."""
    env = os.environ.copy()
    env["TD_PASSWORD"] = "test_password"

    result = subprocess.run(
        [sys.executable, "-c", "import db_config; print('OK')"],
        capture_output=True,
        text=True,
        env=env,
        cwd="/path/to/database"
    )

    assert result.returncode == 0
    assert "OK" in result.stdout
```

### Test for Missing Credentials (monkeypatch approach)
```python
# Source: pytest-with-eric.com best practices
import pytest
import sys
import importlib

def test_missing_password_raises_system_exit(monkeypatch):
    """Verify module exits when password is missing."""
    # Clear all password variables
    monkeypatch.delenv("TD_PASSWORD", raising=False)
    monkeypatch.delenv("TERADATA_PASSWORD", raising=False)

    # Remove cached module to force reimport
    if "db_config" in sys.modules:
        del sys.modules["db_config"]

    with pytest.raises(SystemExit) as exc_info:
        import db_config

    assert exc_info.value.code == 1
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded defaults for all settings | Fail-fast for secrets, defaults only for non-sensitive | 2020+ (12-factor adoption) | Prevents insecure deployments |
| Late validation (on first use) | Early validation (at import/startup) | Industry standard | Faster feedback, clearer errors |
| Single env var names | Multiple naming conventions with fallback | Project-specific | Easier migration, flexibility |

**Deprecated/outdated:**
- Storing credentials in source code (security risk, version control exposure)
- Silent fallback to default credentials (security risk, production incidents)
- Credentials in config files committed to repo (should be in .env, not committed)

## Open Questions

Things that couldn't be fully resolved:

1. **Go server validation enhancement**
   - What we know: Go server uses viper without hardcoded credential defaults, but doesn't explicitly validate at startup before database connection
   - What's unclear: Whether explicit startup validation is needed or if connection failure is acceptable
   - Recommendation: Out of scope for this phase; Go server already has better behavior than Python. Document as future enhancement.

2. **TD_HOST default value**
   - What we know: Current default is clearscape environment host, proposed is "localhost"
   - What's unclear: Whether localhost is appropriate for all use cases
   - Recommendation: Use "localhost" as it fails safely (no connection) rather than connecting to shared environment

## Sources

### Primary (HIGH confidence)
- [Pydantic Settings Documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) - BaseSettings patterns for required fields
- Current codebase analysis: db_config.py, python_server.py, config.go - Verified actual implementation state
- [Python os module documentation](https://docs.python.org/3/library/os.html#os.environ) - os.environ behavior

### Secondary (MEDIUM confidence)
- [pytest environment variables best practices](https://pytest-with-eric.com/pytest-best-practices/pytest-environment-variables/) - Testing patterns for env var validation
- [12-factor app methodology](https://12factor.net/config) - Configuration best practices
- [GitGuardian secrets management](https://blog.gitguardian.com/how-to-handle-secrets-in-python/) - Security patterns

### Tertiary (LOW confidence)
- WebSearch results for "Python fail-fast credentials 2026" - General patterns, not project-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing python-dotenv, stdlib only
- Architecture: HIGH - Pattern is simple and well-established
- Pitfalls: HIGH - Based on direct codebase analysis and standard testing patterns
- Code examples: HIGH - Verified against current db_config.py structure

**Research date:** 2026-01-29
**Valid until:** 90 days (stable domain, patterns rarely change)
