# Data Lineage Application - Database Component Test Plan

## Document Information

| Field | Value |
|-------|-------|
| Document Version | 1.0 |
| Created Date | 2026-01-19 |
| Related Specification | lineage_plan_database.md |
| Test Environment | Teradata Database Platform |

---

## Table of Contents

1. [Schema Validation Tests](#1-schema-validation-tests)
2. [Data Extraction Tests](#2-data-extraction-tests)
3. [Lineage Extraction Tests](#3-lineage-extraction-tests)
4. [Recursive CTE Tests](#4-recursive-cte-tests)
5. [Edge Case Tests](#5-edge-case-tests)
6. [Data Integrity Tests](#6-data-integrity-tests)

---

## 1. Schema Validation Tests

### 1.1 Database Creation Tests

#### TC-SCH-001: Verify Lineage Database Creation

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-001 |
| **Description** | Verify that the lineage database is created with correct storage allocation |
| **Preconditions** | DBC database exists with sufficient permissions |
| **Test Steps** | 1. Execute: `CREATE DATABASE lineage FROM DBC AS PERMANENT = 50GB, SPOOL = 10GB;`<br>2. Query DBC.DatabasesV to verify database exists<br>3. Verify storage allocation parameters |
| **Expected Results** | - Database "lineage" exists in DBC.DatabasesV<br>- Permanent space is 50GB<br>- Spool space is 10GB<br>- Owner is correctly set |
| **Priority** | Critical |

---

### 1.2 Table Structure Tests

#### TC-SCH-002: Verify LIN_DATABASE Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-002 |
| **Description** | Verify LIN_DATABASE table is created with correct columns and constraints |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_DATABASE<br>2. Query DBC.ColumnsV for table structure<br>3. Verify each column name, type, and length<br>4. Verify PRIMARY KEY constraint on database_id |
| **Expected Results** | - Table exists in lineage database<br>- Columns: database_id (VARCHAR(64) NOT NULL), database_name (VARCHAR(128) NOT NULL), owner_name (VARCHAR(128)), create_timestamp (TIMESTAMP(0)), last_alter_timestamp (TIMESTAMP(0)), comment_string (VARCHAR(2000)), extracted_at (TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP)<br>- PRIMARY KEY on database_id |
| **Priority** | Critical |

#### TC-SCH-003: Verify LIN_TABLE Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-003 |
| **Description** | Verify LIN_TABLE table is created with correct columns and constraints |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_TABLE<br>2. Query DBC.ColumnsV for table structure<br>3. Verify each column name, type, and length<br>4. Verify PRIMARY KEY constraint on table_id |
| **Expected Results** | - Table exists in lineage database<br>- Columns: table_id (VARCHAR(128) NOT NULL), database_name (VARCHAR(128) NOT NULL), table_name (VARCHAR(128) NOT NULL), table_kind (CHAR(1)), create_timestamp (TIMESTAMP(0)), last_alter_timestamp (TIMESTAMP(0)), comment_string (VARCHAR(2000)), row_count (BIGINT), extracted_at (TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP)<br>- PRIMARY KEY on table_id |
| **Priority** | Critical |

#### TC-SCH-004: Verify LIN_COLUMN Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-004 |
| **Description** | Verify LIN_COLUMN table is created with correct columns and constraints |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_COLUMN<br>2. Query DBC.ColumnsV for table structure<br>3. Verify each column name, type, and length<br>4. Verify PRIMARY KEY constraint on column_id |
| **Expected Results** | - Table exists in lineage database<br>- Columns: column_id (VARCHAR(256) NOT NULL), database_name (VARCHAR(128) NOT NULL), table_name (VARCHAR(128) NOT NULL), column_name (VARCHAR(128) NOT NULL), column_type (VARCHAR(128)), column_length (INTEGER), decimal_total_digits (INTEGER), decimal_fractional_digits (INTEGER), nullable (CHAR(1)), default_value (VARCHAR(1024)), comment_string (VARCHAR(2000)), column_position (INTEGER), extracted_at (TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP)<br>- PRIMARY KEY on column_id |
| **Priority** | Critical |

#### TC-SCH-005: Verify LIN_COLUMN_LINEAGE Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-005 |
| **Description** | Verify LIN_COLUMN_LINEAGE table is created with correct columns, constraints, and partitioning |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_COLUMN_LINEAGE<br>2. Query DBC.ColumnsV for table structure<br>3. Verify PRIMARY KEY constraint on lineage_id<br>4. Query DBC.TablePartsV to verify partitioning |
| **Expected Results** | - Table exists with all specified columns<br>- transformation_type allows: DIRECT, AGGREGATION, CALCULATION, JOIN, FILTER<br>- confidence_score is DECIMAL(3,2) with range 0.00 to 1.00<br>- is_active defaults to 'Y'<br>- Partitioned by RANGE_N on discovered_at (2020-01-01 to 2030-12-31, MONTHLY) |
| **Priority** | Critical |

#### TC-SCH-006: Verify LIN_TABLE_LINEAGE Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-006 |
| **Description** | Verify LIN_TABLE_LINEAGE table is created with correct columns and constraints |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_TABLE_LINEAGE<br>2. Query DBC.ColumnsV for table structure<br>3. Verify PRIMARY KEY constraint on lineage_id |
| **Expected Results** | - Table exists with all specified columns<br>- relationship_type allows: INSERT_SELECT, MERGE, CTAS, VIEW_DEPENDENCY<br>- is_active defaults to 'Y'<br>- PRIMARY KEY on lineage_id |
| **Priority** | Critical |

#### TC-SCH-007: Verify LIN_TRANSFORMATION Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-007 |
| **Description** | Verify LIN_TRANSFORMATION table is created with correct columns and constraints |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_TRANSFORMATION<br>2. Query DBC.ColumnsV for table structure<br>3. Verify PRIMARY KEY constraint on transformation_id |
| **Expected Results** | - Table exists with columns: transformation_id (VARCHAR(64) NOT NULL), transformation_type (VARCHAR(50) NOT NULL), transformation_logic (VARCHAR(10000)), description (VARCHAR(2000)), created_at (TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP)<br>- PRIMARY KEY on transformation_id |
| **Priority** | High |

#### TC-SCH-008: Verify LIN_QUERY Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-008 |
| **Description** | Verify LIN_QUERY table is created with correct columns, constraints, and partitioning |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_QUERY<br>2. Query DBC.ColumnsV for table structure<br>3. Verify PRIMARY KEY and partitioning |
| **Expected Results** | - Table exists with all specified columns including CLOB for query_text<br>- Partitioned by RANGE_N on start_time (2020-01-01 to 2030-12-31, MONTHLY)<br>- PRIMARY KEY on query_id |
| **Priority** | High |

#### TC-SCH-009: Verify LIN_WATERMARK Table Structure

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-009 |
| **Description** | Verify LIN_WATERMARK table is created with correct columns and constraints |
| **Preconditions** | Lineage database exists |
| **Test Steps** | 1. Execute CREATE TABLE statement for LIN_WATERMARK<br>2. Query DBC.ColumnsV for table structure<br>3. Verify PRIMARY KEY constraint on source_name |
| **Expected Results** | - Table exists with columns: source_name (VARCHAR(128) NOT NULL), last_extracted_at (TIMESTAMP(0)), last_extracted_id (VARCHAR(128)), row_count (BIGINT), status (VARCHAR(20)), updated_at (TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP)<br>- PRIMARY KEY on source_name |
| **Priority** | High |

---

### 1.3 Index Validation Tests

#### TC-SCH-010: Verify LIN_DATABASE Indexes

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-010 |
| **Description** | Verify indexes on LIN_DATABASE table |
| **Preconditions** | LIN_DATABASE table exists |
| **Test Steps** | 1. Execute CREATE INDEX statement<br>2. Query DBC.IndicesV for index details |
| **Expected Results** | - Index idx_lin_database_name exists on column database_name |
| **Priority** | High |

#### TC-SCH-011: Verify LIN_TABLE Indexes

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-011 |
| **Description** | Verify indexes on LIN_TABLE table |
| **Preconditions** | LIN_TABLE table exists |
| **Test Steps** | 1. Execute CREATE INDEX statements<br>2. Query DBC.IndicesV for index details |
| **Expected Results** | - Index idx_lin_table_db exists on column database_name<br>- Index idx_lin_table_name exists on column table_name |
| **Priority** | High |

#### TC-SCH-012: Verify LIN_COLUMN Indexes

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-012 |
| **Description** | Verify indexes on LIN_COLUMN table |
| **Preconditions** | LIN_COLUMN table exists |
| **Test Steps** | 1. Execute CREATE INDEX statements<br>2. Query DBC.IndicesV for index details |
| **Expected Results** | - Index idx_lin_column_db_tbl exists on columns (database_name, table_name)<br>- Index idx_lin_column_name exists on column column_name |
| **Priority** | High |

#### TC-SCH-013: Verify LIN_COLUMN_LINEAGE Indexes

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-013 |
| **Description** | Verify indexes on LIN_COLUMN_LINEAGE table |
| **Preconditions** | LIN_COLUMN_LINEAGE table exists |
| **Test Steps** | 1. Execute CREATE INDEX statements<br>2. Query DBC.IndicesV for index details |
| **Expected Results** | - Index idx_lin_col_lineage_source exists on column source_column_id<br>- Index idx_lin_col_lineage_target exists on column target_column_id<br>- Index idx_lin_col_lineage_src_db_tbl exists on columns (source_database, source_table)<br>- Index idx_lin_col_lineage_tgt_db_tbl exists on columns (target_database, target_table) |
| **Priority** | High |

#### TC-SCH-014: Verify LIN_TABLE_LINEAGE Indexes

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-014 |
| **Description** | Verify indexes on LIN_TABLE_LINEAGE table |
| **Preconditions** | LIN_TABLE_LINEAGE table exists |
| **Test Steps** | 1. Execute CREATE INDEX statements<br>2. Query DBC.IndicesV for index details |
| **Expected Results** | - Index idx_lin_tbl_lineage_source exists on column source_table_id<br>- Index idx_lin_tbl_lineage_target exists on column target_table_id |
| **Priority** | High |

#### TC-SCH-015: Verify LIN_QUERY Indexes

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-SCH-015 |
| **Description** | Verify indexes on LIN_QUERY table |
| **Preconditions** | LIN_QUERY table exists |
| **Test Steps** | 1. Execute CREATE INDEX statements<br>2. Query DBC.IndicesV for index details |
| **Expected Results** | - Index idx_lin_query_user exists on column user_name<br>- Index idx_lin_query_time exists on column start_time |
| **Priority** | High |

---

## 2. Data Extraction Tests

### 2.1 Database Extraction Tests

#### TC-EXT-001: Extract Databases from DBC - Basic Functionality

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-001 |
| **Description** | Verify database extraction query correctly populates LIN_DATABASE |
| **Preconditions** | - LIN_DATABASE table exists and is empty<br>- DBC.DatabasesV is accessible<br>- At least one user database exists |
| **Test Steps** | 1. Execute the database extraction INSERT statement<br>2. Query LIN_DATABASE to verify data<br>3. Compare record count with source |
| **Expected Results** | - Records inserted into LIN_DATABASE<br>- database_id matches TRIM(DatabaseName)<br>- All columns populated correctly<br>- extracted_at populated with current timestamp |
| **Priority** | Critical |

#### TC-EXT-002: Extract Databases - System Database Exclusion

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-002 |
| **Description** | Verify system databases are excluded from extraction |
| **Preconditions** | Database extraction has been executed |
| **Test Steps** | 1. Query LIN_DATABASE for excluded database names<br>2. Verify none of the system databases are present |
| **Expected Results** | - No records exist for: DBC, SYSLIB, SystemFe, SYSUDTLIB, SYSJDBC, SysAdmin, SYSSPATIAL, Crashdumps, dbcmngr, SQLJ, TD_SYSFNLIB, TDQCD, TDStats, tdwm, TDPUSER, LockLogShredder, EXTUSER, Sys_Calendar, TD_SYSXML, TD_SYSGPL |
| **Priority** | High |

#### TC-EXT-003: Extract Databases - Duplicate Handling

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-003 |
| **Description** | Verify duplicate extraction does not create duplicate records |
| **Preconditions** | LIN_DATABASE already contains extracted data |
| **Test Steps** | 1. Record current count of LIN_DATABASE<br>2. Re-execute extraction query<br>3. Verify behavior (error or merge) |
| **Expected Results** | - Primary key violation error OR<br>- Appropriate merge/upsert handling if implemented |
| **Priority** | Medium |

---

### 2.2 Table Extraction Tests

#### TC-EXT-004: Extract Tables from DBC - Basic Functionality

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-004 |
| **Description** | Verify table extraction query correctly populates LIN_TABLE |
| **Preconditions** | - LIN_TABLE table exists and is empty<br>- DBC.TablesV is accessible |
| **Test Steps** | 1. Execute the table extraction INSERT statement<br>2. Query LIN_TABLE to verify data<br>3. Verify table_id format (DatabaseName.TableName) |
| **Expected Results** | - Records inserted into LIN_TABLE<br>- table_id is concatenation of database_name and table_name<br>- All columns populated correctly |
| **Priority** | Critical |

#### TC-EXT-005: Extract Tables - Table Kind Filtering

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-005 |
| **Description** | Verify only Tables (T), Views (V), and Join Indexes (O) are extracted |
| **Preconditions** | Table extraction has been executed |
| **Test Steps** | 1. Query LIN_TABLE for distinct table_kind values<br>2. Verify only T, V, O are present |
| **Expected Results** | - table_kind only contains values: T, V, O<br>- No macros, procedures, or other object types |
| **Priority** | High |

#### TC-EXT-006: Extract Tables - System Database Exclusion

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-006 |
| **Description** | Verify tables from system databases are excluded |
| **Preconditions** | Table extraction has been executed |
| **Test Steps** | 1. Query LIN_TABLE for excluded database names<br>2. Verify no tables from system databases |
| **Expected Results** | - No records with database_name in: DBC, SYSLIB, SystemFe, SYSUDTLIB, SYSJDBC, SysAdmin, SYSSPATIAL |
| **Priority** | High |

---

### 2.3 Column Extraction Tests

#### TC-EXT-007: Extract Columns from DBC - Basic Functionality

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-007 |
| **Description** | Verify column extraction query correctly populates LIN_COLUMN |
| **Preconditions** | - LIN_COLUMN table exists and is empty<br>- DBC.ColumnsV is accessible |
| **Test Steps** | 1. Execute the column extraction INSERT statement<br>2. Query LIN_COLUMN to verify data<br>3. Verify column_id format (Database.Table.Column) |
| **Expected Results** | - Records inserted into LIN_COLUMN<br>- column_id is concatenation of database_name, table_name, column_name<br>- column_position correctly mapped from ColumnId |
| **Priority** | Critical |

#### TC-EXT-008: Extract Columns - Data Type Accuracy

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-008 |
| **Description** | Verify column data types are correctly extracted |
| **Preconditions** | Column extraction has been executed |
| **Test Steps** | 1. Select sample columns with known data types<br>2. Verify column_type, column_length, decimal_total_digits, decimal_fractional_digits |
| **Expected Results** | - VARCHAR columns have correct length<br>- DECIMAL columns have correct precision/scale<br>- All data types correctly represented |
| **Priority** | High |

#### TC-EXT-009: Extract Columns - Nullable and Default Values

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EXT-009 |
| **Description** | Verify nullable flag and default values are correctly extracted |
| **Preconditions** | Column extraction has been executed |
| **Test Steps** | 1. Select columns with known nullable/not null constraints<br>2. Verify nullable column value<br>3. Verify default_value for columns with defaults |
| **Expected Results** | - Nullable columns have nullable = 'Y'<br>- NOT NULL columns have nullable = 'N'<br>- Default values correctly captured |
| **Priority** | Medium |

---

## 3. Lineage Extraction Tests

### 3.1 Table-Level Lineage Extraction

#### TC-LIN-001: Extract Table Lineage from DBQL - Basic Functionality

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-001 |
| **Description** | Verify table-level lineage extraction from DBQL correctly identifies source-target relationships |
| **Preconditions** | - LIN_TABLE_LINEAGE table exists<br>- DBQL logging is enabled<br>- Test queries (INSERT...SELECT) have been executed |
| **Test Steps** | 1. Execute known INSERT...SELECT statement<br>2. Run lineage extraction query<br>3. Verify lineage record created |
| **Expected Results** | - Lineage record exists with correct source and target tables<br>- relationship_type = 'INSERT_SELECT'<br>- query_count = 1<br>- first_seen_at and last_seen_at populated |
| **Priority** | Critical |

#### TC-LIN-002: Extract Table Lineage - INSERT_SELECT Classification

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-002 |
| **Description** | Verify INSERT...SELECT statements are classified correctly |
| **Preconditions** | DBQL contains INSERT...SELECT query logs |
| **Test Steps** | 1. Execute: INSERT INTO target_table SELECT * FROM source_table<br>2. Run lineage extraction<br>3. Verify relationship_type |
| **Expected Results** | - relationship_type = 'INSERT_SELECT' |
| **Priority** | High |

#### TC-LIN-003: Extract Table Lineage - MERGE Classification

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-003 |
| **Description** | Verify MERGE statements are classified correctly |
| **Preconditions** | DBQL contains MERGE query logs |
| **Test Steps** | 1. Execute: MERGE INTO target_table USING source_table...<br>2. Run lineage extraction<br>3. Verify relationship_type |
| **Expected Results** | - relationship_type = 'MERGE' |
| **Priority** | High |

#### TC-LIN-004: Extract Table Lineage - CTAS Classification

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-004 |
| **Description** | Verify CREATE TABLE AS SELECT statements are classified correctly |
| **Preconditions** | DBQL contains CTAS query logs |
| **Test Steps** | 1. Execute: CREATE TABLE new_table AS SELECT * FROM source_table<br>2. Run lineage extraction<br>3. Verify relationship_type |
| **Expected Results** | - relationship_type = 'CTAS' |
| **Priority** | High |

#### TC-LIN-005: Extract Table Lineage - Multi-Source Queries

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-005 |
| **Description** | Verify lineage extraction handles queries with multiple source tables |
| **Preconditions** | DBQL contains multi-table JOIN query logs |
| **Test Steps** | 1. Execute: INSERT INTO target SELECT * FROM table1 JOIN table2 JOIN table3<br>2. Run lineage extraction<br>3. Verify all source relationships captured |
| **Expected Results** | - Three lineage records created (one per source table)<br>- All point to same target table |
| **Priority** | High |

#### TC-LIN-006: Extract Table Lineage - Query Count Aggregation

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-006 |
| **Description** | Verify query_count correctly aggregates repeated same-pattern queries |
| **Preconditions** | Same INSERT...SELECT executed multiple times |
| **Test Steps** | 1. Execute same INSERT...SELECT query 5 times<br>2. Run lineage extraction<br>3. Verify query_count value |
| **Expected Results** | - query_count = 5<br>- first_seen_at is timestamp of first execution<br>- last_seen_at is timestamp of last execution |
| **Priority** | Medium |

#### TC-LIN-007: Extract Table Lineage - Incremental Extraction

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-007 |
| **Description** | Verify incremental extraction using LIN_WATERMARK |
| **Preconditions** | - LIN_WATERMARK has entry for 'DBQL_LINEAGE'<br>- New queries exist after watermark |
| **Test Steps** | 1. Set watermark to specific timestamp<br>2. Execute new queries after that timestamp<br>3. Run lineage extraction<br>4. Verify only new queries processed |
| **Expected Results** | - Only queries with StartTime > watermark are processed<br>- Older queries are not re-processed |
| **Priority** | High |

---

### 3.2 TypeOfUse Validation Tests

#### TC-LIN-008: Verify Source TypeOfUse Values

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-008 |
| **Description** | Verify source tables are identified by TypeOfUse IN (1, 2) |
| **Preconditions** | DBQL object logging is active |
| **Test Steps** | 1. Execute query with known source tables<br>2. Query DBQLObjTbl for TypeOfUse values<br>3. Verify source identification |
| **Expected Results** | - Source/read tables have TypeOfUse = 1 or 2<br>- Correctly identified as lineage sources |
| **Priority** | High |

#### TC-LIN-009: Verify Target TypeOfUse Values

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-LIN-009 |
| **Description** | Verify target tables are identified by TypeOfUse IN (3, 4) |
| **Preconditions** | DBQL object logging is active |
| **Test Steps** | 1. Execute query with known target table<br>2. Query DBQLObjTbl for TypeOfUse values<br>3. Verify target identification |
| **Expected Results** | - Target/write tables have TypeOfUse = 3 or 4<br>- Correctly identified as lineage targets |
| **Priority** | High |

---

## 4. Recursive CTE Tests

### 4.1 Upstream Lineage Tests

#### TC-CTE-001: Upstream Lineage - Single Level

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-001 |
| **Description** | Verify upstream lineage retrieval for single-level relationships |
| **Preconditions** | - LIN_COLUMN_LINEAGE populated with test data<br>- Column A sources from Column B (depth 1) |
| **Test Steps** | 1. Execute upstream lineage CTE with column_id = A<br>2. Set max_depth = 10<br>3. Verify results |
| **Expected Results** | - Returns Column B as source<br>- depth = 1<br>- path = 'A->B' |
| **Priority** | Critical |

#### TC-CTE-002: Upstream Lineage - Multi-Level

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-002 |
| **Description** | Verify upstream lineage retrieval traverses multiple levels |
| **Preconditions** | - Column A <- Column B <- Column C <- Column D<br>- Chain of 3 levels |
| **Test Steps** | 1. Execute upstream lineage CTE with column_id = A<br>2. Set max_depth = 10<br>3. Verify all ancestors returned |
| **Expected Results** | - Returns B (depth 1), C (depth 2), D (depth 3)<br>- Results ordered by depth<br>- Correct paths for each level |
| **Priority** | Critical |

#### TC-CTE-003: Upstream Lineage - Max Depth Limit

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-003 |
| **Description** | Verify max_depth parameter limits traversal |
| **Preconditions** | - Column chain of 5 levels exists<br>- A <- B <- C <- D <- E |
| **Test Steps** | 1. Execute upstream lineage CTE with column_id = A<br>2. Set max_depth = 2<br>3. Verify only 2 levels returned |
| **Expected Results** | - Returns only B (depth 1) and C (depth 2)<br>- D and E not returned<br>- No records with depth > 2 |
| **Priority** | High |

#### TC-CTE-004: Upstream Lineage - Multiple Sources at Same Level

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-004 |
| **Description** | Verify retrieval of multiple sources at the same depth level |
| **Preconditions** | - Column A sources from B, C, and D (all at depth 1) |
| **Test Steps** | 1. Execute upstream lineage CTE with column_id = A<br>2. Verify all direct sources returned |
| **Expected Results** | - Returns B, C, D all with depth = 1<br>- All have correct transformation types |
| **Priority** | High |

#### TC-CTE-005: Upstream Lineage - is_active Filter

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-005 |
| **Description** | Verify only active lineage records are traversed |
| **Preconditions** | - A <- B (active), A <- C (inactive, is_active = 'N') |
| **Test Steps** | 1. Execute upstream lineage CTE with column_id = A<br>2. Verify only active records returned |
| **Expected Results** | - Returns only B<br>- C is not returned due to is_active = 'N' |
| **Priority** | High |

---

### 4.2 Downstream Lineage Tests

#### TC-CTE-006: Downstream Lineage - Single Level

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-006 |
| **Description** | Verify downstream lineage (impact analysis) for single-level relationships |
| **Preconditions** | - Column A flows to Column B (depth 1) |
| **Test Steps** | 1. Execute downstream lineage CTE with column_id = A<br>2. Set max_depth = 10<br>3. Verify results |
| **Expected Results** | - Returns Column B as target<br>- depth = 1<br>- path = 'A->B' |
| **Priority** | Critical |

#### TC-CTE-007: Downstream Lineage - Multi-Level Impact

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-007 |
| **Description** | Verify downstream lineage traverses multiple levels for impact analysis |
| **Preconditions** | - Column A -> B -> C -> D<br>- Chain of 3 levels |
| **Test Steps** | 1. Execute downstream lineage CTE with column_id = A<br>2. Set max_depth = 10<br>3. Verify all descendants returned |
| **Expected Results** | - Returns B (depth 1), C (depth 2), D (depth 3)<br>- Results ordered by depth<br>- Correct paths for each level |
| **Priority** | Critical |

#### TC-CTE-008: Downstream Lineage - Fan-Out Pattern

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-008 |
| **Description** | Verify downstream lineage handles fan-out (one source to many targets) |
| **Preconditions** | - Column A flows to B, C, D, E (all at depth 1)<br>- B flows to F, G (depth 2) |
| **Test Steps** | 1. Execute downstream lineage CTE with column_id = A<br>2. Verify all impacted columns returned |
| **Expected Results** | - Returns B, C, D, E (depth 1) and F, G (depth 2)<br>- Total of 6 impacted columns identified |
| **Priority** | High |

---

### 4.3 Common CTE Tests

#### TC-CTE-009: Lineage with Transformation Types

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-009 |
| **Description** | Verify transformation_type is correctly returned in lineage results |
| **Preconditions** | - Lineage records with various transformation types exist |
| **Test Steps** | 1. Insert lineage records with types: DIRECT, AGGREGATION, CALCULATION, JOIN, FILTER<br>2. Execute lineage CTE<br>3. Verify transformation_type values |
| **Expected Results** | - Each result includes correct transformation_type<br>- Values match inserted data |
| **Priority** | Medium |

#### TC-CTE-010: Lineage with Confidence Scores

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-CTE-010 |
| **Description** | Verify confidence_score is correctly returned in lineage results |
| **Preconditions** | - Lineage records with various confidence scores (0.50, 0.75, 1.00) |
| **Test Steps** | 1. Execute lineage CTE<br>2. Verify confidence_score values returned |
| **Expected Results** | - Each result includes correct confidence_score<br>- Values in range 0.00 to 1.00 |
| **Priority** | Medium |

---

## 5. Edge Case Tests

### 5.1 Cycle Detection Tests

#### TC-EDGE-001: Cycle Detection - Direct Self-Reference

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-001 |
| **Description** | Verify cycle detection prevents infinite loops on self-referencing columns |
| **Preconditions** | - Lineage record: A -> A (self-reference) |
| **Test Steps** | 1. Insert self-referencing lineage record<br>2. Execute upstream lineage CTE<br>3. Verify query terminates |
| **Expected Results** | - Query completes without infinite loop<br>- Returns single record (depth 1)<br>- Cycle detected via POSITION() check |
| **Priority** | Critical |

#### TC-EDGE-002: Cycle Detection - Two-Node Cycle

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-002 |
| **Description** | Verify cycle detection handles A -> B -> A pattern |
| **Preconditions** | - Lineage: A -> B and B -> A |
| **Test Steps** | 1. Insert bidirectional lineage records<br>2. Execute upstream lineage CTE starting from A<br>3. Verify termination and results |
| **Expected Results** | - Query completes without infinite loop<br>- Returns B (depth 1) only<br>- Does not return A again at depth 2 |
| **Priority** | Critical |

#### TC-EDGE-003: Cycle Detection - Multi-Node Cycle

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-003 |
| **Description** | Verify cycle detection handles A -> B -> C -> D -> A pattern |
| **Preconditions** | - Lineage chain forms complete cycle |
| **Test Steps** | 1. Insert circular lineage records<br>2. Execute lineage CTE from any node<br>3. Verify termination |
| **Expected Results** | - Query completes without infinite loop<br>- Each node returned once<br>- Cycle broken by path tracking |
| **Priority** | Critical |

#### TC-EDGE-004: Cycle Detection - Diamond Pattern

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-004 |
| **Description** | Verify diamond pattern (A -> B -> D, A -> C -> D) does not cause issues |
| **Preconditions** | - Diamond-shaped lineage graph |
| **Test Steps** | 1. Insert diamond pattern lineage<br>2. Execute downstream lineage from A<br>3. Verify D returned only once |
| **Expected Results** | - D returned with minimum depth<br>- No duplicate processing<br>- Both paths (B and C) traversed |
| **Priority** | High |

---

### 5.2 Max Depth Limit Tests

#### TC-EDGE-005: Max Depth - Zero Value

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-005 |
| **Description** | Verify behavior when max_depth = 0 |
| **Preconditions** | - Lineage data exists |
| **Test Steps** | 1. Execute lineage CTE with max_depth = 0<br>2. Observe results |
| **Expected Results** | - No results returned OR<br>- Error for invalid parameter |
| **Priority** | Medium |

#### TC-EDGE-006: Max Depth - Very Large Value

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-006 |
| **Description** | Verify behavior with max_depth = 100 on deep lineage |
| **Preconditions** | - Deep lineage chain (10+ levels) |
| **Test Steps** | 1. Execute lineage CTE with max_depth = 100<br>2. Measure performance<br>3. Verify complete traversal |
| **Expected Results** | - Query completes in reasonable time<br>- All lineage levels returned<br>- Performance within acceptable bounds |
| **Priority** | Medium |

#### TC-EDGE-007: Max Depth - Exactly at Limit

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-007 |
| **Description** | Verify boundary condition where data depth equals max_depth |
| **Preconditions** | - Lineage chain of exactly 5 levels |
| **Test Steps** | 1. Execute lineage CTE with max_depth = 5<br>2. Verify all levels returned |
| **Expected Results** | - Exactly 5 depth levels returned<br>- Depth 5 records included |
| **Priority** | Medium |

---

### 5.3 Empty Result Tests

#### TC-EDGE-008: Empty Results - No Upstream Lineage

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-008 |
| **Description** | Verify handling of columns with no upstream lineage (source columns) |
| **Preconditions** | - Column exists only as source, never as target |
| **Test Steps** | 1. Execute upstream lineage CTE for source-only column<br>2. Verify empty result handling |
| **Expected Results** | - Returns empty result set<br>- No errors<br>- Query completes successfully |
| **Priority** | High |

#### TC-EDGE-009: Empty Results - No Downstream Lineage

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-009 |
| **Description** | Verify handling of columns with no downstream lineage (terminal columns) |
| **Preconditions** | - Column exists only as target, never as source |
| **Test Steps** | 1. Execute downstream lineage CTE for terminal column<br>2. Verify empty result handling |
| **Expected Results** | - Returns empty result set<br>- No errors<br>- Query completes successfully |
| **Priority** | High |

#### TC-EDGE-010: Empty Results - Non-Existent Column ID

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-010 |
| **Description** | Verify handling of non-existent column_id parameter |
| **Preconditions** | - LIN_COLUMN_LINEAGE has data |
| **Test Steps** | 1. Execute lineage CTE with column_id = 'NONEXISTENT.TABLE.COLUMN'<br>2. Verify result handling |
| **Expected Results** | - Returns empty result set<br>- No errors<br>- No exception thrown |
| **Priority** | High |

---

### 5.4 Large Dataset Tests

#### TC-EDGE-011: Large Dataset - Wide Fan-Out

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-011 |
| **Description** | Verify performance with wide fan-out (1 source to 1000+ targets) |
| **Preconditions** | - Single column flows to 1000+ downstream columns |
| **Test Steps** | 1. Insert 1000+ lineage records from single source<br>2. Execute downstream lineage CTE<br>3. Measure query time and verify results |
| **Expected Results** | - Query completes within acceptable time (< 30 seconds)<br>- All 1000+ targets returned<br>- No timeout or memory issues |
| **Priority** | Medium |

#### TC-EDGE-012: Large Dataset - Deep Chain

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-012 |
| **Description** | Verify performance with deep lineage chain (50+ levels) |
| **Preconditions** | - Linear chain of 50+ column-to-column relationships |
| **Test Steps** | 1. Create chain of 50 levels<br>2. Execute lineage CTE with max_depth = 100<br>3. Measure performance |
| **Expected Results** | - Query completes within acceptable time<br>- All 50 levels returned<br>- Memory usage stable |
| **Priority** | Medium |

#### TC-EDGE-013: Large Dataset - High Volume Table

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-013 |
| **Description** | Verify extraction and query performance with 1M+ lineage records |
| **Preconditions** | - LIN_COLUMN_LINEAGE contains 1M+ records |
| **Test Steps** | 1. Insert 1M+ lineage records<br>2. Execute various lineage queries<br>3. Verify index effectiveness |
| **Expected Results** | - Queries using indexes complete quickly<br>- No full table scans for targeted queries<br>- Performance within SLA |
| **Priority** | High |

#### TC-EDGE-014: Large Dataset - Partition Performance

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-014 |
| **Description** | Verify partition pruning for date-range filtered queries |
| **Preconditions** | - LIN_COLUMN_LINEAGE partitioned by discovered_at<br>- Data spans multiple partitions |
| **Test Steps** | 1. Query lineage with discovered_at filter<br>2. Examine query explain plan<br>3. Verify partition pruning |
| **Expected Results** | - Only relevant partitions scanned<br>- Query plan shows partition elimination<br>- Performance significantly better than full scan |
| **Priority** | Medium |

---

### 5.5 Special Character Tests

#### TC-EDGE-015: Special Characters in Identifiers

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-015 |
| **Description** | Verify handling of special characters in database/table/column names |
| **Preconditions** | - Objects with underscores, numbers, mixed case exist |
| **Test Steps** | 1. Extract metadata for objects with special names<br>2. Verify column_id formation<br>3. Test lineage queries with these IDs |
| **Expected Results** | - Special characters preserved correctly<br>- TRIM() removes only whitespace<br>- IDs usable in lineage queries |
| **Priority** | Medium |

#### TC-EDGE-016: NULL Values in Optional Fields

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-EDGE-016 |
| **Description** | Verify handling of NULL values in optional columns |
| **Preconditions** | - Source data has NULL values for optional fields |
| **Test Steps** | 1. Extract data where owner_name, comment_string, etc. are NULL<br>2. Verify NULL preservation<br>3. Verify queries handle NULLs |
| **Expected Results** | - NULL values correctly stored<br>- No conversion errors<br>- Queries handle NULLs gracefully |
| **Priority** | Medium |

---

## 6. Data Integrity Tests

### 6.1 Referential Integrity Tests

#### TC-INT-001: Column Lineage References Valid Columns

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-001 |
| **Description** | Verify source_column_id and target_column_id reference existing columns |
| **Preconditions** | - LIN_COLUMN populated<br>- LIN_COLUMN_LINEAGE populated |
| **Test Steps** | 1. Query for orphaned source_column_id references<br>2. Query for orphaned target_column_id references<br>3. Report any integrity violations |
| **Expected Results** | - All source_column_id values exist in LIN_COLUMN<br>- All target_column_id values exist in LIN_COLUMN<br>- Zero orphaned references |
| **Priority** | High |

#### TC-INT-002: Table Lineage References Valid Tables

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-002 |
| **Description** | Verify source_table_id and target_table_id reference existing tables |
| **Preconditions** | - LIN_TABLE populated<br>- LIN_TABLE_LINEAGE populated |
| **Test Steps** | 1. Query for orphaned source_table_id references<br>2. Query for orphaned target_table_id references<br>3. Report any integrity violations |
| **Expected Results** | - All source_table_id values exist in LIN_TABLE<br>- All target_table_id values exist in LIN_TABLE<br>- Zero orphaned references |
| **Priority** | High |

#### TC-INT-003: Column References Valid Tables

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-003 |
| **Description** | Verify columns reference existing tables |
| **Preconditions** | - LIN_TABLE populated<br>- LIN_COLUMN populated |
| **Test Steps** | 1. Query for columns where database_name.table_name not in LIN_TABLE<br>2. Report any orphaned columns |
| **Expected Results** | - All columns belong to existing tables<br>- Zero orphaned column records |
| **Priority** | High |

#### TC-INT-004: Tables Reference Valid Databases

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-004 |
| **Description** | Verify tables reference existing databases |
| **Preconditions** | - LIN_DATABASE populated<br>- LIN_TABLE populated |
| **Test Steps** | 1. Query for tables where database_name not in LIN_DATABASE<br>2. Report any orphaned tables |
| **Expected Results** | - All tables belong to existing databases<br>- Zero orphaned table records |
| **Priority** | High |

---

### 6.2 Data Consistency Tests

#### TC-INT-005: Column ID Consistency

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-005 |
| **Description** | Verify column_id matches concatenation of database_name, table_name, column_name |
| **Preconditions** | - LIN_COLUMN populated |
| **Test Steps** | 1. Query: SELECT * FROM LIN_COLUMN WHERE column_id != database_name \|\| '.' \|\| table_name \|\| '.' \|\| column_name<br>2. Report any mismatches |
| **Expected Results** | - Zero mismatches<br>- All column_id values follow standard format |
| **Priority** | High |

#### TC-INT-006: Table ID Consistency

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-006 |
| **Description** | Verify table_id matches concatenation of database_name and table_name |
| **Preconditions** | - LIN_TABLE populated |
| **Test Steps** | 1. Query: SELECT * FROM LIN_TABLE WHERE table_id != database_name \|\| '.' \|\| table_name<br>2. Report any mismatches |
| **Expected Results** | - Zero mismatches<br>- All table_id values follow standard format |
| **Priority** | High |

#### TC-INT-007: Lineage ID Uniqueness

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-007 |
| **Description** | Verify lineage_id is unique across all lineage records |
| **Preconditions** | - LIN_COLUMN_LINEAGE populated |
| **Test Steps** | 1. Query for duplicate lineage_id values<br>2. Verify primary key enforcement |
| **Expected Results** | - Zero duplicate lineage_id values<br>- Primary key constraint prevents duplicates |
| **Priority** | Critical |

#### TC-INT-008: Timestamp Consistency

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-008 |
| **Description** | Verify timestamp logical consistency (first_seen <= last_seen) |
| **Preconditions** | - LIN_TABLE_LINEAGE populated |
| **Test Steps** | 1. Query: SELECT * FROM LIN_TABLE_LINEAGE WHERE first_seen_at > last_seen_at<br>2. Report any violations |
| **Expected Results** | - Zero violations<br>- first_seen_at always <= last_seen_at |
| **Priority** | Medium |

#### TC-INT-009: Confidence Score Range

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-009 |
| **Description** | Verify confidence_score within valid range (0.00 to 1.00) |
| **Preconditions** | - LIN_COLUMN_LINEAGE populated |
| **Test Steps** | 1. Query: SELECT * FROM LIN_COLUMN_LINEAGE WHERE confidence_score < 0 OR confidence_score > 1<br>2. Report any violations |
| **Expected Results** | - Zero violations<br>- All confidence_score values in [0.00, 1.00] |
| **Priority** | Medium |

#### TC-INT-010: Active Flag Values

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-010 |
| **Description** | Verify is_active contains only valid values ('Y' or 'N') |
| **Preconditions** | - LIN_COLUMN_LINEAGE and LIN_TABLE_LINEAGE populated |
| **Test Steps** | 1. Query for is_active values not in ('Y', 'N')<br>2. Report any violations |
| **Expected Results** | - Zero violations<br>- is_active only contains 'Y' or 'N' |
| **Priority** | Medium |

---

### 6.3 Watermark Integrity Tests

#### TC-INT-011: Watermark Status Values

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-011 |
| **Description** | Verify watermark status contains valid values |
| **Preconditions** | - LIN_WATERMARK populated |
| **Test Steps** | 1. Query for distinct status values<br>2. Verify against expected values (e.g., SUCCESS, FAILED, IN_PROGRESS) |
| **Expected Results** | - All status values are valid<br>- No unexpected status values |
| **Priority** | Medium |

#### TC-INT-012: Watermark Timestamp Progression

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-012 |
| **Description** | Verify last_extracted_at increases with successful extractions |
| **Preconditions** | - Multiple extraction runs completed |
| **Test Steps** | 1. Record watermark timestamp before extraction<br>2. Run extraction<br>3. Verify timestamp increased |
| **Expected Results** | - last_extracted_at >= previous value after successful extraction<br>- row_count reflects new records |
| **Priority** | Medium |

---

### 6.4 Cross-Table Consistency Tests

#### TC-INT-013: Lineage Source-Target Denormalization Consistency

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-013 |
| **Description** | Verify denormalized columns in LIN_COLUMN_LINEAGE match source tables |
| **Preconditions** | - LIN_COLUMN_LINEAGE populated<br>- LIN_COLUMN populated |
| **Test Steps** | 1. Join LIN_COLUMN_LINEAGE to LIN_COLUMN on source_column_id<br>2. Verify source_database, source_table, source_column match<br>3. Repeat for target columns |
| **Expected Results** | - All denormalized source values match LIN_COLUMN<br>- All denormalized target values match LIN_COLUMN |
| **Priority** | High |

#### TC-INT-014: Table Lineage Denormalization Consistency

| Field | Description |
|-------|-------------|
| **Test Case ID** | TC-INT-014 |
| **Description** | Verify denormalized columns in LIN_TABLE_LINEAGE match source tables |
| **Preconditions** | - LIN_TABLE_LINEAGE populated<br>- LIN_TABLE populated |
| **Test Steps** | 1. Join LIN_TABLE_LINEAGE to LIN_TABLE on source_table_id<br>2. Verify source_database, source_table match<br>3. Repeat for target tables |
| **Expected Results** | - All denormalized source values match LIN_TABLE<br>- All denormalized target values match LIN_TABLE |
| **Priority** | High |

---

## Appendix A: Test Data Setup Scripts

This appendix provides comprehensive scripts to create actual test tables with data movement between them, generating real DBQL entries for lineage discovery.

### A.1 Test Database and Schema Setup

```sql
-- =============================================================================
-- Create test database for lineage testing
-- =============================================================================
CREATE DATABASE lineage_test FROM DBC AS PERMANENT = 1GB, SPOOL = 500MB;

-- Grant necessary permissions for test execution
GRANT ALL ON lineage_test TO test_user;
```

### A.2 Source Layer Tables (Raw/Landing Zone)

```sql
-- =============================================================================
-- SOURCE LAYER: Simulates raw data landing tables
-- These are the origin points in our lineage graph
-- =============================================================================

-- Customer source data (origin table)
CREATE TABLE lineage_test.SRC_CUSTOMER (
    customer_id INTEGER NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    created_date DATE,
    source_system VARCHAR(20),
    load_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (customer_id);

-- Product source data (origin table)
CREATE TABLE lineage_test.SRC_PRODUCT (
    product_id INTEGER NOT NULL,
    product_name VARCHAR(100),
    category VARCHAR(50),
    unit_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    supplier_id INTEGER,
    effective_date DATE,
    load_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (product_id);

-- Sales transaction source data (origin table)
CREATE TABLE lineage_test.SRC_SALES (
    transaction_id INTEGER NOT NULL,
    customer_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    sale_amount DECIMAL(12,2),
    discount_amount DECIMAL(10,2),
    sale_date DATE,
    store_id INTEGER,
    load_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (transaction_id);

-- Store reference data (origin table)
CREATE TABLE lineage_test.SRC_STORE (
    store_id INTEGER NOT NULL,
    store_name VARCHAR(100),
    region VARCHAR(50),
    city VARCHAR(50),
    state VARCHAR(2),
    open_date DATE,
    load_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (store_id);
```

### A.3 Staging Layer Tables (Cleaned/Transformed)

```sql
-- =============================================================================
-- STAGING LAYER: Cleaned and standardized data
-- These tables receive data via INSERT...SELECT from source tables
-- =============================================================================

-- Staging customer (cleaned/standardized)
CREATE TABLE lineage_test.STG_CUSTOMER (
    customer_key INTEGER NOT NULL,
    customer_id INTEGER,
    full_name VARCHAR(101),  -- Derived: first_name || ' ' || last_name
    email_address VARCHAR(100),
    phone_number VARCHAR(20),
    customer_since DATE,
    etl_batch_id INTEGER,
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (customer_key);

-- Staging product (cleaned/standardized)
CREATE TABLE lineage_test.STG_PRODUCT (
    product_key INTEGER NOT NULL,
    product_id INTEGER,
    product_name VARCHAR(100),
    category_name VARCHAR(50),
    unit_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    profit_margin DECIMAL(5,2),  -- Derived: (unit_price - cost_price) / unit_price
    etl_batch_id INTEGER,
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (product_key);

-- Staging sales (enriched with calculations)
CREATE TABLE lineage_test.STG_SALES (
    sales_key INTEGER NOT NULL,
    transaction_id INTEGER,
    customer_id INTEGER,
    product_id INTEGER,
    store_id INTEGER,
    quantity INTEGER,
    gross_amount DECIMAL(12,2),
    discount_amount DECIMAL(10,2),
    net_amount DECIMAL(12,2),  -- Derived: gross_amount - discount_amount
    sale_date DATE,
    etl_batch_id INTEGER,
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (sales_key);
```

### A.4 Dimension Tables (Star Schema)

```sql
-- =============================================================================
-- DIMENSION LAYER: Conformed dimensions for reporting
-- These tables receive data via MERGE from staging tables
-- =============================================================================

-- Customer dimension (SCD Type 2)
CREATE TABLE lineage_test.DIM_CUSTOMER (
    customer_sk INTEGER NOT NULL,
    customer_id INTEGER,
    full_name VARCHAR(101),
    email_address VARCHAR(100),
    phone_number VARCHAR(20),
    customer_since DATE,
    effective_date DATE,
    expiry_date DATE,
    is_current CHAR(1) DEFAULT 'Y',
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (customer_sk);

-- Product dimension
CREATE TABLE lineage_test.DIM_PRODUCT (
    product_sk INTEGER NOT NULL,
    product_id INTEGER,
    product_name VARCHAR(100),
    category_name VARCHAR(50),
    unit_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    profit_margin DECIMAL(5,2),
    effective_date DATE,
    expiry_date DATE,
    is_current CHAR(1) DEFAULT 'Y',
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (product_sk);

-- Store dimension
CREATE TABLE lineage_test.DIM_STORE (
    store_sk INTEGER NOT NULL,
    store_id INTEGER,
    store_name VARCHAR(100),
    region VARCHAR(50),
    city VARCHAR(50),
    state VARCHAR(2),
    open_date DATE,
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (store_sk);

-- Date dimension (reference table)
CREATE TABLE lineage_test.DIM_DATE (
    date_sk INTEGER NOT NULL,
    calendar_date DATE,
    day_of_week INTEGER,
    day_name VARCHAR(10),
    month_number INTEGER,
    month_name VARCHAR(10),
    quarter INTEGER,
    year_number INTEGER,
    is_weekend CHAR(1),
    is_holiday CHAR(1)
) PRIMARY INDEX (date_sk);
```

### A.5 Fact Tables

```sql
-- =============================================================================
-- FACT LAYER: Transactional and aggregate facts
-- These tables join multiple dimensions
-- =============================================================================

-- Sales fact table (grain: one row per transaction)
CREATE TABLE lineage_test.FACT_SALES (
    sales_sk INTEGER NOT NULL,
    date_sk INTEGER,
    customer_sk INTEGER,
    product_sk INTEGER,
    store_sk INTEGER,
    transaction_id INTEGER,
    quantity INTEGER,
    gross_amount DECIMAL(12,2),
    discount_amount DECIMAL(10,2),
    net_amount DECIMAL(12,2),
    cost_amount DECIMAL(12,2),  -- Derived: quantity * DIM_PRODUCT.cost_price
    profit_amount DECIMAL(12,2),  -- Derived: net_amount - cost_amount
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (sales_sk);

-- Daily sales aggregate (grain: one row per store/product/day)
CREATE TABLE lineage_test.FACT_SALES_DAILY (
    date_sk INTEGER NOT NULL,
    store_sk INTEGER NOT NULL,
    product_sk INTEGER NOT NULL,
    total_quantity INTEGER,
    total_gross_amount DECIMAL(14,2),
    total_discount_amount DECIMAL(14,2),
    total_net_amount DECIMAL(14,2),
    total_cost_amount DECIMAL(14,2),
    total_profit_amount DECIMAL(14,2),
    transaction_count INTEGER,
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (date_sk, store_sk, product_sk);

-- Monthly sales summary (grain: one row per store/month)
CREATE TABLE lineage_test.RPT_MONTHLY_SALES (
    year_month INTEGER NOT NULL,
    store_sk INTEGER NOT NULL,
    store_name VARCHAR(100),
    region VARCHAR(50),
    total_sales DECIMAL(16,2),
    total_profit DECIMAL(16,2),
    total_transactions INTEGER,
    avg_transaction_value DECIMAL(12,2),
    etl_timestamp TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP
) PRIMARY INDEX (year_month, store_sk);
```

### A.6 Load Source Data

```sql
-- =============================================================================
-- STEP 1: Populate source tables with test data
-- =============================================================================

-- Insert customer source data
INSERT INTO lineage_test.SRC_CUSTOMER (customer_id, first_name, last_name, email, phone, created_date, source_system)
VALUES
(1001, 'John', 'Smith', 'john.smith@email.com', '555-0101', DATE '2020-01-15', 'CRM'),
(1002, 'Jane', 'Doe', 'jane.doe@email.com', '555-0102', DATE '2020-02-20', 'CRM'),
(1003, 'Robert', 'Johnson', 'r.johnson@email.com', '555-0103', DATE '2020-03-10', 'WEB'),
(1004, 'Emily', 'Williams', 'emily.w@email.com', '555-0104', DATE '2020-04-05', 'WEB'),
(1005, 'Michael', 'Brown', 'm.brown@email.com', '555-0105', DATE '2020-05-22', 'CRM');

-- Insert product source data
INSERT INTO lineage_test.SRC_PRODUCT (product_id, product_name, category, unit_price, cost_price, supplier_id, effective_date)
VALUES
(2001, 'Laptop Pro 15', 'Electronics', 1299.99, 850.00, 100, DATE '2023-01-01'),
(2002, 'Wireless Mouse', 'Electronics', 49.99, 22.00, 100, DATE '2023-01-01'),
(2003, 'Office Chair Deluxe', 'Furniture', 399.99, 180.00, 101, DATE '2023-01-01'),
(2004, 'Standing Desk', 'Furniture', 599.99, 320.00, 101, DATE '2023-01-01'),
(2005, 'Monitor 27 inch', 'Electronics', 449.99, 280.00, 100, DATE '2023-01-01');

-- Insert store source data
INSERT INTO lineage_test.SRC_STORE (store_id, store_name, region, city, state, open_date)
VALUES
(301, 'Downtown Flagship', 'Northeast', 'New York', 'NY', DATE '2015-06-01'),
(302, 'Mall Location', 'Northeast', 'Boston', 'MA', DATE '2016-03-15'),
(303, 'Tech Hub Store', 'West', 'San Francisco', 'CA', DATE '2017-09-01'),
(304, 'Suburban Outlet', 'Midwest', 'Chicago', 'IL', DATE '2018-01-20');

-- Insert sales source data
INSERT INTO lineage_test.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id)
VALUES
(5001, 1001, 2001, 1, 1299.99, 100.00, DATE '2024-01-15', 301),
(5002, 1001, 2002, 2, 99.98, 0.00, DATE '2024-01-15', 301),
(5003, 1002, 2003, 1, 399.99, 40.00, DATE '2024-01-16', 302),
(5004, 1003, 2004, 1, 599.99, 50.00, DATE '2024-01-17', 303),
(5005, 1003, 2005, 2, 899.98, 90.00, DATE '2024-01-17', 303),
(5006, 1004, 2001, 1, 1299.99, 0.00, DATE '2024-01-18', 304),
(5007, 1005, 2002, 3, 149.97, 15.00, DATE '2024-01-19', 301),
(5008, 1002, 2005, 1, 449.99, 0.00, DATE '2024-01-20', 302),
(5009, 1004, 2003, 2, 799.98, 80.00, DATE '2024-01-21', 303),
(5010, 1001, 2004, 1, 599.99, 60.00, DATE '2024-01-22', 301);

-- Populate date dimension
INSERT INTO lineage_test.DIM_DATE (date_sk, calendar_date, day_of_week, day_name, month_number, month_name, quarter, year_number, is_weekend, is_holiday)
SELECT
    CAST(calendar_date - DATE '1900-01-01' AS INTEGER) AS date_sk,
    calendar_date,
    TD_DAY_OF_WEEK(calendar_date) AS day_of_week,
    CASE TD_DAY_OF_WEEK(calendar_date)
        WHEN 1 THEN 'Sunday' WHEN 2 THEN 'Monday' WHEN 3 THEN 'Tuesday'
        WHEN 4 THEN 'Wednesday' WHEN 5 THEN 'Thursday' WHEN 6 THEN 'Friday'
        WHEN 7 THEN 'Saturday'
    END AS day_name,
    EXTRACT(MONTH FROM calendar_date) AS month_number,
    CASE EXTRACT(MONTH FROM calendar_date)
        WHEN 1 THEN 'January' WHEN 2 THEN 'February' WHEN 3 THEN 'March'
        WHEN 4 THEN 'April' WHEN 5 THEN 'May' WHEN 6 THEN 'June'
        WHEN 7 THEN 'July' WHEN 8 THEN 'August' WHEN 9 THEN 'September'
        WHEN 10 THEN 'October' WHEN 11 THEN 'November' WHEN 12 THEN 'December'
    END AS month_name,
    TD_QUARTER_OF_YEAR(calendar_date) AS quarter,
    EXTRACT(YEAR FROM calendar_date) AS year_number,
    CASE WHEN TD_DAY_OF_WEEK(calendar_date) IN (1, 7) THEN 'Y' ELSE 'N' END AS is_weekend,
    'N' AS is_holiday
FROM Sys_Calendar.CALENDAR
WHERE calendar_date BETWEEN DATE '2024-01-01' AND DATE '2024-12-31';
```

### A.7 Data Movement: Source to Staging (INSERT...SELECT)

```sql
-- =============================================================================
-- STEP 2: Transform source data into staging layer
-- These INSERT...SELECT statements create lineage: SRC -> STG
-- =============================================================================

-- Transform customers: SRC_CUSTOMER -> STG_CUSTOMER
-- Lineage: first_name + last_name -> full_name (CALCULATION)
-- Lineage: email -> email_address (DIRECT)
-- Lineage: phone -> phone_number (DIRECT)
-- Lineage: created_date -> customer_since (DIRECT)
INSERT INTO lineage_test.STG_CUSTOMER (customer_key, customer_id, full_name, email_address, phone_number, customer_since, etl_batch_id)
SELECT
    ROW_NUMBER() OVER (ORDER BY customer_id) AS customer_key,
    customer_id,
    TRIM(first_name) || ' ' || TRIM(last_name) AS full_name,
    LOWER(TRIM(email)) AS email_address,
    phone AS phone_number,
    created_date AS customer_since,
    1 AS etl_batch_id
FROM lineage_test.SRC_CUSTOMER;

-- Transform products: SRC_PRODUCT -> STG_PRODUCT
-- Lineage: unit_price, cost_price -> profit_margin (CALCULATION)
INSERT INTO lineage_test.STG_PRODUCT (product_key, product_id, product_name, category_name, unit_price, cost_price, profit_margin, etl_batch_id)
SELECT
    ROW_NUMBER() OVER (ORDER BY product_id) AS product_key,
    product_id,
    product_name,
    category AS category_name,
    unit_price,
    cost_price,
    CAST(((unit_price - cost_price) / NULLIFZERO(unit_price)) * 100 AS DECIMAL(5,2)) AS profit_margin,
    1 AS etl_batch_id
FROM lineage_test.SRC_PRODUCT;

-- Transform sales: SRC_SALES -> STG_SALES
-- Lineage: sale_amount -> gross_amount (DIRECT)
-- Lineage: sale_amount - discount_amount -> net_amount (CALCULATION)
INSERT INTO lineage_test.STG_SALES (sales_key, transaction_id, customer_id, product_id, store_id, quantity, gross_amount, discount_amount, net_amount, sale_date, etl_batch_id)
SELECT
    ROW_NUMBER() OVER (ORDER BY transaction_id) AS sales_key,
    transaction_id,
    customer_id,
    product_id,
    store_id,
    quantity,
    sale_amount AS gross_amount,
    discount_amount,
    sale_amount - discount_amount AS net_amount,
    sale_date,
    1 AS etl_batch_id
FROM lineage_test.SRC_SALES;
```

### A.8 Data Movement: Staging to Dimensions (MERGE)

```sql
-- =============================================================================
-- STEP 3: Load dimensions using MERGE (for SCD handling)
-- These MERGE statements create lineage: STG -> DIM
-- =============================================================================

-- Merge customers into dimension: STG_CUSTOMER -> DIM_CUSTOMER
MERGE INTO lineage_test.DIM_CUSTOMER AS tgt
USING lineage_test.STG_CUSTOMER AS src
ON tgt.customer_id = src.customer_id AND tgt.is_current = 'Y'
WHEN MATCHED THEN UPDATE SET
    full_name = src.full_name,
    email_address = src.email_address,
    phone_number = src.phone_number,
    etl_timestamp = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN INSERT (
    customer_sk, customer_id, full_name, email_address, phone_number,
    customer_since, effective_date, expiry_date, is_current
)
VALUES (
    src.customer_key, src.customer_id, src.full_name, src.email_address, src.phone_number,
    src.customer_since, CURRENT_DATE, DATE '9999-12-31', 'Y'
);

-- Merge products into dimension: STG_PRODUCT -> DIM_PRODUCT
MERGE INTO lineage_test.DIM_PRODUCT AS tgt
USING lineage_test.STG_PRODUCT AS src
ON tgt.product_id = src.product_id AND tgt.is_current = 'Y'
WHEN MATCHED THEN UPDATE SET
    product_name = src.product_name,
    category_name = src.category_name,
    unit_price = src.unit_price,
    cost_price = src.cost_price,
    profit_margin = src.profit_margin,
    etl_timestamp = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN INSERT (
    product_sk, product_id, product_name, category_name, unit_price,
    cost_price, profit_margin, effective_date, expiry_date, is_current
)
VALUES (
    src.product_key, src.product_id, src.product_name, src.category_name, src.unit_price,
    src.cost_price, src.profit_margin, CURRENT_DATE, DATE '9999-12-31', 'Y'
);

-- Load stores directly: SRC_STORE -> DIM_STORE (skipping staging for variety)
INSERT INTO lineage_test.DIM_STORE (store_sk, store_id, store_name, region, city, state, open_date)
SELECT
    ROW_NUMBER() OVER (ORDER BY store_id) AS store_sk,
    store_id,
    store_name,
    region,
    city,
    state,
    open_date
FROM lineage_test.SRC_STORE;
```

### A.9 Data Movement: Staging + Dimensions to Facts (Multi-Source JOIN)

```sql
-- =============================================================================
-- STEP 4: Load fact table with multi-source JOINs
-- These INSERT...SELECT with JOINs create lineage from multiple sources
-- =============================================================================

-- Load fact sales: Multiple sources -> FACT_SALES
-- This creates lineage from STG_SALES, DIM_CUSTOMER, DIM_PRODUCT, DIM_STORE, DIM_DATE
INSERT INTO lineage_test.FACT_SALES (
    sales_sk, date_sk, customer_sk, product_sk, store_sk, transaction_id,
    quantity, gross_amount, discount_amount, net_amount, cost_amount, profit_amount
)
SELECT
    s.sales_key AS sales_sk,
    d.date_sk,
    c.customer_sk,
    p.product_sk,
    st.store_sk,
    s.transaction_id,
    s.quantity,
    s.gross_amount,
    s.discount_amount,
    s.net_amount,
    s.quantity * p.cost_price AS cost_amount,  -- Derived from STG_SALES.quantity and DIM_PRODUCT.cost_price
    s.net_amount - (s.quantity * p.cost_price) AS profit_amount  -- Complex calculation
FROM lineage_test.STG_SALES s
INNER JOIN lineage_test.DIM_CUSTOMER c ON s.customer_id = c.customer_id AND c.is_current = 'Y'
INNER JOIN lineage_test.DIM_PRODUCT p ON s.product_id = p.product_id AND p.is_current = 'Y'
INNER JOIN lineage_test.DIM_STORE st ON s.store_id = st.store_id
INNER JOIN lineage_test.DIM_DATE d ON s.sale_date = d.calendar_date;
```

### A.10 Data Movement: Fact to Aggregates (AGGREGATION)

```sql
-- =============================================================================
-- STEP 5: Create aggregates from fact table
-- These aggregations create lineage: FACT -> Aggregate tables
-- =============================================================================

-- Daily aggregate: FACT_SALES -> FACT_SALES_DAILY
-- Creates AGGREGATION type lineage (SUM, COUNT)
INSERT INTO lineage_test.FACT_SALES_DAILY (
    date_sk, store_sk, product_sk, total_quantity, total_gross_amount,
    total_discount_amount, total_net_amount, total_cost_amount,
    total_profit_amount, transaction_count
)
SELECT
    date_sk,
    store_sk,
    product_sk,
    SUM(quantity) AS total_quantity,
    SUM(gross_amount) AS total_gross_amount,
    SUM(discount_amount) AS total_discount_amount,
    SUM(net_amount) AS total_net_amount,
    SUM(cost_amount) AS total_cost_amount,
    SUM(profit_amount) AS total_profit_amount,
    COUNT(*) AS transaction_count
FROM lineage_test.FACT_SALES
GROUP BY date_sk, store_sk, product_sk;

-- Monthly summary: FACT_SALES_DAILY + DIM_STORE + DIM_DATE -> RPT_MONTHLY_SALES
-- Creates lineage from multiple sources with aggregation
INSERT INTO lineage_test.RPT_MONTHLY_SALES (
    year_month, store_sk, store_name, region, total_sales,
    total_profit, total_transactions, avg_transaction_value
)
SELECT
    d.year_number * 100 + d.month_number AS year_month,
    f.store_sk,
    s.store_name,
    s.region,
    SUM(f.total_net_amount) AS total_sales,
    SUM(f.total_profit_amount) AS total_profit,
    SUM(f.transaction_count) AS total_transactions,
    CAST(SUM(f.total_net_amount) / NULLIFZERO(SUM(f.transaction_count)) AS DECIMAL(12,2)) AS avg_transaction_value
FROM lineage_test.FACT_SALES_DAILY f
INNER JOIN lineage_test.DIM_STORE s ON f.store_sk = s.store_sk
INNER JOIN lineage_test.DIM_DATE d ON f.date_sk = d.date_sk
GROUP BY d.year_number * 100 + d.month_number, f.store_sk, s.store_name, s.region;
```

### A.11 Data Movement: CREATE TABLE AS SELECT (CTAS)

```sql
-- =============================================================================
-- STEP 6: Create derived tables using CTAS
-- These CTAS statements create lineage with relationship_type = 'CTAS'
-- =============================================================================

-- Create a snapshot table using CTAS: FACT_SALES -> FACT_SALES_SNAPSHOT_20240122
CREATE TABLE lineage_test.FACT_SALES_SNAPSHOT_20240122 AS (
    SELECT
        sales_sk,
        date_sk,
        customer_sk,
        product_sk,
        store_sk,
        transaction_id,
        quantity,
        gross_amount,
        discount_amount,
        net_amount,
        cost_amount,
        profit_amount,
        etl_timestamp,
        CURRENT_DATE AS snapshot_date
    FROM lineage_test.FACT_SALES
) WITH DATA;

-- Create a filtered subset using CTAS with JOIN: Multiple sources -> RPT_HIGH_VALUE_CUSTOMERS
CREATE TABLE lineage_test.RPT_HIGH_VALUE_CUSTOMERS AS (
    SELECT
        c.customer_sk,
        c.customer_id,
        c.full_name,
        c.email_address,
        SUM(f.net_amount) AS total_spend,
        SUM(f.profit_amount) AS total_profit_contributed,
        COUNT(DISTINCT f.sales_sk) AS total_transactions,
        MIN(d.calendar_date) AS first_purchase_date,
        MAX(d.calendar_date) AS last_purchase_date
    FROM lineage_test.FACT_SALES f
    INNER JOIN lineage_test.DIM_CUSTOMER c ON f.customer_sk = c.customer_sk
    INNER JOIN lineage_test.DIM_DATE d ON f.date_sk = d.date_sk
    GROUP BY c.customer_sk, c.customer_id, c.full_name, c.email_address
    HAVING SUM(f.net_amount) > 1000
) WITH DATA;
```

### A.12 View Creation (VIEW_DEPENDENCY)

```sql
-- =============================================================================
-- STEP 7: Create views to establish VIEW_DEPENDENCY lineage
-- =============================================================================

-- Sales summary view: FACT_SALES + dimensions -> V_SALES_SUMMARY
CREATE VIEW lineage_test.V_SALES_SUMMARY AS
SELECT
    d.calendar_date AS sale_date,
    d.day_name,
    d.month_name,
    s.store_name,
    s.region,
    p.product_name,
    p.category_name,
    c.full_name AS customer_name,
    f.quantity,
    f.gross_amount,
    f.discount_amount,
    f.net_amount,
    f.profit_amount
FROM lineage_test.FACT_SALES f
INNER JOIN lineage_test.DIM_DATE d ON f.date_sk = d.date_sk
INNER JOIN lineage_test.DIM_STORE s ON f.store_sk = s.store_sk
INNER JOIN lineage_test.DIM_PRODUCT p ON f.product_sk = p.product_sk
INNER JOIN lineage_test.DIM_CUSTOMER c ON f.customer_sk = c.customer_sk;

-- Regional performance view: Multiple aggregates
CREATE VIEW lineage_test.V_REGIONAL_PERFORMANCE AS
SELECT
    s.region,
    d.year_number,
    d.month_name,
    SUM(f.total_net_amount) AS monthly_sales,
    SUM(f.total_profit_amount) AS monthly_profit,
    SUM(f.transaction_count) AS monthly_transactions,
    COUNT(DISTINCT f.store_sk) AS active_stores
FROM lineage_test.FACT_SALES_DAILY f
INNER JOIN lineage_test.DIM_STORE s ON f.store_sk = s.store_sk
INNER JOIN lineage_test.DIM_DATE d ON f.date_sk = d.date_sk
GROUP BY s.region, d.year_number, d.month_name;
```

### A.13 Expected Lineage Paths for Testing

The above data movement creates the following lineage chains that can be verified:

```
LINEAGE CHAIN 1: Customer Data Flow
==================================
SRC_CUSTOMER.first_name ─┐
                         ├─► STG_CUSTOMER.full_name ─► DIM_CUSTOMER.full_name ─► V_SALES_SUMMARY.customer_name
SRC_CUSTOMER.last_name  ─┘                                                    └► RPT_HIGH_VALUE_CUSTOMERS.full_name
SRC_CUSTOMER.email ─────► STG_CUSTOMER.email_address ─► DIM_CUSTOMER.email_address ─► RPT_HIGH_VALUE_CUSTOMERS.email_address

LINEAGE CHAIN 2: Product Data Flow
=================================
SRC_PRODUCT.unit_price ─┬─► STG_PRODUCT.unit_price ─► DIM_PRODUCT.unit_price
                        │
SRC_PRODUCT.cost_price ─┼─► STG_PRODUCT.cost_price ─► DIM_PRODUCT.cost_price ─► FACT_SALES.cost_amount
                        │                                                     └► FACT_SALES.profit_amount
                        └─► STG_PRODUCT.profit_margin ─► DIM_PRODUCT.profit_margin

LINEAGE CHAIN 3: Sales Data Flow (Full Pipeline)
===============================================
SRC_SALES.sale_amount ─► STG_SALES.gross_amount ─► FACT_SALES.gross_amount ─► FACT_SALES_DAILY.total_gross_amount
                     └► STG_SALES.net_amount ─┬─► FACT_SALES.net_amount ─┬─► FACT_SALES_DAILY.total_net_amount ─► RPT_MONTHLY_SALES.total_sales
                                              │                          └─► FACT_SALES_SNAPSHOT_20240122.net_amount
                                              └─► RPT_HIGH_VALUE_CUSTOMERS.total_spend

LINEAGE CHAIN 4: Multi-Source to Fact (Fan-In Pattern)
====================================================
STG_SALES.quantity ─────────┐
DIM_PRODUCT.cost_price ─────┼─► FACT_SALES.cost_amount
                            │
STG_SALES.net_amount ───────┼─► FACT_SALES.profit_amount
DIM_PRODUCT.cost_price ─────┘

LINEAGE CHAIN 5: Aggregation Pattern (Fan-In from Fact)
=====================================================
FACT_SALES.quantity ────────► FACT_SALES_DAILY.total_quantity
FACT_SALES.gross_amount ────► FACT_SALES_DAILY.total_gross_amount
FACT_SALES.net_amount ──────► FACT_SALES_DAILY.total_net_amount
FACT_SALES.profit_amount ───► FACT_SALES_DAILY.total_profit_amount
FACT_SALES.* (COUNT) ───────► FACT_SALES_DAILY.transaction_count

LINEAGE CHAIN 6: Cross-Database Aggregation to Report
===================================================
FACT_SALES_DAILY.total_net_amount ─┬─► RPT_MONTHLY_SALES.total_sales
                                   └─► RPT_MONTHLY_SALES.avg_transaction_value
FACT_SALES_DAILY.total_profit_amount ─► RPT_MONTHLY_SALES.total_profit
FACT_SALES_DAILY.transaction_count ─┬─► RPT_MONTHLY_SALES.total_transactions
                                    └─► RPT_MONTHLY_SALES.avg_transaction_value
DIM_STORE.store_name ──────────────────► RPT_MONTHLY_SALES.store_name
DIM_STORE.region ──────────────────────► RPT_MONTHLY_SALES.region
```

### A.14 Direct Lineage Record Insertion (for CTE Edge Case Testing)

```sql
-- =============================================================================
-- For testing recursive CTE edge cases, insert lineage records directly
-- These supplement the DBQL-discovered lineage
-- =============================================================================

-- Cycle test data (A -> B -> A)
INSERT INTO lineage.LIN_COLUMN_LINEAGE VALUES
('TEST_CYCLE_001', 'lineage_test.CYCLE_TEST.col_a', 'lineage_test', 'CYCLE_TEST', 'col_a',
 'lineage_test.CYCLE_TEST.col_b', 'lineage_test', 'CYCLE_TEST', 'col_b',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Y'),
('TEST_CYCLE_002', 'lineage_test.CYCLE_TEST.col_b', 'lineage_test', 'CYCLE_TEST', 'col_b',
 'lineage_test.CYCLE_TEST.col_a', 'lineage_test', 'CYCLE_TEST', 'col_a',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Y');

-- Deep chain test (10 levels: L1 -> L2 -> L3 -> ... -> L10)
INSERT INTO lineage.LIN_COLUMN_LINEAGE
SELECT
    'TEST_DEEP_' || TRIM(level_num) AS lineage_id,
    'lineage_test.DEEP_CHAIN.level_' || TRIM(level_num) AS source_column_id,
    'lineage_test' AS source_database,
    'DEEP_CHAIN' AS source_table,
    'level_' || TRIM(level_num) AS source_column,
    'lineage_test.DEEP_CHAIN.level_' || TRIM(level_num + 1) AS target_column_id,
    'lineage_test' AS target_database,
    'DEEP_CHAIN' AS target_table,
    'level_' || TRIM(level_num + 1) AS target_column,
    'DIRECT' AS transformation_type,
    NULL AS transformation_id,
    1.00 AS confidence_score,
    NULL AS query_id,
    CURRENT_TIMESTAMP AS discovered_at,
    CURRENT_TIMESTAMP AS last_seen_at,
    'Y' AS is_active
FROM (SELECT ROW_NUMBER() OVER (ORDER BY 1) AS level_num FROM lineage.LIN_DATABASE) t
WHERE level_num <= 9;

-- Wide fan-out test (1 source -> 20 targets)
INSERT INTO lineage.LIN_COLUMN_LINEAGE
SELECT
    'TEST_FANOUT_' || TRIM(target_num) AS lineage_id,
    'lineage_test.FANOUT_SOURCE.source_col' AS source_column_id,
    'lineage_test' AS source_database,
    'FANOUT_SOURCE' AS source_table,
    'source_col' AS source_column,
    'lineage_test.FANOUT_TARGET_' || TRIM(target_num) || '.target_col' AS target_column_id,
    'lineage_test' AS target_database,
    'FANOUT_TARGET_' || TRIM(target_num) AS target_table,
    'target_col' AS target_column,
    'DIRECT' AS transformation_type,
    NULL AS transformation_id,
    1.00 AS confidence_score,
    NULL AS query_id,
    CURRENT_TIMESTAMP AS discovered_at,
    CURRENT_TIMESTAMP AS last_seen_at,
    'Y' AS is_active
FROM (SELECT ROW_NUMBER() OVER (ORDER BY 1) AS target_num FROM lineage.LIN_DATABASE) t
WHERE target_num <= 20;

-- Diamond pattern test (A -> B -> D, A -> C -> D)
INSERT INTO lineage.LIN_COLUMN_LINEAGE VALUES
('TEST_DIAMOND_001', 'lineage_test.DIAMOND.col_a', 'lineage_test', 'DIAMOND', 'col_a',
 'lineage_test.DIAMOND.col_b', 'lineage_test', 'DIAMOND', 'col_b',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Y'),
('TEST_DIAMOND_002', 'lineage_test.DIAMOND.col_a', 'lineage_test', 'DIAMOND', 'col_a',
 'lineage_test.DIAMOND.col_c', 'lineage_test', 'DIAMOND', 'col_c',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Y'),
('TEST_DIAMOND_003', 'lineage_test.DIAMOND.col_b', 'lineage_test', 'DIAMOND', 'col_b',
 'lineage_test.DIAMOND.col_d', 'lineage_test', 'DIAMOND', 'col_d',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Y'),
('TEST_DIAMOND_004', 'lineage_test.DIAMOND.col_c', 'lineage_test', 'DIAMOND', 'col_c',
 'lineage_test.DIAMOND.col_d', 'lineage_test', 'DIAMOND', 'col_d',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Y');

-- Inactive lineage test
INSERT INTO lineage.LIN_COLUMN_LINEAGE VALUES
('TEST_INACTIVE_001', 'lineage_test.INACTIVE_TEST.active_source', 'lineage_test', 'INACTIVE_TEST', 'active_source',
 'lineage_test.INACTIVE_TEST.target', 'lineage_test', 'INACTIVE_TEST', 'target',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Y'),
('TEST_INACTIVE_002', 'lineage_test.INACTIVE_TEST.inactive_source', 'lineage_test', 'INACTIVE_TEST', 'inactive_source',
 'lineage_test.INACTIVE_TEST.target', 'lineage_test', 'INACTIVE_TEST', 'target',
 'DIRECT', NULL, 1.00, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'N');  -- is_active = 'N'
```

### A.15 Cleanup Scripts

```sql
-- =============================================================================
-- Cleanup test data and objects
-- =============================================================================

-- Drop views first
DROP VIEW lineage_test.V_REGIONAL_PERFORMANCE;
DROP VIEW lineage_test.V_SALES_SUMMARY;

-- Drop CTAS tables
DROP TABLE lineage_test.RPT_HIGH_VALUE_CUSTOMERS;
DROP TABLE lineage_test.FACT_SALES_SNAPSHOT_20240122;

-- Drop fact and aggregate tables
DROP TABLE lineage_test.RPT_MONTHLY_SALES;
DROP TABLE lineage_test.FACT_SALES_DAILY;
DROP TABLE lineage_test.FACT_SALES;

-- Drop dimension tables
DROP TABLE lineage_test.DIM_DATE;
DROP TABLE lineage_test.DIM_STORE;
DROP TABLE lineage_test.DIM_PRODUCT;
DROP TABLE lineage_test.DIM_CUSTOMER;

-- Drop staging tables
DROP TABLE lineage_test.STG_SALES;
DROP TABLE lineage_test.STG_PRODUCT;
DROP TABLE lineage_test.STG_CUSTOMER;

-- Drop source tables
DROP TABLE lineage_test.SRC_STORE;
DROP TABLE lineage_test.SRC_SALES;
DROP TABLE lineage_test.SRC_PRODUCT;
DROP TABLE lineage_test.SRC_CUSTOMER;

-- Drop test database
DROP DATABASE lineage_test;

-- Clean up test lineage records
DELETE FROM lineage.LIN_COLUMN_LINEAGE WHERE lineage_id LIKE 'TEST_%';
DELETE FROM lineage.LIN_TABLE_LINEAGE WHERE lineage_id LIKE 'TEST_%';
```

---

## Appendix B: Test Environment Requirements

| Requirement | Specification |
|-------------|---------------|
| Teradata Version | 16.20 or higher |
| DBQL Logging | Enabled with Object logging |
| Test Database | Dedicated test schemas |
| Permissions | SELECT on DBC views, ALL on lineage database |
| Data Volume | Minimum 10,000 test records for performance tests |

---

## Appendix C: Test Execution Checklist

| Phase | Test Cases | Status |
|-------|------------|--------|
| Schema Validation | TC-SCH-001 through TC-SCH-015 | [ ] |
| Data Extraction | TC-EXT-001 through TC-EXT-009 | [ ] |
| Lineage Extraction | TC-LIN-001 through TC-LIN-009 | [ ] |
| Recursive CTE | TC-CTE-001 through TC-CTE-010 | [ ] |
| Edge Cases | TC-EDGE-001 through TC-EDGE-016 | [ ] |
| Data Integrity | TC-INT-001 through TC-INT-014 | [ ] |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-19 | Test Team | Initial version |
