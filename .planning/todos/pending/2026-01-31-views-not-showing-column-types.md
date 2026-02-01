---
created: 2026-01-31T17:21
title: Views not showing their column types
area: ui
files: []
---

## Problem

Database views are not displaying their column type information in the UI. This affects the user's ability to understand the data structure when browsing views compared to tables.

## Solution

TBD - Investigate whether:
1. The data is missing from the backend API response for views
2. The frontend is not rendering type information for view columns
3. The database metadata extraction doesn't include view column types

Check API response for view datasets and compare with table datasets to identify the gap.
