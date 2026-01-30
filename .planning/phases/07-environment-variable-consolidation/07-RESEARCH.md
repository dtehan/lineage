# Phase 7: Environment Variable Consolidation - Research

**Researched:** 2026-01-29
**Domain:** Configuration management, environment variables, Go/Python conventions
**Confidence:** HIGH

## Summary

This phase consolidates the fragmented environment variable naming across the lineage application. Currently, there are two parallel naming schemes:
- **TD_*** variables (TD_HOST, TD_USER, TD_PASSWORD, TD_DATABASE) used by Python database scripts
- **TERADATA_*** variables used by Go server and Python Flask server
- **PORT** for server port (should become API_PORT)

The consolidation follows 12-factor app principles: strict separation of config from code, granular orthogonal variables, and language/OS-agnostic naming. The recommended approach standardizes on **TERADATA_** prefix for database connections (more descriptive and explicit) and **API_PORT** for the server port (disambiguates from other potential ports like database or Redis).

**Primary recommendation:** Standardize on TERADATA_* variables as the canonical names, support TD_* as legacy fallback for backwards compatibility during transition, and rename PORT to API_PORT with PORT as fallback.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| python-dotenv | 1.0.0+ | Python .env file loading | De facto standard, 12-factor compliant |
| spf13/viper | 1.18+ | Go configuration management | Most popular Go config library, supports env vars, files, defaults |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| os.environ | stdlib | Direct environment access | Simple cases, validation logic |
| strings.Replacer | stdlib | Key transformation in Viper | When mapping nested config keys |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| python-dotenv | pydantic-settings | pydantic adds validation but overkill for this simple use case |
| Viper | envconfig | envconfig is simpler but Viper already in use |
| Manual os.environ | python-decouple | decouple adds typing but minimal benefit here |

## Architecture Patterns

### Recommended Variable Structure

```bash
# Primary Teradata Connection (canonical names)
TERADATA_HOST=your-host.example.com
TERADATA_USER=your_username
TERADATA_PASSWORD=your_password
TERADATA_DATABASE=demo_user
TERADATA_PORT=1025

# Server Configuration
API_PORT=8080

# Redis Configuration (unchanged)
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# Validation Configuration (unchanged)
VALIDATION_MAX_DEPTH_LIMIT=20
VALIDATION_DEFAULT_MAX_DEPTH=5
VALIDATION_MIN_MAX_DEPTH=1
```

### Pattern 1: Fallback Chain with Primary/Legacy Support
**What:** Load primary variable first, fall back to legacy variable
**When to use:** Migration period, backwards compatibility
**Example:**
```python
# Python pattern - supports both naming conventions
def get_env_with_fallback(primary: str, legacy: str, default: str = None) -> str:
    """Get environment variable with fallback to legacy name."""
    value = os.environ.get(primary)
    if value:
        return value
    value = os.environ.get(legacy)
    if value:
        return value
    return default

DB_CONFIG = {
    "host": get_env_with_fallback("TERADATA_HOST", "TD_HOST", "localhost"),
    "user": get_env_with_fallback("TERADATA_USER", "TD_USER", "demo_user"),
    "password": get_env_with_fallback("TERADATA_PASSWORD", "TD_PASSWORD"),  # No default!
    "database": get_env_with_fallback("TERADATA_DATABASE", "TD_DATABASE", "demo_user"),
}
```

### Pattern 2: Viper Environment Variable Binding (Go)
**What:** Use Viper's AutomaticEnv with explicit bindings for legacy support
**When to use:** Go server configuration
**Example:**
```go
// Source: spf13/viper documentation
func Load() (*Config, error) {
    viper.AutomaticEnv()

    // Primary bindings (TERADATA_* prefix)
    viper.SetDefault("API_PORT", "8080")
    viper.SetDefault("TERADATA_PORT", 1025)
    viper.SetDefault("TERADATA_DATABASE", "demo_user")

    // Legacy fallbacks - bind TD_* to same config keys if TERADATA_* not set
    if viper.GetString("TERADATA_HOST") == "" {
        viper.BindEnv("TERADATA_HOST", "TD_HOST")
    }
    if viper.GetString("TERADATA_USER") == "" {
        viper.BindEnv("TERADATA_USER", "TD_USER")
    }
    if viper.GetString("TERADATA_PASSWORD") == "" {
        viper.BindEnv("TERADATA_PASSWORD", "TD_PASSWORD")
    }
    if viper.GetString("TERADATA_DATABASE") == "" {
        viper.BindEnv("TERADATA_DATABASE", "TD_DATABASE")
    }
    // API_PORT with PORT fallback
    if viper.GetString("API_PORT") == "" {
        viper.BindEnv("API_PORT", "PORT")
    }

    return buildConfig()
}
```

