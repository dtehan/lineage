package domain

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TC-UNIT-001: Database Entity Creation
func TestDatabaseEntityCreation(t *testing.T) {
	timestamp := time.Now()
	db := Database{
		ID:              "db-001",
		Name:            "test_db",
		OwnerName:       "admin",
		CreateTimestamp: timestamp,
		CommentString:   "Test database",
	}

	// Verify all fields are correctly set
	assert.Equal(t, "db-001", db.ID)
	assert.Equal(t, "test_db", db.Name)
	assert.Equal(t, "admin", db.OwnerName)
	assert.Equal(t, timestamp, db.CreateTimestamp)
	assert.Equal(t, "Test database", db.CommentString)

	// Test JSON serialization
	jsonBytes, err := json.Marshal(db)
	require.NoError(t, err)

	var unmarshaled Database
	err = json.Unmarshal(jsonBytes, &unmarshaled)
	require.NoError(t, err)

	// JSON field names should use camelCase
	jsonStr := string(jsonBytes)
	assert.Contains(t, jsonStr, `"id"`)
	assert.Contains(t, jsonStr, `"name"`)
	assert.Contains(t, jsonStr, `"ownerName"`)
	assert.Contains(t, jsonStr, `"createTimestamp"`)
	assert.Contains(t, jsonStr, `"commentString"`)
}

// TC-UNIT-002: Table Entity Creation
func TestTableEntityCreation(t *testing.T) {
	timestamp := time.Now()

	// Test with TableKind = "T" (Table)
	table := Table{
		ID:              "tbl-001",
		DatabaseName:    "test_db",
		TableName:       "users",
		TableKind:       "T",
		CreateTimestamp: timestamp,
		CommentString:   "User table",
		RowCount:        1000,
	}

	assert.Equal(t, "T", table.TableKind)

	// Test with TableKind = "V" (View)
	view := Table{
		ID:           "tbl-002",
		DatabaseName: "test_db",
		TableName:    "user_view",
		TableKind:    "V",
	}

	assert.Equal(t, "V", view.TableKind)

	// Test JSON serialization
	jsonBytes, err := json.Marshal(table)
	require.NoError(t, err)

	var unmarshaled Table
	err = json.Unmarshal(jsonBytes, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, table.ID, unmarshaled.ID)
	assert.Equal(t, table.TableKind, unmarshaled.TableKind)
}

// TC-UNIT-003: Column Entity Creation
func TestColumnEntityCreation(t *testing.T) {
	testCases := []struct {
		name       string
		columnType string
		nullable   bool
	}{
		{"VARCHAR column", "VARCHAR", true},
		{"INTEGER column", "INTEGER", false},
		{"DECIMAL column", "DECIMAL", true},
		{"DATE column", "DATE", false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			col := Column{
				ID:             "col-001",
				DatabaseName:   "test_db",
				TableName:      "users",
				ColumnName:     "test_col",
				ColumnType:     tc.columnType,
				ColumnLength:   255,
				Nullable:       tc.nullable,
				CommentString:  "Test column",
				ColumnPosition: 1,
			}

			assert.Equal(t, tc.columnType, col.ColumnType)
			assert.Equal(t, tc.nullable, col.Nullable)

			// Test JSON serialization
			jsonBytes, err := json.Marshal(col)
			require.NoError(t, err)

			var unmarshaled Column
			err = json.Unmarshal(jsonBytes, &unmarshaled)
			require.NoError(t, err)

			assert.Equal(t, col.Nullable, unmarshaled.Nullable)
		})
	}
}

// TC-UNIT-004: ColumnLineage Entity Creation
func TestColumnLineageEntityCreation(t *testing.T) {
	lineage := ColumnLineage{
		LineageID:          "lin-001",
		SourceColumnID:     "col-src-001",
		SourceDatabase:     "source_db",
		SourceTable:        "source_table",
		SourceColumn:       "source_col",
		TargetColumnID:     "col-tgt-001",
		TargetDatabase:     "target_db",
		TargetTable:        "target_table",
		TargetColumn:       "target_col",
		TransformationType: "DIRECT",
		ConfidenceScore:    0.95,
		Depth:              1,
	}

	// Verify source and target columns are correctly linked
	assert.Equal(t, "col-src-001", lineage.SourceColumnID)
	assert.Equal(t, "col-tgt-001", lineage.TargetColumnID)

	// Verify ConfidenceScore maintains precision
	assert.InDelta(t, 0.95, lineage.ConfidenceScore, 0.001)

	// Verify Depth
	assert.Equal(t, 1, lineage.Depth)

	// Test with different transformation types
	transformTypes := []string{"DIRECT", "TRANSFORM", "AGGREGATE"}
	for _, tt := range transformTypes {
		lineage.TransformationType = tt
		assert.Equal(t, tt, lineage.TransformationType)
	}
}

