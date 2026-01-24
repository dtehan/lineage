SELECT
    -- Generate deterministic lineage_id from source+target
    HASHROW(
        TRIM(src.ObjectDatabaseName) || '.' || TRIM(src.ObjectTableName) || '->' ||
        TRIM(tgt.ObjectDatabaseName) || '.' || TRIM(tgt.ObjectTableName)
    ) (VARCHAR(64)) AS lineage_id,
    TRIM(src.ObjectDatabaseName) || '.' || TRIM(src.ObjectTableName) AS source_table_id,
    TRIM(src.ObjectDatabaseName) AS source_database,
    TRIM(src.ObjectTableName) AS source_table,
    TRIM(tgt.ObjectDatabaseName) || '.' || TRIM(tgt.ObjectTableName) AS target_table_id,
    TRIM(tgt.ObjectDatabaseName) AS target_database,
    TRIM(tgt.ObjectTableName) AS target_table,
    CASE q.StatementType
        WHEN 'Insert' THEN 'INSERT_SELECT'
        WHEN 'Merge Into' THEN 'MERGE'
        WHEN 'Create Table' THEN 'CTAS'
        WHEN 'Update' THEN 'UPDATE'
        ELSE 'UNKNOWN'
    END AS relationship_type,
    COUNT(*) AS query_count,
    MIN(q.StartTime) AS first_seen_at,
    MAX(q.StartTime) AS last_seen_at,
    'Y' AS is_active
FROM DBC.DBQLObjTbl src
JOIN DBC.DBQLObjTbl tgt
    ON src.QueryID = tgt.QueryID
    AND src.ProcID = tgt.ProcID
JOIN DBC.DBQLogTbl q
    ON src.QueryID = q.QueryID
    AND src.ProcID = q.ProcID
WHERE src.TypeOfUse IN (1, 2)       -- 1=Sel, 2=SelInto (Read/Source)
  AND tgt.TypeOfUse IN (3, 4)       -- 3=Ins, 4=InsInto (Write/Target)
  AND src.ObjectType = 'Tab'
  AND tgt.ObjectType = 'Tab'
  AND q.ErrorCode = 0               -- Successful queries only
  AND q.StatementType IN ('Insert', 'Merge Into', 'Create Table', 'Update')
  AND q.StartTime > ?               -- Watermark for incremental extraction
  -- Exclude self-references
  AND NOT (src.ObjectDatabaseName = tgt.ObjectDatabaseName
           AND src.ObjectTableName = tgt.ObjectTableName)
  -- Exclude system databases
  AND src.ObjectDatabaseName NOT IN ('DBC', 'SYSLIB', 'SYSUDTLIB', 'SystemFe', 'Sys_Calendar', 'SYSSPATIAL', 'TD_SYSFNLIB')
  AND tgt.ObjectDatabaseName NOT IN ('DBC', 'SYSLIB', 'SYSUDTLIB', 'SystemFe', 'Sys_Calendar', 'SYSSPATIAL', 'TD_SYSFNLIB')
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8