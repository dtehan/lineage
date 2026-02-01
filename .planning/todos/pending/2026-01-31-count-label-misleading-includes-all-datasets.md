---
created: 2026-01-31T17:28
title: Count label misleading - shows "tables" but includes all datasets
area: ui
files:
  - lineage-ui/src/components/domain/AssetBrowser/AssetBrowser.tsx:207
---

## Problem

In the AssetBrowser, the database count label shows the number next to the database name (e.g., "demo_user (344)"). The count represents ALL datasets (tables + views + materialized views), but the context or label may say "tables", which is misleading.

At line 207, the code shows `datasets.length` which includes all three asset types:
- Regular tables
- Views
- Materialized views

Users may interpret "344 tables" as only counting tables, when it actually counts all dataset types.

## Solution

Update the label or tooltip to clarify what's being counted. Options:
1. Change label from "tables" to "datasets" or "objects"
2. Add a breakdown tooltip showing "344 objects (300 tables, 40 views, 4 materialized views)"
3. Show specific counts: "demo_user (300 tables, 44 views)"

Preferred approach: Use "objects" or "datasets" for clarity, or show a breakdown.
