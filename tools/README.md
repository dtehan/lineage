# Development Tools

Utility scripts for development and maintenance.

## Scripts

### server_cleanup.sh
Cleans up background server processes.

**Usage:**
```bash
./tools/server_cleanup.sh
```

**What it does:**
- Finds and kills Python Flask/server processes running on port 8080
- Useful when server processes don't shut down cleanly
- Prevents "port already in use" errors

**When to use:**
- After interrupted server runs (Ctrl+C failures)
- When switching between Python and Go servers
- Before starting a clean server instance

**Note:** This script uses `lsof` and `kill` commands to terminate processes. Use with caution in production environments.
