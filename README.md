# Teradata Column Lineage

> **⚠️ Work In Progress** - This application is under active development.

A column-level data lineage application for Teradata databases that visualizes data flow between database columns, enabling impact analysis for change management.

## What It Does

- **Asset Browsing**: Navigate database hierarchies (databases → tables → columns)
- **Lineage Visualization**: Interactive graph showing upstream and downstream column dependencies
- **Impact Analysis**: Understand the ripple effects of schema or data changes
- **Search**: Find assets across your Teradata environment

## Documentation

- **[User Guide](docs/user_guide.md)** - Comprehensive usage documentation
- **[Developer Guide](CLAUDE.md)** - Setup, architecture, and development instructions
- **[Specifications](specs/)** - Detailed technical specs and test plans

## Quick Start

See [CLAUDE.md](CLAUDE.md) for setup instructions and common commands.

## Technology Stack

- **Frontend**: React 18 + TypeScript + React Flow
- **Backend**: Go (or Python Flask for testing)
- **Database**: Teradata
- **Graph Layout**: ELKjs

## Project Status

This is an active development project. Features and APIs may change.