### Pattern 3: Centralized Config Module (Python)
**What:** Single db_config.py that all scripts import
**When to use:** All Python database scripts
**Example:**
```python
# database/db_config.py - single source of truth
"""
Environment Variables (in priority order):
  TERADATA_HOST / TD_HOST     - Teradata host
  TERADATA_USER / TD_USER     - Teradata username
  TERADATA_PASSWORD / TD_PASSWORD - Teradata password (REQUIRED)
  TERADATA_DATABASE / TD_DATABASE - Default database
"""

import os
import sys
from pathlib import Path

# Load .env file
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

def get_required_env(*names: str) -> str:
    """Get first available env var from names, error if none set."""
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    print(f"ERROR: Missing required env var: {' or '.join(names)}", file=sys.stderr)
    sys.exit(1)

def get_optional_env(*names: str, default: str = None) -> str:
    """Get first available env var from names, or default."""
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return default

# Validate at import time
CONFIG = {
    "host": get_optional_env("TERADATA_HOST", "TD_HOST", default="localhost"),
    "user": get_optional_env("TERADATA_USER", "TD_USER", default="demo_user"),
    "password": get_required_env("TERADATA_PASSWORD", "TD_PASSWORD"),
    "database": get_optional_env("TERADATA_DATABASE", "TD_DATABASE", default="demo_user"),
}
```

### Anti-Patterns to Avoid
- **Environment grouping:** Don't create DEV_DB_HOST, PROD_DB_HOST - use same variable names across environments
- **Prefixless variables:** Generic names like HOST, USER, PASSWORD can collide with system variables
- **Hardcoded fallback credentials:** Never use actual credential values as defaults
- **Silent failures:** Always validate required variables at startup, not first use
- **Duplicate logic:** Don't repeat env var loading in every file - centralize it

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .env file parsing | Manual file parsing | python-dotenv / Viper | Handles quoting, interpolation, edge cases |
| Config validation | Manual if/else chains | Fail-fast validation at import | Catches issues immediately |
| Fallback chains | Repeated ternary expressions | Helper function | DRY, consistent behavior |

**Key insight:** Environment variable handling seems simple but has subtle edge cases (empty strings vs unset, quoting, interpolation). Use established libraries.

## Common Pitfalls

### Pitfall 1: Empty String vs Unset
**What goes wrong:** `os.environ.get("VAR")` returns empty string "" if VAR is set but empty, which is truthy in some checks but falsy in others
**Why it happens:** Environment variables can be set to empty string explicitly
**How to avoid:** Always check for both None and empty: `if not os.environ.get("VAR")` or use `.strip()`
**Warning signs:** Variables appear set but connection fails

### Pitfall 2: Dotenv Loading Order
**What goes wrong:** Environment variables checked before dotenv loads
**Why it happens:** Import order in Python, module-level code runs before main()
**How to avoid:** Load dotenv at very top of module, before any os.environ access
**Warning signs:** Works with env vars, fails with .env file

### Pitfall 3: Viper Case Sensitivity Mismatch
**What goes wrong:** Config keys lowercase, env vars uppercase, mapping fails
**Why it happens:** Viper config keys are case-insensitive, but env vars are case-sensitive
**How to avoid:** Use AutomaticEnv() which handles uppercasing automatically
**Warning signs:** Env vars ignored, only defaults used

### Pitfall 4: PORT Collision
**What goes wrong:** PORT conflicts with other services or Vite dev server
**Why it happens:** PORT is a very common variable name
**How to avoid:** Use API_PORT with PORT as fallback for backwards compatibility
**Warning signs:** Port already in use errors

### Pitfall 5: Partial Migration
**What goes wrong:** Some files updated, others still use old variable names
**Why it happens:** Large codebase, easy to miss files
**How to avoid:** Grep for all variable usages before and after migration, comprehensive testing
**Warning signs:** Works in some contexts, fails in others

## Code Examples

