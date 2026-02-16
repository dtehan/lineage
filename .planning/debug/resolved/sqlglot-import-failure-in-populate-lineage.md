---
status: resolved
trigger: "sqlglot-import-failure-in-populate-lineage"
created: 2026-02-16T00:00:00Z
updated: 2026-02-16T11:14:00Z
---

## Current Focus

hypothesis: CONFIRMED - Path needed 4 parent levels to reach project root, not 3
test: Changed to use .parent.parent.parent.parent to reach project root, then add lineage-api
expecting: populate_lineage.py --dbql will now successfully import dbql_extractor and attempt DBQL extraction
next_action: Run populate_lineage.py --dbql --dry-run to verify fix

## Symptoms

expected: populate_lineage.py should successfully populate OL_COLUMN_LINEAGE table with lineage data extracted from DBQL using sqlglot
actual: Script runs but produces 0 rows in OL_COLUMN_LINEAGE. Error message: "ERROR: Could not import dbql_extractor module. Make sure sqlglot is installed: pip install sqlglot>=25.0.0"
errors:
```
--- Populating OL_COLUMN_LINEAGE from DBQL ---
ERROR: Could not import dbql_extractor module.
Make sure sqlglot is installed: pip install sqlglot>=25.0.0
```

The script otherwise completes successfully:
- OL_DATASET: 951 rows created
- OL_DATASET_FIELD: 21210 rows created
- OL_COLUMN_LINEAGE: 0 rows (should have lineage data)

reproduction:
1. Activate virtual environment: `source .venv/bin/activate`
2. Run: `python scripts/populate/populate_lineage.py --dbql`
3. Observe error during "Populating OL_COLUMN_LINEAGE from DBQL" step

started: Script worked previously, now failing after user ran `pip install sqlglot>=25.0.0`

## Eliminated

## Evidence

- timestamp: 2026-02-16T00:05:00Z
  checked: dbql_extractor.py location and imports
  found: File exists at database/scripts/populate/dbql_extractor.py, imports TeradataSQLParser from lineage-api/utils/sql_parser.py
  implication: Import chain depends on correct sys.path setup

- timestamp: 2026-02-16T00:06:00Z
  checked: sqlglot installation in venv
  found: sqlglot 28.6.0 is installed (>=25.0.0 requirement satisfied)
  implication: sqlglot is not the problem

- timestamp: 2026-02-16T00:07:00Z
  checked: Direct import of sqlglot and sql_parser
  found: Both import successfully when paths are correct
  implication: The issue is path calculation, not missing dependencies

- timestamp: 2026-02-16T00:08:00Z
  checked: Path calculation in dbql_extractor.py line 44
  found: `Path(__file__).parent.parent.parent / "lineage-api"` resolves to relative path "lineage-api" instead of absolute path
  implication: When relative path is added to sys.path, Python cannot find the module

- timestamp: 2026-02-16T00:09:00Z
  checked: Reproduced the path issue
  found: Path calculation produces "lineage-api" (relative), which resolves to "/Users/Daniel.Tehan/Code/lineage/database/scripts/populate/lineage-api" (does not exist)
  implication: Need to resolve() the path to make it absolute before adding to sys.path

## Resolution

root_cause: Path calculation in dbql_extractor.py line 44 used incorrect number of parent levels. The script is at database/scripts/populate/dbql_extractor.py, which requires 4 parent levels to reach project root (not 3). The line `sys.path.insert(0, str(Path(__file__).parent.parent.parent / "lineage-api"))` only went up 3 levels to database/, not to the project root where lineage-api/ actually exists.

fix: Changed to use 4 parent levels: `project_root = Path(__file__).resolve().parent.parent.parent.parent; sys.path.insert(0, str(project_root / "lineage-api"))`

verification: Verified with multiple tests:
1. Direct import test: dbql_extractor module imports successfully
2. Dry-run test: populate_lineage.py --dbql --dry-run completes without import error
3. Full execution: populate_lineage.py --dbql --skip-clear --lineage-only successfully:
   - Imported dbql_extractor (no error)
   - Connected to DBQL
   - Processed 1252 queries (0 failed)
   - Inserted 80 lineage records into OL_COLUMN_LINEAGE
   - Original symptom (0 rows in OL_COLUMN_LINEAGE) is now resolved

files_changed: [database/scripts/populate/dbql_extractor.py]