// TC-UNIT-005: LineageGraph Entity Construction
func TestLineageGraphEntityConstruction(t *testing.T) {
	nodes := []LineageNode{
		{ID: "node-1", Type: "column", DatabaseName: "db1", TableName: "tbl1", ColumnName: "col1"},
		{ID: "node-2", Type: "column", DatabaseName: "db1", TableName: "tbl1", ColumnName: "col2"},
		{ID: "node-3", Type: "column", DatabaseName: "db2", TableName: "tbl2", ColumnName: "col3"},
	}

	edges := []LineageEdge{
		{ID: "edge-1", Source: "node-1", Target: "node-2", TransformationType: "DIRECT"},
		{ID: "edge-2", Source: "node-2", Target: "node-3", TransformationType: "TRANSFORM"},
	}

	graph := LineageGraph{
		Nodes: nodes,
		Edges: edges,
	}

	// Verify graph structure
	assert.Len(t, graph.Nodes, 3)
	assert.Len(t, graph.Edges, 2)

	// Verify edges have correct source/target references
	assert.Equal(t, "node-1", graph.Edges[0].Source)
	assert.Equal(t, "node-2", graph.Edges[0].Target)
}

// TC-UNIT-006: LineageNode Type Validation
func TestLineageNodeTypeValidation(t *testing.T) {
	testCases := []struct {
		nodeType string
	}{
		{"database"},
		{"table"},
		{"column"},
	}

	for _, tc := range testCases {
		t.Run(tc.nodeType, func(t *testing.T) {
			node := LineageNode{
				ID:       "node-1",
				Type:     tc.nodeType,
				Metadata: map[string]any{"key": "value", "count": 42},
			}

			assert.Equal(t, tc.nodeType, node.Type)
			assert.NotNil(t, node.Metadata)
			assert.Equal(t, "value", node.Metadata["key"])
			assert.Equal(t, 42, node.Metadata["count"])
		})
	}
}

// TC-UNIT-007: AssetType Constants
func TestAssetTypeConstants(t *testing.T) {
	assert.Equal(t, AssetType("database"), AssetTypeDatabase)
	assert.Equal(t, AssetType("table"), AssetTypeTable)
	assert.Equal(t, AssetType("column"), AssetTypeColumn)
}

// TC-UNIT-008: SearchResult Entity
func TestSearchResultEntity(t *testing.T) {
	result := SearchResult{
		ID:           "result-001",
		Type:         AssetTypeColumn,
		DatabaseName: "test_db",
		TableName:    "users",
		ColumnName:   "email",
		MatchedOn:    "column_name",
		Score:        0.95,
	}

	// Verify all fields serialize correctly
	jsonBytes, err := json.Marshal(result)
	require.NoError(t, err)

	var unmarshaled SearchResult
	err = json.Unmarshal(jsonBytes, &unmarshaled)
	require.NoError(t, err)

	assert.Equal(t, result.ID, unmarshaled.ID)
	assert.Equal(t, result.Type, unmarshaled.Type)
	assert.Equal(t, result.MatchedOn, unmarshaled.MatchedOn)

	// Score allows for result ordering
	assert.InDelta(t, 0.95, unmarshaled.Score, 0.001)
}

// Test JSON omitempty behavior
func TestJSONOmitEmpty(t *testing.T) {
	// Database with empty optional fields
	db := Database{
		ID:   "db-001",
		Name: "test_db",
	}

	jsonBytes, err := json.Marshal(db)
	require.NoError(t, err)

	jsonStr := string(jsonBytes)
	assert.NotContains(t, jsonStr, `"ownerName"`)
	assert.NotContains(t, jsonStr, `"commentString"`)

	// Column with empty optional fields
	col := Column{
		ID:             "col-001",
		DatabaseName:   "test_db",
		TableName:      "users",
		ColumnName:     "id",
		ColumnType:     "INTEGER",
		ColumnPosition: 1,
	}

	jsonBytes, err = json.Marshal(col)
	require.NoError(t, err)

	jsonStr = string(jsonBytes)
	assert.NotContains(t, jsonStr, `"columnLength"`)
	assert.NotContains(t, jsonStr, `"commentString"`)
}

// Test LineageGraph empty initialization
func TestLineageGraphEmpty(t *testing.T) {
	graph := LineageGraph{
		Nodes: []LineageNode{},
		Edges: []LineageEdge{},
	}

	assert.Empty(t, graph.Nodes)
	assert.Empty(t, graph.Edges)

	// Should serialize to empty arrays, not null
	jsonBytes, err := json.Marshal(graph)
	require.NoError(t, err)

	jsonStr := string(jsonBytes)
	assert.Contains(t, jsonStr, `"nodes":[]`)
	assert.Contains(t, jsonStr, `"edges":[]`)
}