### Complete Python db_config.py Update
```python
#!/usr/bin/env python3
"""
Database Configuration Module

Loads Teradata credentials from environment variables or .env file.
Environment variables take precedence over .env file values.

REQUIRED (at least one must be set):
    TERADATA_PASSWORD or TD_PASSWORD - Teradata password

OPTIONAL (with defaults):
    TERADATA_HOST / TD_HOST     - Teradata host (default: localhost)
    TERADATA_USER / TD_USER     - Teradata username (default: demo_user)
    TERADATA_DATABASE / TD_DATABASE - Default database (default: demo_user)
    TERADATA_PORT / TD_PORT     - Teradata port (default: 1025)
"""

import os
import sys
from pathlib import Path

# Load .env file first (optional dependency)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass


def get_env(*names: str, required: bool = False, default: str = None) -> str:
    """
    Get environment variable with fallback support.

    Args:
        *names: Variable names to try in order (e.g., "TERADATA_HOST", "TD_HOST")
        required: If True, exit with error when not found
        default: Default value if not required and not found

    Returns:
        The first non-empty value found, or default
    """
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value

    if required:
        print(f"ERROR: Missing required environment variable:", file=sys.stderr)
        print(f"  Set one of: {', '.join(names)}", file=sys.stderr)
        print(f"\nSee .env.example for configuration template.", file=sys.stderr)
        sys.exit(1)

    return default


# Validate required credentials at module load time (fail fast)
_password = get_env("TERADATA_PASSWORD", "TD_PASSWORD", required=True)


def get_config() -> dict:
    """Get database configuration dictionary."""
    return {
        "host": get_env("TERADATA_HOST", "TD_HOST", default="localhost"),
        "user": get_env("TERADATA_USER", "TD_USER", default="demo_user"),
        "password": _password,
        "database": get_env("TERADATA_DATABASE", "TD_DATABASE", default="demo_user"),
        "port": int(get_env("TERADATA_PORT", "TD_PORT", default="1025")),
    }


CONFIG = get_config()
```

### Complete Go config.go Update
```go
// Source: spf13/viper documentation patterns
package config

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/spf13/viper"
)

func Load() (*Config, error) {
    loadDotEnv()

    viper.AutomaticEnv()

    // Set defaults
    viper.SetDefault("API_PORT", "8080")
    viper.SetDefault("TERADATA_PORT", 1025)
    viper.SetDefault("TERADATA_DATABASE", "demo_user")
    viper.SetDefault("REDIS_ADDR", "localhost:6379")
    viper.SetDefault("REDIS_DB", 0)

    // Legacy fallbacks - only if primary not set
    bindLegacyFallback("TERADATA_HOST", "TD_HOST")
    bindLegacyFallback("TERADATA_USER", "TD_USER")
    bindLegacyFallback("TERADATA_PASSWORD", "TD_PASSWORD")
    bindLegacyFallback("TERADATA_DATABASE", "TD_DATABASE")
    bindLegacyFallback("TERADATA_PORT", "TD_PORT")
    bindLegacyFallback("API_PORT", "PORT")

    // Build and return config
    return &Config{
        Port: viper.GetString("API_PORT"),
        Teradata: TeradataConfig{
            Host:     viper.GetString("TERADATA_HOST"),
            Port:     viper.GetInt("TERADATA_PORT"),
            User:     viper.GetString("TERADATA_USER"),
            Password: viper.GetString("TERADATA_PASSWORD"),
            Database: viper.GetString("TERADATA_DATABASE"),
        },
        Redis: RedisConfig{
            Addr:     viper.GetString("REDIS_ADDR"),
            Password: viper.GetString("REDIS_PASSWORD"),
            DB:       viper.GetInt("REDIS_DB"),
        },
    }, nil
}

// bindLegacyFallback binds legacy env var as fallback if primary not set
func bindLegacyFallback(primary, legacy string) {
    if os.Getenv(primary) == "" && os.Getenv(legacy) != "" {
        viper.BindEnv(primary, legacy)
    }
}
```

