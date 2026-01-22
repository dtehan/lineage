# SQL/Teradata Coding Standards

This document defines the coding standards for the Data Lineage Application database layer. These standards ensure consistency, maintainability, and optimal performance for Teradata SQL code.

---

## Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [Query Formatting and Style](#query-formatting-and-style)
3. [Performance Best Practices](#performance-best-practices)
4. [Primary Index Design](#primary-index-design)
5. [Index Usage Guidelines](#index-usage-guidelines)
6. [Partitioning Conventions](#partitioning-conventions)
7. [Temporary Tables](#temporary-tables)
8. [Teradata Data Types](#teradata-data-types)
9. [Locking and Concurrency](#locking-and-concurrency)
10. [Comment and Documentation Standards](#comment-and-documentation-standards)
11. [Common Anti-Patterns to Avoid](#common-anti-patterns-to-avoid)

---

## Naming Conventions

### Databases

- Use lowercase with underscores for multi-word names
- Use descriptive names that reflect the database purpose
- System databases should be excluded from lineage tracking

```sql
-- Good
CREATE DATABASE lineage FROM DBC AS PERMANENT = 50GB, SPOOL = 10GB;
CREATE DATABASE sales_analytics FROM DBC AS PERMANENT = 100GB;
CREATE DATABASE customer_data FROM DBC AS PERMANENT = 200GB;

-- Avoid
CREATE DATABASE Lineage FROM DBC AS PERMANENT = 50GB;     -- Mixed case
CREATE DATABASE lin FROM DBC AS PERMANENT = 50GB;         -- Too abbreviated
CREATE DATABASE LINEAGE_DB FROM DBC AS PERMANENT = 50GB;  -- SCREAMING_CASE
```

### Tables

Follow the project's table naming conventions (from specification):

| Prefix | Purpose | Example |
|--------|---------|---------|
| `LIN_` | Lineage system tables | `LIN_DATABASE`, `LIN_TABLE`, `LIN_COLUMN` |
| (none) | Business/application tables | `orders`, `customers`, `products` |

```sql
-- Good - Lineage system tables (from project spec)
CREATE MULTISET TABLE lineage.LIN_DATABASE (...);
CREATE MULTISET TABLE lineage.LIN_TABLE (...);
CREATE MULTISET TABLE lineage.LIN_COLUMN (...);
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (...);
CREATE MULTISET TABLE lineage.LIN_TABLE_LINEAGE (...);
CREATE MULTISET TABLE lineage.LIN_TRANSFORMATION (...);
CREATE MULTISET TABLE lineage.LIN_QUERY (...);
CREATE MULTISET TABLE lineage.LIN_WATERMARK (...);

-- Good - Business tables
CREATE MULTISET TABLE sales.orders (...);
CREATE MULTISET TABLE sales.order_items (...);
CREATE MULTISET TABLE customers.customer_profile (...);

-- Avoid
CREATE MULTISET TABLE lineage.columnLineage (...);  -- camelCase
CREATE MULTISET TABLE lineage.COLUMN_LINEAGE (...); -- Missing prefix
CREATE MULTISET TABLE lineage.lin_col_lin (...);    -- Too abbreviated
```

### Columns

- Use lowercase with underscores (snake_case)
- Use descriptive names that reflect the data content
- Use consistent suffixes for common data types

| Suffix | Data Type | Example |
|--------|-----------|---------|
| `_id` | Primary/Foreign keys | `database_id`, `table_id`, `column_id` |
| `_name` | Names/identifiers | `database_name`, `table_name`, `column_name` |
| `_timestamp` | Timestamps | `create_timestamp`, `last_alter_timestamp`, `discovered_at` |
| `_at` | Alternative timestamp suffix | `extracted_at`, `parsed_at`, `first_seen_at` |
| `_count` | Counts | `row_count`, `query_count` |
| `_score` | Calculated scores | `confidence_score` |
| `_type` | Type indicators | `transformation_type`, `column_type`, `relationship_type` |
| `_string` | Text fields | `comment_string`, `query_band` |

```sql
-- Good - Column names from project spec
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    source_column_id VARCHAR(256) NOT NULL,
    source_database VARCHAR(128) NOT NULL,
    source_table VARCHAR(128) NOT NULL,
    source_column VARCHAR(128) NOT NULL,
    target_column_id VARCHAR(256) NOT NULL,
    target_database VARCHAR(128) NOT NULL,
    target_table VARCHAR(128) NOT NULL,
    target_column VARCHAR(128) NOT NULL,
    transformation_type VARCHAR(50),
    transformation_id VARCHAR(64),
    confidence_score DECIMAL(3,2),
    query_id VARCHAR(64),
    discovered_at TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP(0),
    is_active CHAR(1) DEFAULT 'Y',
    PRIMARY KEY (lineage_id)
);

-- Avoid
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    LineageID VARCHAR(64),           -- PascalCase
    srcColId VARCHAR(256),           -- Abbreviated camelCase
    TRANSFORMATION_TYPE VARCHAR(50), -- SCREAMING_CASE
    conf_scr DECIMAL(3,2),          -- Too abbreviated
);
```

### Indexes

- Prefix with `idx_`
- Include table name (abbreviated if needed)
- Include column name(s)
- Use underscores between parts

```sql
-- Good - Index naming from project spec
CREATE INDEX idx_lin_database_name ON lineage.LIN_DATABASE (database_name);
CREATE INDEX idx_lin_table_db ON lineage.LIN_TABLE (database_name);
CREATE INDEX idx_lin_table_name ON lineage.LIN_TABLE (table_name);
CREATE INDEX idx_lin_column_db_tbl ON lineage.LIN_COLUMN (database_name, table_name);
CREATE INDEX idx_lin_column_name ON lineage.LIN_COLUMN (column_name);
CREATE INDEX idx_lin_col_lineage_source ON lineage.LIN_COLUMN_LINEAGE (source_column_id);
CREATE INDEX idx_lin_col_lineage_target ON lineage.LIN_COLUMN_LINEAGE (target_column_id);
CREATE INDEX idx_lin_col_lineage_src_db_tbl ON lineage.LIN_COLUMN_LINEAGE (source_database, source_table);
CREATE INDEX idx_lin_col_lineage_tgt_db_tbl ON lineage.LIN_COLUMN_LINEAGE (target_database, target_table);

-- Avoid
CREATE INDEX database_name_index ON lineage.LIN_DATABASE (database_name);  -- Verbose
CREATE INDEX idx1 ON lineage.LIN_DATABASE (database_name);                 -- Non-descriptive
CREATE INDEX IDX_LIN_DATABASE_NAME ON lineage.LIN_DATABASE (database_name); -- SCREAMING_CASE
```

### Constraints

- Primary keys: `pk_<table_name>` or inline with column definition
- Foreign keys: `fk_<table>_<referenced_table>`
- Unique constraints: `uq_<table>_<column(s)>`
- Check constraints: `ck_<table>_<column>`

```sql
-- Good
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    -- ... columns ...
    PRIMARY KEY (lineage_id)  -- Inline PK definition
);

-- Good - Named constraints
ALTER TABLE lineage.LIN_COLUMN_LINEAGE
ADD CONSTRAINT fk_lineage_source_column
FOREIGN KEY (source_column_id) REFERENCES lineage.LIN_COLUMN (column_id);

ALTER TABLE lineage.LIN_COLUMN_LINEAGE
ADD CONSTRAINT ck_lineage_is_active
CHECK (is_active IN ('Y', 'N'));
```

---

## Query Formatting and Style

### General Formatting Rules

- Use UPPERCASE for SQL keywords
- Use lowercase for identifiers (tables, columns)
- Use 4-space indentation (not tabs)
- One clause per line for readability
- Align related elements vertically when it improves readability

### SELECT Statements

```sql
-- Good - Well-formatted SELECT
SELECT
    source_column_id,
    source_database,
    source_table,
    source_column,
    target_column_id,
    target_database,
    target_table,
    target_column,
    transformation_type,
    confidence_score,
    1 AS depth
FROM lineage.LIN_COLUMN_LINEAGE
WHERE target_column_id = :column_id
  AND is_active = 'Y'
ORDER BY depth, source_database, source_table, source_column;

-- Good - Column aliases
SELECT
    TRIM(DatabaseName) AS database_id,
    TRIM(DatabaseName) AS database_name,
    TRIM(OwnerName) AS owner_name,
    CreateTimeStamp AS create_timestamp,
    LastAlterTimeStamp AS last_alter_timestamp,
    CommentString AS comment_string
FROM DBC.DatabasesV
WHERE DatabaseName NOT IN ('DBC', 'SYSLIB', 'SystemFe');

-- Avoid - Hard to read
SELECT source_column_id, source_database, source_table, source_column, target_column_id, target_database, target_table, target_column FROM lineage.LIN_COLUMN_LINEAGE WHERE target_column_id = :column_id AND is_active = 'Y';
```

### INSERT Statements

```sql
-- Good - Explicit column list
INSERT INTO lineage.LIN_DATABASE (
    database_id,
    database_name,
    owner_name,
    create_timestamp,
    last_alter_timestamp,
    comment_string
)
SELECT
    TRIM(DatabaseName) AS database_id,
    TRIM(DatabaseName) AS database_name,
    TRIM(OwnerName) AS owner_name,
    CreateTimeStamp,
    LastAlterTimeStamp,
    CommentString
FROM DBC.DatabasesV
WHERE DatabaseName NOT IN ('DBC', 'SYSLIB', 'SystemFe', 'SYSUDTLIB');

-- Avoid - Implicit column list (fragile)
INSERT INTO lineage.LIN_DATABASE
SELECT * FROM DBC.DatabasesV;
```

### JOIN Statements

```sql
-- Good - Clear JOIN syntax
SELECT
    src.ObjectDatabaseName || '.' || src.ObjectTableName || '->' ||
    tgt.ObjectDatabaseName || '.' || tgt.ObjectTableName AS lineage_id,
    src.ObjectDatabaseName || '.' || src.ObjectTableName AS source_table_id,
    src.ObjectDatabaseName AS source_database,
    src.ObjectTableName AS source_table,
    tgt.ObjectDatabaseName || '.' || tgt.ObjectTableName AS target_table_id,
    tgt.ObjectDatabaseName AS target_database,
    tgt.ObjectTableName AS target_table,
    CASE
        WHEN q.StatementType = 'Insert' THEN 'INSERT_SELECT'
        WHEN q.StatementType = 'Merge Into' THEN 'MERGE'
        WHEN q.StatementType = 'Create Table' THEN 'CTAS'
        ELSE 'OTHER'
    END AS relationship_type
FROM DBC.DBQLObjTbl src
JOIN DBC.DBQLObjTbl tgt
    ON src.QueryID = tgt.QueryID
    AND src.ProcID = tgt.ProcID
JOIN DBC.DBQLogTbl q
    ON src.QueryID = q.QueryID
    AND src.ProcID = q.ProcID
WHERE src.TypeOfUse IN (1, 2)
  AND tgt.TypeOfUse IN (3, 4)
  AND src.ObjectType = 'Tab'
  AND tgt.ObjectType = 'Tab';

-- Good - ON clause alignment
FROM table_a a
JOIN table_b b
    ON a.id = b.a_id
    AND a.type = b.type
LEFT JOIN table_c c
    ON b.id = c.b_id;
```

### Recursive CTEs (Project Pattern)

Follow the project's recursive CTE pattern for lineage traversal:

```sql
-- Good - Upstream lineage query from project spec
WITH RECURSIVE upstream_lineage AS (
    -- Base case: direct sources of the target column
    SELECT
        source_column_id,
        source_database,
        source_table,
        source_column,
        target_column_id,
        target_database,
        target_table,
        target_column,
        transformation_type,
        confidence_score,
        1 AS depth,
        target_column_id || '->' || source_column_id AS path
    FROM lineage.LIN_COLUMN_LINEAGE
    WHERE target_column_id = :column_id
      AND is_active = 'Y'

    UNION ALL

    -- Recursive case: sources of sources
    SELECT
        cl.source_column_id,
        cl.source_database,
        cl.source_table,
        cl.source_column,
        cl.target_column_id,
        cl.target_database,
        cl.target_table,
        cl.target_column,
        cl.transformation_type,
        cl.confidence_score,
        ul.depth + 1,
        ul.path || '->' || cl.source_column_id
    FROM lineage.LIN_COLUMN_LINEAGE cl
    JOIN upstream_lineage ul
        ON cl.target_column_id = ul.source_column_id
    WHERE cl.is_active = 'Y'
      AND ul.depth < :max_depth
      AND POSITION(cl.source_column_id IN ul.path) = 0  -- Prevent cycles
)
SELECT DISTINCT
    source_column_id,
    source_database,
    source_table,
    source_column,
    target_column_id,
    target_database,
    target_table,
    target_column,
    transformation_type,
    confidence_score,
    depth
FROM upstream_lineage
ORDER BY depth, source_database, source_table, source_column;
```

### CASE Expressions

```sql
-- Good - Formatted CASE
SELECT
    CASE
        WHEN q.StatementType = 'Insert' THEN 'INSERT_SELECT'
        WHEN q.StatementType = 'Merge Into' THEN 'MERGE'
        WHEN q.StatementType = 'Create Table' THEN 'CTAS'
        ELSE 'OTHER'
    END AS relationship_type

-- Good - Simple CASE on single line if short
SELECT CASE table_kind WHEN 'T' THEN 'Table' WHEN 'V' THEN 'View' ELSE 'Other' END AS table_type
```

---

## Performance Best Practices

### Use MULTISET Tables

Always use MULTISET tables unless duplicates must be prevented at the storage level:

```sql
-- Good - MULTISET for performance
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    -- ...
    PRIMARY KEY (lineage_id)
);

-- Only use SET when duplicates must be prevented and no PK exists
CREATE SET TABLE lineage.LIN_UNIQUE_CONSTRAINTS (
    -- ...
);
```

### Collect Statistics

Collect statistics on columns used in JOINs, WHERE clauses, and GROUP BY:

```sql
-- Collect statistics on key columns
COLLECT STATISTICS ON lineage.LIN_COLUMN_LINEAGE
    COLUMN source_column_id,
    COLUMN target_column_id,
    COLUMN (source_database, source_table),
    COLUMN (target_database, target_table),
    COLUMN is_active,
    COLUMN discovered_at;

COLLECT STATISTICS ON lineage.LIN_DATABASE
    COLUMN database_id,
    COLUMN database_name;

COLLECT STATISTICS ON lineage.LIN_TABLE
    COLUMN table_id,
    COLUMN database_name,
    COLUMN table_name;
```

### Optimize JOIN Order

Place smaller tables first in JOINs when possible:

```sql
-- Good - Smaller filtered result first
SELECT
    cl.lineage_id,
    cl.source_column_id,
    c.column_type
FROM lineage.LIN_COLUMN_LINEAGE cl  -- Filtered by WHERE
JOIN lineage.LIN_COLUMN c
    ON cl.source_column_id = c.column_id
WHERE cl.target_column_id = :column_id
  AND cl.is_active = 'Y';
```

### Use EXISTS Instead of IN for Large Subqueries

```sql
-- Good - EXISTS for correlated check
SELECT *
FROM lineage.LIN_COLUMN c
WHERE EXISTS (
    SELECT 1
    FROM lineage.LIN_COLUMN_LINEAGE cl
    WHERE cl.source_column_id = c.column_id
      AND cl.is_active = 'Y'
);

-- Avoid - IN with large subquery
SELECT *
FROM lineage.LIN_COLUMN c
WHERE c.column_id IN (
    SELECT source_column_id
    FROM lineage.LIN_COLUMN_LINEAGE
    WHERE is_active = 'Y'
);
```

### Limit Recursive CTE Depth

Always limit recursion depth to prevent runaway queries:

```sql
-- Good - Max depth limit
WITH RECURSIVE upstream_lineage AS (
    SELECT ..., 1 AS depth, ...
    FROM lineage.LIN_COLUMN_LINEAGE
    WHERE target_column_id = :column_id

    UNION ALL

    SELECT ..., ul.depth + 1, ...
    FROM lineage.LIN_COLUMN_LINEAGE cl
    JOIN upstream_lineage ul ON ...
    WHERE ul.depth < :max_depth  -- CRITICAL: Always include depth limit
      AND POSITION(...) = 0      -- CRITICAL: Prevent cycles
)
SELECT * FROM upstream_lineage;
```

### Use QUALIFY for Row Limiting

```sql
-- Good - QUALIFY for top N per group
SELECT
    database_name,
    table_name,
    column_name,
    row_count
FROM lineage.LIN_COLUMN
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY database_name
    ORDER BY row_count DESC
) <= 10;
```

### Batch Large Operations

For large INSERT/UPDATE/DELETE operations, process in batches:

```sql
-- Good - Batch processing with watermark
INSERT INTO lineage.LIN_TABLE_LINEAGE (...)
SELECT ...
FROM DBC.DBQLObjTbl src
JOIN DBC.DBQLObjTbl tgt ON ...
JOIN DBC.DBQLogTbl q ON ...
WHERE q.StartTime > (
    SELECT COALESCE(last_extracted_at, DATE '2020-01-01')
    FROM lineage.LIN_WATERMARK
    WHERE source_name = 'DBQL_LINEAGE'
)
  AND q.StartTime <= CURRENT_TIMESTAMP - INTERVAL '1' HOUR;  -- Leave buffer

-- Update watermark after successful insert
UPDATE lineage.LIN_WATERMARK
SET last_extracted_at = CURRENT_TIMESTAMP - INTERVAL '1' HOUR,
    updated_at = CURRENT_TIMESTAMP
WHERE source_name = 'DBQL_LINEAGE';
```

### AMP Architecture Awareness

Teradata distributes data across AMPs (Access Module Processors) based on the Primary Index hash. Understanding this affects query performance:

```sql
-- Good - Query uses PI for single-AMP access
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE lineage_id = 'sales.orders.amount->reports.daily_sales.revenue';

-- Good - Equality on PI columns enables efficient joins
SELECT cl.*, c.column_type
FROM lineage.LIN_COLUMN_LINEAGE cl
JOIN lineage.LIN_COLUMN c
    ON cl.source_column_id = c.column_id  -- PI-to-PI join
WHERE cl.is_active = 'Y';

-- Be aware - Full table scan hits all AMPs
SELECT COUNT(*)
FROM lineage.LIN_COLUMN_LINEAGE
WHERE transformation_type = 'AGGREGATION';  -- Non-PI column

-- Be aware - Redistributing large tables is expensive
SELECT *
FROM large_table_a a
JOIN large_table_b b
    ON a.non_pi_column = b.non_pi_column;  -- Forces redistribution
```

**AMP considerations:**
- Queries on Primary Index columns access a single AMP (fastest)
- Queries on non-PI columns require all-AMP scans
- JOINs on non-PI columns may require data redistribution (spool)
- Aggregations may require redistribution to a single AMP
- Monitor spool usage for queries that redistribute large datasets

---

## Primary Index Design

The Primary Index (PI) is Teradata's most critical design decision. It determines how data is distributed across AMPs and directly impacts query performance.

### Choosing a Primary Index

Select PI columns based on:
1. **Uniqueness** - High cardinality distributes data evenly
2. **Access patterns** - Columns frequently used in WHERE clauses and JOINs
3. **Join compatibility** - Tables frequently joined should share PI columns

```sql
-- Good - Unique PI ensures even distribution
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    source_column_id VARCHAR(256) NOT NULL,
    target_column_id VARCHAR(256) NOT NULL,
    -- ...
    PRIMARY KEY (lineage_id)  -- UPI: unique, used in lookups
);

-- Good - PI matches common join pattern
CREATE MULTISET TABLE lineage.LIN_COLUMN (
    column_id VARCHAR(256) NOT NULL,
    database_name VARCHAR(128) NOT NULL,
    table_name VARCHAR(128) NOT NULL,
    column_name VARCHAR(128) NOT NULL,
    -- ...
    PRIMARY KEY (column_id)  -- Matches FK in LIN_COLUMN_LINEAGE
);

-- Consider - NUPI when duplicates are acceptable for join optimization
CREATE MULTISET TABLE lineage.LIN_QUERY_COLUMN (
    query_id VARCHAR(64) NOT NULL,
    column_id VARCHAR(256) NOT NULL,
    usage_type VARCHAR(20),
    -- ...
)
PRIMARY INDEX (query_id);  -- NUPI: enables single-AMP access for query lookups
```

### Unique vs Non-Unique Primary Index

| Type | Abbreviation | Use Case |
|------|--------------|----------|
| Unique Primary Index | UPI | Guarantees even distribution, best for lookup tables |
| Non-Unique Primary Index | NUPI | Allows duplicates, useful when PI matches access pattern |

```sql
-- UPI - Best for master/lookup tables
CREATE MULTISET TABLE lineage.LIN_DATABASE (
    database_id VARCHAR(128) NOT NULL,
    database_name VARCHAR(128) NOT NULL,
    -- ...
    PRIMARY KEY (database_id)  -- UPI
);

-- NUPI - Useful for fact tables with repeated dimension values
CREATE MULTISET TABLE lineage.LIN_AUDIT_LOG (
    log_id VARCHAR(64) NOT NULL,
    user_name VARCHAR(128) NOT NULL,
    action_type VARCHAR(50),
    action_timestamp TIMESTAMP(0),
    -- ...
    UNIQUE (log_id)  -- Uniqueness enforced via USI
)
PRIMARY INDEX (user_name);  -- NUPI: fast access for user-based queries
```

### Composite Primary Index

Use composite PIs when:
- Single column doesn't provide enough uniqueness
- Access patterns commonly filter on multiple columns together

```sql
-- Good - Composite PI for common access pattern
CREATE MULTISET TABLE lineage.LIN_TABLE_STATS (
    database_name VARCHAR(128) NOT NULL,
    table_name VARCHAR(128) NOT NULL,
    stat_date DATE NOT NULL,
    row_count BIGINT,
    size_bytes BIGINT,
    -- ...
)
PRIMARY INDEX (database_name, table_name);  -- Composite PI

-- Query benefits from composite PI
SELECT *
FROM lineage.LIN_TABLE_STATS
WHERE database_name = 'sales'
  AND table_name = 'orders';  -- Single-AMP access
```

### Avoiding Skewed Distribution

Poor PI selection causes data skew, where some AMPs hold disproportionately more data:

```sql
-- Bad - Low cardinality causes skew
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    -- ...
)
PRIMARY INDEX (is_active);  -- Only 'Y' or 'N' - extreme skew!

-- Bad - Nullable column causes NULL skew
CREATE MULTISET TABLE lineage.LIN_TRANSFORMATION (
    -- ...
)
PRIMARY INDEX (parent_transform_id);  -- Many NULLs go to same AMP

-- Good - High cardinality, non-nullable
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    -- ...
    PRIMARY KEY (lineage_id)  -- Unique, even distribution
);
```

**Detecting skew:**

```sql
-- Check row distribution across AMPs
SELECT
    HASHAMP(HASHBUCKET(HASHROW(lineage_id))) AS amp_number,
    COUNT(*) AS row_count
FROM lineage.LIN_COLUMN_LINEAGE
GROUP BY 1
ORDER BY 2 DESC;

-- Skew ratio (ideally close to 1.0)
SELECT
    MAX(row_count) * 1.0 / AVG(row_count) AS skew_factor
FROM (
    SELECT
        HASHAMP(HASHBUCKET(HASHROW(lineage_id))) AS amp_number,
        COUNT(*) AS row_count
    FROM lineage.LIN_COLUMN_LINEAGE
    GROUP BY 1
) amp_counts;
```

---

## Index Usage Guidelines

### When to Create Indexes

Create indexes on columns that are:
- Used in JOIN conditions
- Used in WHERE clause filters (especially equality conditions)
- Used in ORDER BY clauses for large result sets
- Foreign key columns

```sql
-- Primary lookup indexes from project spec
CREATE INDEX idx_lin_col_lineage_source ON lineage.LIN_COLUMN_LINEAGE (source_column_id);
CREATE INDEX idx_lin_col_lineage_target ON lineage.LIN_COLUMN_LINEAGE (target_column_id);

-- Composite indexes for common query patterns
CREATE INDEX idx_lin_col_lineage_src_db_tbl ON lineage.LIN_COLUMN_LINEAGE (source_database, source_table);
CREATE INDEX idx_lin_col_lineage_tgt_db_tbl ON lineage.LIN_COLUMN_LINEAGE (target_database, target_table);

-- Time-based filtering
CREATE INDEX idx_lin_query_time ON lineage.LIN_QUERY (start_time);
```

### Index Column Order

For composite indexes, order columns by:
1. Equality conditions first
2. Range conditions second
3. Higher cardinality columns first (when all equality)

```sql
-- Good - is_active (equality, low cardinality) then source_column_id (equality, high cardinality)
-- Note: In Teradata, column order in secondary indexes is less critical than in other databases
CREATE INDEX idx_lin_active_source ON lineage.LIN_COLUMN_LINEAGE (is_active, source_column_id);
```

### Avoid Over-Indexing

- Each index adds overhead for INSERT/UPDATE/DELETE operations
- Monitor index usage and remove unused indexes
- Teradata's optimizer may not use all available indexes

```sql
-- Check if index is being used (query DBQL)
SELECT
    ObjectDatabaseName,
    ObjectTableName,
    ObjectColumnName,
    COUNT(*) AS usage_count
FROM DBC.DBQLObjTbl
WHERE ObjectType = 'Idx'
  AND CollectTimeStamp > CURRENT_TIMESTAMP - INTERVAL '30' DAY
GROUP BY 1, 2, 3
ORDER BY 4 DESC;
```

---

## Partitioning Conventions

### Range Partitioning for Time-Series Data

Partition tables with time-based data by date ranges:

```sql
-- Good - Monthly partitions for lineage data (from project spec)
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    -- ... columns ...
    discovered_at TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lineage_id)
)
PARTITION BY RANGE_N(
    discovered_at BETWEEN DATE '2020-01-01' AND DATE '2030-12-31'
    EACH INTERVAL '1' MONTH
);

-- Good - Monthly partitions for query log
CREATE MULTISET TABLE lineage.LIN_QUERY (
    query_id VARCHAR(64) NOT NULL,
    -- ... columns ...
    start_time TIMESTAMP(0),
    PRIMARY KEY (query_id)
)
PARTITION BY RANGE_N(
    start_time BETWEEN DATE '2020-01-01' AND DATE '2030-12-31'
    EACH INTERVAL '1' MONTH
);
```

### Partition Elimination

Write queries to take advantage of partition elimination:

```sql
-- Good - Partition elimination will occur
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at >= DATE '2024-01-01'
  AND discovered_at < DATE '2024-02-01';

-- Avoid - Partition elimination may not occur
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE EXTRACT(YEAR FROM discovered_at) = 2024
  AND EXTRACT(MONTH FROM discovered_at) = 1;
```

### Partition Maintenance

Plan for partition management:

```sql
-- Add new partitions before they're needed
ALTER TABLE lineage.LIN_COLUMN_LINEAGE
MODIFY PRIMARY INDEX
PARTITION BY RANGE_N(
    discovered_at BETWEEN DATE '2020-01-01' AND DATE '2035-12-31'
    EACH INTERVAL '1' MONTH
);

-- Archive old partitions
CREATE TABLE lineage.LIN_COLUMN_LINEAGE_ARCHIVE AS
SELECT * FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at < DATE '2022-01-01'
WITH DATA;

DELETE FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at < DATE '2022-01-01';
```

---

## Temporary Tables

Teradata provides several types of temporary tables for intermediate processing. Choose the appropriate type based on scope and persistence requirements.

### Volatile Tables

Volatile tables exist only for the duration of the session. They are stored in spool space and are automatically dropped when the session ends.

```sql
-- Good - Volatile table for session-scoped intermediate results
CREATE VOLATILE TABLE vt_upstream_columns (
    column_id VARCHAR(256),
    database_name VARCHAR(128),
    table_name VARCHAR(128),
    column_name VARCHAR(128),
    depth INTEGER
)
PRIMARY INDEX (column_id)
ON COMMIT PRESERVE ROWS;

-- Populate with intermediate results
INSERT INTO vt_upstream_columns
SELECT DISTINCT
    source_column_id,
    source_database,
    source_table,
    source_column,
    depth
FROM upstream_lineage_cte;

-- Use in subsequent queries
SELECT c.*, v.depth
FROM lineage.LIN_COLUMN c
JOIN vt_upstream_columns v
    ON c.column_id = v.column_id;

-- Automatically dropped at session end (no explicit DROP needed)
```

**Volatile table guidelines:**
- Use `ON COMMIT PRESERVE ROWS` to retain data after transaction commit
- Use `ON COMMIT DELETE ROWS` for transaction-scoped data
- Define a Primary Index for join performance
- No statistics collection - optimizer uses heuristics
- Cannot be referenced across sessions

```sql
-- Good - Transaction-scoped volatile table
CREATE VOLATILE TABLE vt_batch_ids (
    batch_id VARCHAR(64)
)
PRIMARY INDEX (batch_id)
ON COMMIT DELETE ROWS;  -- Cleared after each COMMIT

BEGIN TRANSACTION;
INSERT INTO vt_batch_ids VALUES ('batch_001');
INSERT INTO vt_batch_ids VALUES ('batch_002');
-- Use vt_batch_ids in processing...
COMMIT;  -- vt_batch_ids is now empty
```

### Global Temporary Tables

Global temporary tables have a persistent definition but session-specific data. The table structure persists across sessions, but each session sees only its own data.

```sql
-- Create definition once (persists across sessions)
CREATE GLOBAL TEMPORARY TABLE gtt_lineage_work (
    session_id INTEGER,
    lineage_id VARCHAR(64),
    source_column_id VARCHAR(256),
    target_column_id VARCHAR(256),
    processing_status VARCHAR(20)
)
PRIMARY INDEX (lineage_id)
ON COMMIT PRESERVE ROWS;

-- Each session populates its own isolated data
INSERT INTO gtt_lineage_work
SELECT SESSION, lineage_id, source_column_id, target_column_id, 'PENDING'
FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at > CURRENT_DATE - 1;

-- Session A cannot see Session B's data
SELECT * FROM gtt_lineage_work;  -- Only this session's rows
```

**Global temporary table guidelines:**
- Definition persists; data is session-specific
- Useful for standardized intermediate processing across multiple procedures
- Can collect statistics on the definition (not data)
- Requires CREATE privilege on database

### Derived Tables (Inline Views)

For simple intermediate results, use derived tables instead of creating temporary tables:

```sql
-- Good - Derived table for one-time use
SELECT
    main.lineage_id,
    main.source_column_id,
    counts.lineage_count
FROM lineage.LIN_COLUMN_LINEAGE main
JOIN (
    SELECT
        source_column_id,
        COUNT(*) AS lineage_count
    FROM lineage.LIN_COLUMN_LINEAGE
    WHERE is_active = 'Y'
    GROUP BY source_column_id
) counts
    ON main.source_column_id = counts.source_column_id
WHERE main.is_active = 'Y';
```

### Choosing the Right Temporary Table Type

| Type | Scope | Data Persistence | Use Case |
|------|-------|------------------|----------|
| Volatile | Session | Until session ends | Ad-hoc processing, complex multi-step queries |
| Global Temporary | Definition: Permanent; Data: Session | Until session ends | Standardized ETL patterns, shared procedure logic |
| Derived Table | Statement | Statement only | Simple aggregations, one-time transformations |

---

## Teradata Data Types

Use Teradata-appropriate data types for optimal storage and performance.

### Character Data Types

```sql
-- VARCHAR - Variable length, use for most string columns
column_name VARCHAR(128) CHARACTER SET UNICODE

-- CHAR - Fixed length, use only when length is truly fixed
status_code CHAR(1) CHARACTER SET LATIN  -- 'Y' or 'N'

-- CLOB - Large text, use for SQL statements, comments
query_text CLOB(1M) CHARACTER SET UNICODE
```

**Character set guidelines:**
- Use `UNICODE` for international character support
- Use `LATIN` only for known ASCII-only data (slightly more efficient)
- Specify character set explicitly for clarity

```sql
-- Good - Explicit character sets
CREATE MULTISET TABLE lineage.LIN_QUERY (
    query_id VARCHAR(64) CHARACTER SET LATIN NOT NULL,      -- IDs are ASCII
    query_text CLOB(2M) CHARACTER SET UNICODE,              -- SQL may have Unicode
    user_name VARCHAR(128) CHARACTER SET UNICODE,           -- Names may have Unicode
    PRIMARY KEY (query_id)
);
```

### Numeric Data Types

```sql
-- INTEGER types
row_count BIGINT           -- Large counts (up to 9.2 quintillion)
depth INTEGER              -- Standard integers (-2B to 2B)
position_number SMALLINT   -- Small integers (-32K to 32K)
flags BYTEINT              -- Tiny integers (-128 to 127)

-- DECIMAL - Exact precision for scores, percentages
confidence_score DECIMAL(3,2)   -- 0.00 to 9.99
percentage DECIMAL(5,2)         -- 0.00 to 999.99

-- FLOAT - Approximate, use for scientific data only
measurement FLOAT                -- Avoid for business data
```

**Numeric guidelines:**
- Use `DECIMAL` for exact values (money, percentages, scores)
- Use appropriate INTEGER size to save space
- Avoid `FLOAT` for business calculations due to precision issues

### Date and Time Data Types

```sql
-- DATE - Calendar date only
stat_date DATE

-- TIME - Time of day only
scheduled_time TIME(0)

-- TIMESTAMP - Date and time combined
discovered_at TIMESTAMP(0)         -- Second precision
created_at TIMESTAMP(6)            -- Microsecond precision

-- TIMESTAMP WITH TIME ZONE - For global applications
event_time TIMESTAMP(0) WITH TIME ZONE

-- INTERVAL - Duration
retention_period INTERVAL DAY(4)   -- Up to 9999 days
processing_time INTERVAL SECOND(2,6)  -- Seconds with microseconds
```

**Timestamp precision:**
- `TIMESTAMP(0)` - Second precision, sufficient for most audit trails
- `TIMESTAMP(6)` - Microsecond precision, for high-resolution timing

```sql
-- Good - Appropriate precision for use case
CREATE MULTISET TABLE lineage.LIN_COLUMN_LINEAGE (
    lineage_id VARCHAR(64) NOT NULL,
    -- ... other columns ...
    discovered_at TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,  -- Second precision OK
    last_seen_at TIMESTAMP(0),
    PRIMARY KEY (lineage_id)
);
```

### PERIOD Data Type

Teradata's `PERIOD` type represents a span of time with built-in temporal logic:

```sql
-- PERIOD - Time span with automatic temporal semantics
CREATE MULTISET TABLE lineage.LIN_COLUMN_VERSION (
    column_id VARCHAR(256) NOT NULL,
    version_id INTEGER NOT NULL,
    column_type VARCHAR(128),
    valid_period PERIOD(DATE) NOT NULL AS VALIDTIME,  -- Temporal validity
    PRIMARY KEY (column_id, version_id)
);

-- Query for currently valid records
SELECT * FROM lineage.LIN_COLUMN_VERSION
WHERE valid_period CONTAINS CURRENT_DATE;

-- Query for records valid at a specific time
SELECT * FROM lineage.LIN_COLUMN_VERSION
WHERE valid_period CONTAINS DATE '2024-01-15';

-- PERIOD overlap detection
SELECT *
FROM lineage.LIN_COLUMN_VERSION a
JOIN lineage.LIN_COLUMN_VERSION b
    ON a.column_id = b.column_id
    AND a.valid_period OVERLAPS b.valid_period
    AND a.version_id <> b.version_id;
```

### JSON Data Type

For semi-structured data storage:

```sql
-- JSON - Semi-structured data
CREATE MULTISET TABLE lineage.LIN_TRANSFORMATION (
    transformation_id VARCHAR(64) NOT NULL,
    transformation_type VARCHAR(50),
    parameters JSON(1000),  -- Flexible parameter storage
    PRIMARY KEY (transformation_id)
);

-- Insert JSON data
INSERT INTO lineage.LIN_TRANSFORMATION (transformation_id, transformation_type, parameters)
VALUES (
    'tf_001',
    'AGGREGATION',
    '{"function": "SUM", "distinct": false, "filter": null}'
);

-- Query JSON fields
SELECT
    transformation_id,
    parameters.function AS agg_function,
    parameters.distinct AS is_distinct
FROM lineage.LIN_TRANSFORMATION
WHERE transformation_type = 'AGGREGATION';
```

### Data Type Quick Reference

| Category | Type | Use Case |
|----------|------|----------|
| String | `VARCHAR(n)` | Most string columns |
| String | `CHAR(n)` | Fixed-length codes only |
| String | `CLOB` | Large text (SQL, documents) |
| Integer | `BIGINT` | Large counts, IDs |
| Integer | `INTEGER` | Standard integers |
| Decimal | `DECIMAL(p,s)` | Exact values, scores |
| Date/Time | `DATE` | Calendar dates |
| Date/Time | `TIMESTAMP(n)` | Date+time with precision |
| Temporal | `PERIOD(DATE/TIMESTAMP)` | Time spans, versioning |
| Semi-structured | `JSON` | Flexible schemas |

---

## Locking and Concurrency

Teradata's locking mechanism controls concurrent access to database objects. Understanding and using appropriate locking improves both performance and data consistency.

### Lock Levels

Teradata supports multiple lock levels (from least to most restrictive):

| Lock Level | Description | Use Case |
|------------|-------------|----------|
| ACCESS | Read-only, dirty reads allowed | Reports on volatile data |
| READ | Shared read lock | Consistent reads |
| WRITE | Exclusive for modifications | INSERT/UPDATE/DELETE |
| EXCLUSIVE | Full table lock | DDL operations |

### LOCKING Modifier

Use the `LOCKING` modifier to override default lock behavior:

```sql
-- Good - ACCESS lock for reporting (allows dirty reads, no blocking)
LOCKING TABLE lineage.LIN_COLUMN_LINEAGE FOR ACCESS
SELECT
    source_database,
    COUNT(*) AS lineage_count
FROM lineage.LIN_COLUMN_LINEAGE
WHERE is_active = 'Y'
GROUP BY source_database;

-- Good - ACCESS lock for large scans that don't need consistency
LOCKING ROW FOR ACCESS
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at > CURRENT_DATE - 30;

-- Good - READ lock when consistency matters
LOCKING TABLE lineage.LIN_COLUMN_LINEAGE FOR READ
SELECT COUNT(*) FROM lineage.LIN_COLUMN_LINEAGE
WHERE is_active = 'Y';
```

### Lock Granularity

Specify lock granularity to balance concurrency and overhead:

```sql
-- ROW-level locking - Maximum concurrency, more overhead
LOCKING ROW FOR ACCESS
SELECT * FROM lineage.LIN_COLUMN_LINEAGE WHERE lineage_id = 'xyz';

-- TABLE-level locking - Less overhead, blocks other sessions
LOCKING TABLE lineage.LIN_COLUMN_LINEAGE FOR READ
SELECT * FROM lineage.LIN_COLUMN_LINEAGE;

-- DATABASE-level locking - Use sparingly
LOCKING DATABASE lineage FOR READ
SELECT d.database_name, COUNT(t.table_id)
FROM lineage.LIN_DATABASE d
LEFT JOIN lineage.LIN_TABLE t ON d.database_name = t.database_name
GROUP BY d.database_name;
```

### When to Use ACCESS Locks

Use `FOR ACCESS` when:
- Running reports where slight inconsistency is acceptable
- Querying large tables that are frequently updated
- Avoiding blocking on busy tables
- Dashboard/monitoring queries

```sql
-- Good - Dashboard query with ACCESS lock
LOCKING ROW FOR ACCESS
SELECT
    database_name,
    COUNT(DISTINCT table_name) AS table_count,
    COUNT(*) AS column_count,
    MAX(last_alter_timestamp) AS last_modified
FROM lineage.LIN_COLUMN
GROUP BY database_name
ORDER BY column_count DESC;

-- Good - Lineage traversal with ACCESS lock (read-heavy operation)
LOCKING TABLE lineage.LIN_COLUMN_LINEAGE FOR ACCESS
WITH RECURSIVE upstream_lineage AS (
    SELECT source_column_id, target_column_id, 1 AS depth
    FROM lineage.LIN_COLUMN_LINEAGE
    WHERE target_column_id = :column_id AND is_active = 'Y'
    UNION ALL
    SELECT cl.source_column_id, cl.target_column_id, ul.depth + 1
    FROM lineage.LIN_COLUMN_LINEAGE cl
    JOIN upstream_lineage ul ON cl.target_column_id = ul.source_column_id
    WHERE cl.is_active = 'Y' AND ul.depth < 10
)
SELECT * FROM upstream_lineage;
```

### Avoiding Lock Contention

```sql
-- Bad - Long-running transaction holds locks
BEGIN TRANSACTION;
UPDATE lineage.LIN_COLUMN_LINEAGE SET last_seen_at = CURRENT_TIMESTAMP
WHERE is_active = 'Y';  -- Updates millions of rows
-- ... other processing ...
COMMIT;  -- Locks held for entire duration

-- Good - Batch processing with smaller transactions
-- Process in chunks to release locks periodically
UPDATE lineage.LIN_COLUMN_LINEAGE
SET last_seen_at = CURRENT_TIMESTAMP
WHERE is_active = 'Y'
  AND source_database = :current_database;  -- Process one database at a time

-- Good - Use ACCESS lock for reads during batch updates
LOCKING ROW FOR ACCESS
SELECT COUNT(*) FROM lineage.LIN_COLUMN_LINEAGE
WHERE is_active = 'Y' AND last_seen_at < CURRENT_DATE - 7;
```

### Deadlock Prevention

Teradata automatically detects and resolves deadlocks, but prevention is better:

```sql
-- Good - Consistent table access order prevents deadlocks
-- Always access tables in the same order across all procedures
LOCKING TABLE lineage.LIN_DATABASE FOR READ,
        TABLE lineage.LIN_TABLE FOR READ,
        TABLE lineage.LIN_COLUMN FOR READ
SELECT d.database_name, t.table_name, c.column_name
FROM lineage.LIN_DATABASE d
JOIN lineage.LIN_TABLE t ON d.database_name = t.database_name
JOIN lineage.LIN_COLUMN c ON t.table_id = c.table_id;

-- Good - Short transactions reduce deadlock window
BEGIN TRANSACTION;
-- Do minimal work inside transaction
INSERT INTO lineage.LIN_COLUMN_LINEAGE VALUES (...);
COMMIT;  -- Release locks quickly
```

### Locking Best Practices Summary

| Scenario | Recommended Lock |
|----------|------------------|
| Reporting/dashboards | `LOCKING ROW FOR ACCESS` |
| Consistent reads | `LOCKING TABLE FOR READ` |
| Batch reads on busy tables | `LOCKING ROW FOR ACCESS` |
| Single-row lookups | Default (no modifier needed) |
| Critical aggregations | `LOCKING TABLE FOR READ` |
| ETL source reads | `LOCKING ROW FOR ACCESS` |

---

## Comment and Documentation Standards

### Table Comments

Document tables with purpose and usage:

```sql
COMMENT ON TABLE lineage.LIN_COLUMN_LINEAGE IS
'Stores column-level lineage relationships between source and target columns.
Each row represents a single transformation from one column to another.
Populated by parsing DBQL logs and SQL statements.
Partitioned by discovered_at timestamp for efficient time-based queries.';

COMMENT ON TABLE lineage.LIN_DATABASE IS
'Registry of all databases tracked in the lineage system.
Extracted from DBC.DatabasesV, excluding system databases.
Updated incrementally based on LIN_WATERMARK tracking.';
```

### Column Comments

Document non-obvious columns:

```sql
COMMENT ON COLUMN lineage.LIN_COLUMN_LINEAGE.transformation_type IS
'Type of transformation: DIRECT (1:1 mapping), AGGREGATION (SUM, AVG, etc.),
CALCULATION (expression), JOIN (join condition), FILTER (WHERE clause)';

COMMENT ON COLUMN lineage.LIN_COLUMN_LINEAGE.confidence_score IS
'Confidence score from 0.00 to 1.00 indicating reliability of the lineage.
1.00 = explicitly parsed from SQL, < 1.00 = inferred';

COMMENT ON COLUMN lineage.LIN_COLUMN_LINEAGE.is_active IS
'Y = active lineage relationship, N = deprecated/replaced.
Soft delete to maintain history.';
```

### SQL Script Headers

Include headers in SQL scripts:

```sql
/*******************************************************************************
 * Script: extract_column_lineage.sql
 * Description: Extracts column-level lineage from DBQL logs
 * Author: Data Engineering Team
 * Created: 2024-01-15
 * Modified: 2024-03-20 - Added support for MERGE statements
 *
 * Dependencies:
 *   - DBC.DBQLObjTbl (DBQL object logging must be enabled)
 *   - DBC.DBQLogTbl (DBQL logging must be enabled)
 *   - lineage.LIN_WATERMARK (tracks last extraction timestamp)
 *
 * Usage:
 *   BTEQ < extract_column_lineage.sql
 *   Or schedule via Teradata Scheduler
 *
 * Notes:
 *   - Run during off-peak hours due to DBQL table scans
 *   - Recommended frequency: hourly or daily
 ******************************************************************************/

-- Script body follows...
```

### Inline Comments

Use inline comments for complex logic:

```sql
SELECT
    cl.lineage_id,
    cl.source_column_id,
    cl.target_column_id,
    ul.depth + 1 AS new_depth,
    -- Concatenate path to detect cycles
    -- If source_column_id already exists in path, we have a cycle
    ul.path || '->' || cl.source_column_id AS new_path
FROM lineage.LIN_COLUMN_LINEAGE cl
JOIN upstream_lineage ul
    ON cl.target_column_id = ul.source_column_id
WHERE cl.is_active = 'Y'
  AND ul.depth < :max_depth           -- Prevent infinite recursion
  AND POSITION(cl.source_column_id IN ul.path) = 0;  -- Cycle detection
```

---

## Common Anti-Patterns to Avoid

### 1. SELECT *

Never use `SELECT *` in production code:

```sql
-- Bad
SELECT * FROM lineage.LIN_COLUMN_LINEAGE;

-- Good - Explicit column list
SELECT
    lineage_id,
    source_column_id,
    source_database,
    source_table,
    source_column,
    target_column_id,
    target_database,
    target_table,
    target_column,
    transformation_type,
    confidence_score
FROM lineage.LIN_COLUMN_LINEAGE;
```

### 2. Missing WHERE Clause on Updates/Deletes

Always include a WHERE clause:

```sql
-- Bad - Updates entire table!
UPDATE lineage.LIN_COLUMN_LINEAGE
SET is_active = 'N';

-- Good - Targeted update
UPDATE lineage.LIN_COLUMN_LINEAGE
SET is_active = 'N',
    last_seen_at = CURRENT_TIMESTAMP
WHERE lineage_id = :lineage_id;
```

### 3. Using Functions on Indexed Columns

Avoid functions on indexed columns in WHERE clauses:

```sql
-- Bad - Index on source_column_id cannot be used
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE UPPER(source_column_id) = 'SALES.ORDERS.AMOUNT';

-- Bad - Index on discovered_at cannot be used efficiently
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE EXTRACT(YEAR FROM discovered_at) = 2024;

-- Good - Direct comparison
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE source_column_id = 'sales.orders.amount';

-- Good - Range comparison allows partition elimination
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at >= DATE '2024-01-01'
  AND discovered_at < DATE '2025-01-01';
```

### 4. Unbounded Recursive CTEs

Always limit recursive CTE depth and detect cycles:

```sql
-- Bad - No depth limit, potential infinite loop
WITH RECURSIVE lineage AS (
    SELECT ... FROM ...
    UNION ALL
    SELECT ... FROM ... JOIN lineage ...
)
SELECT * FROM lineage;

-- Good - Depth limit and cycle detection (from project spec)
WITH RECURSIVE upstream_lineage AS (
    SELECT ..., 1 AS depth, source_column_id AS path
    FROM lineage.LIN_COLUMN_LINEAGE
    WHERE target_column_id = :column_id

    UNION ALL

    SELECT ..., ul.depth + 1, ul.path || '->' || cl.source_column_id
    FROM lineage.LIN_COLUMN_LINEAGE cl
    JOIN upstream_lineage ul ON cl.target_column_id = ul.source_column_id
    WHERE ul.depth < :max_depth                          -- Depth limit
      AND POSITION(cl.source_column_id IN ul.path) = 0  -- Cycle detection
)
SELECT * FROM upstream_lineage;
```

### 5. Cartesian Products

Always include proper JOIN conditions:

```sql
-- Bad - Accidental Cartesian product
SELECT *
FROM lineage.LIN_DATABASE d, lineage.LIN_TABLE t;

-- Good - Proper JOIN
SELECT *
FROM lineage.LIN_DATABASE d
JOIN lineage.LIN_TABLE t
    ON d.database_name = t.database_name;
```

### 6. NOT IN with NULLs

Use NOT EXISTS instead of NOT IN when NULLs are possible:

```sql
-- Bad - Returns no rows if subquery contains NULL
SELECT *
FROM lineage.LIN_COLUMN c
WHERE c.column_id NOT IN (
    SELECT source_column_id
    FROM lineage.LIN_COLUMN_LINEAGE
);

-- Good - Handles NULLs correctly
SELECT *
FROM lineage.LIN_COLUMN c
WHERE NOT EXISTS (
    SELECT 1
    FROM lineage.LIN_COLUMN_LINEAGE cl
    WHERE cl.source_column_id = c.column_id
);
```

### 7. Implicit Data Type Conversions

Avoid implicit conversions in comparisons:

```sql
-- Bad - Implicit conversion from string to integer
SELECT *
FROM lineage.LIN_COLUMN
WHERE column_position = '1';  -- column_position is INTEGER

-- Good - Matching data types
SELECT *
FROM lineage.LIN_COLUMN
WHERE column_position = 1;
```

### 8. Missing Transaction Control

Use explicit transaction control for multi-statement operations:

```sql
-- Good - Explicit transaction boundaries
BEGIN TRANSACTION;

DELETE FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at < DATE '2020-01-01';

UPDATE lineage.LIN_WATERMARK
SET last_purged_at = CURRENT_TIMESTAMP
WHERE source_name = 'LIN_COLUMN_LINEAGE';

COMMIT;
-- Or ROLLBACK if error occurs
```

### 9. Hardcoded Dates

Use parameters or relative dates:

```sql
-- Bad - Hardcoded date requires manual updates
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at > DATE '2024-01-01';

-- Good - Relative date
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at > CURRENT_DATE - INTERVAL '90' DAY;

-- Good - Parameterized
SELECT *
FROM lineage.LIN_COLUMN_LINEAGE
WHERE discovered_at > :start_date;
```

### 10. Missing Error Handling in Procedures

Include error handling in stored procedures:

```sql
-- Good - Error handling in procedure
REPLACE PROCEDURE lineage.sp_refresh_lineage()
BEGIN
    DECLARE error_code INTEGER;
    DECLARE error_msg VARCHAR(256);

    BEGIN TRANSACTION;

    -- Refresh logic here
    INSERT INTO lineage.LIN_COLUMN_LINEAGE ...

    COMMIT;

EXCEPTION
    WHEN SQLEXCEPTION THEN
        SET error_code = SQLCODE;
        SET error_msg = SQLERRM;

        ROLLBACK;

        INSERT INTO lineage.LIN_ERROR_LOG (error_code, error_msg, occurred_at)
        VALUES (error_code, error_msg, CURRENT_TIMESTAMP);

        RESIGNAL;
END;
```

---

## Quick Reference

| Category | Convention |
|----------|------------|
| Database names | lowercase_with_underscores |
| Table names | LIN_UPPERCASE_WITH_PREFIX (lineage tables) |
| Column names | lowercase_with_underscores |
| Index names | idx_table_column(s) |
| Primary keys | pk_table or inline |
| Foreign keys | fk_table_referenced |
| SQL keywords | UPPERCASE |
| Identifiers | lowercase |
| Indentation | 4 spaces |
| Table type | MULTISET (default) |
| Primary Index | High cardinality, frequently joined/filtered columns |
| Partitioning | RANGE_N by timestamp for time-series |
| Recursion | Always limit depth, detect cycles |
| Volatile tables | `vt_` prefix, `ON COMMIT PRESERVE ROWS` |
| Global temp tables | `gtt_` prefix, session-isolated data |
| Character sets | UNICODE (default), LATIN for ASCII-only |
| Timestamps | TIMESTAMP(0) for audit, TIMESTAMP(6) for high-res |
| Locking (reads) | `LOCKING ROW FOR ACCESS` for reports |
| Locking (writes) | Default WRITE lock, batch for large updates |
| Comments | Required for tables and complex columns |
