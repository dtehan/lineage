#!/usr/bin/env python3
"""
Tests for credential validation in db_config.py and python_server.py.

These tests verify the fail-fast behavior when required credentials are missing.
Uses subprocess to test module import behavior in isolation.

NOTE: Tests that check for missing credentials must run in a clean environment
where no .env file exists, to avoid dotenv loading credentials automatically.
"""

import subprocess
import sys
import os
import tempfile
import shutil
import pytest


class TestDbConfigCredentialValidation:
    """Test credential validation in database/db_config.py"""

    def test_missing_password_exits_with_error(self):
        """Verify db_config exits with code 1 when password is missing."""
        # Create clean environment without password variables
        env = os.environ.copy()
        env.pop("TD_PASSWORD", None)
        env.pop("TERADATA_PASSWORD", None)

        # Create a temporary directory without .env file
        with tempfile.TemporaryDirectory() as tmpdir:
            # Copy db_config.py to temp directory
            db_config_src = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "db_config.py"
            )
            db_config_dst = os.path.join(tmpdir, "db_config.py")
            shutil.copy(db_config_src, db_config_dst)

            # Run db_config import as subprocess in temp directory (no .env file)
            result = subprocess.run(
                [sys.executable, "-c", "import db_config"],
                capture_output=True,
                text=True,
                env=env,
                cwd=tmpdir
            )

        assert result.returncode == 1, f"Expected exit code 1, got {result.returncode}. stderr: {result.stderr}"
        assert "Missing required environment variables" in result.stderr
        assert "TERADATA_PASSWORD" in result.stderr or "TD_PASSWORD" in result.stderr

    def test_valid_td_password_starts_successfully(self):
        """Verify db_config loads successfully with TD_PASSWORD set."""
        env = os.environ.copy()
        env.pop("TERADATA_PASSWORD", None)  # Remove to test fallback
        env["TD_PASSWORD"] = "test_password"

        result = subprocess.run(
            [sys.executable, "-c", "import db_config; print('OK')"],
            capture_output=True,
            text=True,
            env=env,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )

        assert result.returncode == 0, f"Failed with: {result.stderr}"
        assert "OK" in result.stdout

    def test_valid_teradata_password_starts_successfully(self):
        """Verify db_config loads successfully with TERADATA_PASSWORD set."""
        env = os.environ.copy()
        env.pop("TD_PASSWORD", None)  # Remove to test primary
        env["TERADATA_PASSWORD"] = "test_password"

        result = subprocess.run(
            [sys.executable, "-c", "import db_config; print('OK')"],
            capture_output=True,
            text=True,
            env=env,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )

        assert result.returncode == 0, f"Failed with: {result.stderr}"
        assert "OK" in result.stdout

    def test_empty_password_exits_with_error(self):
        """Verify empty string password is treated as missing."""
        env = os.environ.copy()
        env["TD_PASSWORD"] = ""
        env["TERADATA_PASSWORD"] = ""

        # Use temp directory to avoid .env loading
        with tempfile.TemporaryDirectory() as tmpdir:
            db_config_src = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "db_config.py"
            )
            db_config_dst = os.path.join(tmpdir, "db_config.py")
            shutil.copy(db_config_src, db_config_dst)

            result = subprocess.run(
                [sys.executable, "-c", "import db_config"],
                capture_output=True,
                text=True,
                env=env,
                cwd=tmpdir
            )

        assert result.returncode == 1, f"Expected exit code 1, got {result.returncode}"
        assert "Missing required environment variables" in result.stderr


class TestPythonServerCredentialValidation:
    """Test credential validation in lineage-api/python_server.py"""

    def test_missing_password_exits_with_error(self):
        """Verify python_server exits with code 1 when password is missing."""
        env = os.environ.copy()
        env.pop("TD_PASSWORD", None)
        env.pop("TERADATA_PASSWORD", None)

        # Get path to lineage-api directory
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        server_file = os.path.join(project_root, "lineage-api", "python_server.py")

        # Create a temporary directory without .env file
        with tempfile.TemporaryDirectory() as tmpdir:
            # Copy python_server.py to temp directory
            server_dst = os.path.join(tmpdir, "python_server.py")
            shutil.copy(server_file, server_dst)

            result = subprocess.run(
                [sys.executable, "-c", "import python_server"],
                capture_output=True,
                text=True,
                env=env,
                cwd=tmpdir
            )

        assert result.returncode == 1, f"Expected exit code 1, got {result.returncode}. stderr: {result.stderr}"
        assert "Missing required environment variables" in result.stderr

    def test_valid_password_allows_import(self):
        """Verify python_server imports successfully with password set."""
        env = os.environ.copy()
        env["TD_PASSWORD"] = "test_password"

        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        server_dir = os.path.join(project_root, "lineage-api")

        # Just test import, not running the server
        result = subprocess.run(
            [sys.executable, "-c", "import python_server; print('OK')"],
            capture_output=True,
            text=True,
            env=env,
            cwd=server_dir
        )

        assert result.returncode == 0, f"Failed with: {result.stderr}"
        assert "OK" in result.stdout


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