### Updated .env.example
```bash
# Lineage Application Environment Configuration
# Copy this file to .env and update with your values
# Environment variables take precedence over .env file values

# =============================================================================
# Teradata Database Connection
# =============================================================================
# Primary variable names (recommended)
TERADATA_HOST=your-teradata-host.example.com
TERADATA_USER=your_username
TERADATA_PASSWORD=your_password
TERADATA_DATABASE=demo_user
TERADATA_PORT=1025

# Legacy aliases (deprecated, use TERADATA_* instead)
# TD_HOST, TD_USER, TD_PASSWORD, TD_DATABASE are still supported for backwards
# compatibility but will be removed in a future version.

# =============================================================================
# Server Configuration
# =============================================================================
# API server port (default: 8080)
API_PORT=8080

# =============================================================================
# Redis Cache (Optional)
# =============================================================================
# If Redis is unavailable, the application falls back gracefully
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# =============================================================================
# Validation Configuration
# =============================================================================
VALIDATION_MAX_DEPTH_LIMIT=20
VALIDATION_DEFAULT_MAX_DEPTH=5
VALIDATION_MIN_MAX_DEPTH=1
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dual naming (TD_* and TERADATA_*) | Single canonical name with fallback | This phase | Reduces confusion, maintains compatibility |
| Generic PORT | Specific API_PORT | This phase | Avoids collision with other services |
| Scattered env loading | Centralized db_config.py | Phase 02 | Single source of truth |

**Deprecated/outdated:**
- TD_* prefix: Supported as legacy fallback, recommend migration to TERADATA_*
- PORT variable: Supported as legacy fallback, recommend API_PORT

## Files to Update

### High Priority (Core Configuration)
| File | Current State | Changes Needed |
|------|---------------|----------------|
| `database/db_config.py` | Uses TD_* with TERADATA_* fallback | Make TERADATA_* primary, TD_* fallback |
| `lineage-api/internal/infrastructure/config/config.go` | Uses TERADATA_* and PORT | Add TD_* fallbacks, rename PORT to API_PORT |
| `lineage-api/python_server.py` | Uses TERADATA_* primary | Add API_PORT support |
| `.env.example` | Lists both sets | Consolidate, document deprecation |

### Medium Priority (Documentation)
| File | Current State | Changes Needed |
|------|---------------|----------------|
| `CLAUDE.md` | Documents both variable sets | Consolidate documentation |
| `docs/user_guide.md` | Documents TD_* primarily | Update to TERADATA_* |
| `docs/SECURITY.md` | References PORT | Update to API_PORT |

### Low Priority (Cleanup/Legacy)
| File | Current State | Changes Needed |
|------|---------------|----------------|
| `lineage-api/server.py` | Uses TD_* directly | Update to new pattern (legacy server) |
| `lineage-api/config.yaml` | Uses TERADATA_* | No change needed |
| `database/extract_dbql_lineage.py` | Imports from db_config | No change needed (uses centralized config) |

## Open Questions

1. **Deprecation Timeline**
   - What we know: TD_* variables work but create confusion
   - What's unclear: When should we remove TD_* support entirely?
   - Recommendation: Log deprecation warning when TD_* used, plan removal for v2.0

2. **TERADATA_PORT Support in Python**
   - What we know: Go config supports TERADATA_PORT, Python only has TD_PORT implicit
   - What's unclear: Do any Python scripts need explicit port configuration?
   - Recommendation: Add TERADATA_PORT support to db_config.py for consistency

## Sources

### Primary (HIGH confidence)
- [spf13/viper GitHub](https://github.com/spf13/viper) - Environment variable binding patterns
- [python-dotenv PyPI](https://pypi.org/project/python-dotenv/) - .env file loading
- [12-factor App Config](https://12factor.net/config) - Configuration best practices

### Secondary (MEDIUM confidence)
- [Baeldung Environment Variables](https://www.baeldung.com/linux/shell-variable-naming-conventions) - Naming conventions
- [ENV Naming Conventions](https://ghostable.dev/learn/env-naming-conventions) - SCREAMING_SNAKE_CASE standard
- [Go Viper Configuration Guide](https://oneuptime.com/blog/post/2026-01-07-go-viper-configuration/view) - Viper usage patterns

### Project-Specific (HIGH confidence)
- Current codebase analysis: `database/db_config.py`, `lineage-api/internal/infrastructure/config/config.go`
- Prior implementation in Phase 02: Credential security patterns established

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - python-dotenv and Viper are industry standards, verified via official docs
- Architecture patterns: HIGH - Based on current codebase analysis and 12-factor principles
- Pitfalls: HIGH - Based on actual issues documented in Phase 02 implementation

**Research date:** 2026-01-29
**Valid until:** 90 days (configuration patterns are stable)
