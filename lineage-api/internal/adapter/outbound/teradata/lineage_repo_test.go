package teradata

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/your-org/lineage-api/internal/domain"
)

// TC-UNIT-020: TeradataLineageRepository BuildGraph
func TestLineageRepository_BuildGraph(t *testing.T) {
	repo := &LineageRepository{}

	upstream := []domain.ColumnLineage{
		{
			LineageID:          "lin-001",
			SourceColumnID:     "col-src-001",
			SourceDatabase:     "source_db",
			SourceTable:        "source_table",
			SourceColumn:       "source_col",
			TargetColumnID:     "col-root",
			TargetDatabase:     "root_db",
			TargetTable:        "root_table",
			TargetColumn:       "root_col",
			TransformationType: "DIRECT",
			ConfidenceScore:    0.95,
		},
		{
			LineageID:          "lin-002",
			SourceColumnID:     "col-src-002",
			SourceDatabase:     "source_db",
			SourceTable:        "source_table2",
			SourceColumn:       "source_col2",
			TargetColumnID:     "col-src-001",
			TargetDatabase:     "source_db",
			TargetTable:        "source_table",
			TargetColumn:       "source_col",
			TransformationType: "TRANSFORM",
			ConfidenceScore:    0.85,
		},
	}

	downstream := []domain.ColumnLineage{
		{
			LineageID:          "lin-003",
			SourceColumnID:     "col-root",
			SourceDatabase:     "root_db",
			SourceTable:        "root_table",
			SourceColumn:       "root_col",
			TargetColumnID:     "col-tgt-001",
			TargetDatabase:     "target_db",
			TargetTable:        "target_table",
			TargetColumn:       "target_col",
			TransformationType: "AGGREGATE",
			ConfidenceScore:    0.90,
		},
	}

	graph := repo.buildGraph("col-root", upstream, downstream)

	// Verify root node is included
	rootFound := false
	for _, node := range graph.Nodes {
		if node.ID == "col-root" {
			rootFound = true
			assert.Equal(t, "column", node.Type)
			break
		}
	}
	assert.True(t, rootFound, "Root node should be included in graph")

	// Verify no duplicate nodes (nodeMap deduplication works)
	nodeIDs := make(map[string]bool)
	for _, node := range graph.Nodes {
		assert.False(t, nodeIDs[node.ID], "Node %s should not be duplicated", node.ID)
		nodeIDs[node.ID] = true
	}

	// Verify all unique nodes are created (root + 2 upstream sources + 1 downstream target)
	// Note: col-src-001 appears in both upstream lineages but should only be counted once
	expectedNodeCount := 4 // col-root, col-src-001, col-src-002, col-tgt-001
	assert.Equal(t, expectedNodeCount, len(graph.Nodes))

	// Verify all edges are created
	assert.Equal(t, 3, len(graph.Edges))

	// Verify all edges have valid source and target references
	for _, edge := range graph.Edges {
		assert.True(t, nodeIDs[edge.Source], "Edge source %s should exist in nodes", edge.Source)
		assert.True(t, nodeIDs[edge.Target], "Edge target %s should exist in nodes", edge.Target)
	}

	// Verify edge properties are preserved
	for _, edge := range graph.Edges {
		if edge.ID == "lin-001" {
			assert.Equal(t, "DIRECT", edge.TransformationType)
			assert.InDelta(t, 0.95, edge.ConfidenceScore, 0.001)
		}
	}
}

func TestLineageRepository_BuildGraph_EmptyLineage(t *testing.T) {
	repo := &LineageRepository{}

	graph := repo.buildGraph("col-root", []domain.ColumnLineage{}, []domain.ColumnLineage{})

	// Should only have root node
	assert.Len(t, graph.Nodes, 1)
	assert.Equal(t, "col-root", graph.Nodes[0].ID)

	// Should have no edges
	assert.Empty(t, graph.Edges)
}

func TestLineageRepository_BuildGraph_UpstreamOnly(t *testing.T) {
	repo := &LineageRepository{}

	upstream := []domain.ColumnLineage{
		{
			LineageID:      "lin-001",
			SourceColumnID: "col-src-001",
			SourceDatabase: "source_db",
			SourceTable:    "source_table",
			SourceColumn:   "source_col",
			TargetColumnID: "col-root",
			TargetDatabase: "root_db",
			TargetTable:    "root_table",
			TargetColumn:   "root_col",
		},
	}

	graph := repo.buildGraph("col-root", upstream, []domain.ColumnLineage{})

	// Should have root + 1 upstream source
	assert.Len(t, graph.Nodes, 2)
	assert.Len(t, graph.Edges, 1)
}

func TestLineageRepository_BuildGraph_DownstreamOnly(t *testing.T) {
	repo := &LineageRepository{}

	downstream := []domain.ColumnLineage{
		{
			LineageID:      "lin-001",
			SourceColumnID: "col-root",
			SourceDatabase: "root_db",
			SourceTable:    "root_table",
			SourceColumn:   "root_col",
			TargetColumnID: "col-tgt-001",
			TargetDatabase: "target_db",
			TargetTable:    "target_table",
			TargetColumn:   "target_col",
		},
	}

	graph := repo.buildGraph("col-root", []domain.ColumnLineage{}, downstream)

	// Should have root + 1 downstream target
	assert.Len(t, graph.Nodes, 2)
	assert.Len(t, graph.Edges, 1)
}

func TestLineageRepository_BuildGraph_NodeDeduplication(t *testing.T) {
	repo := &LineageRepository{}

	// Create lineage where the same node appears multiple times
	upstream := []domain.ColumnLineage{
		{
			LineageID:      "lin-001",
			SourceColumnID: "col-shared",
			SourceDatabase: "shared_db",
			SourceTable:    "shared_table",
			SourceColumn:   "shared_col",
			TargetColumnID: "col-root",
		},
	}

	downstream := []domain.ColumnLineage{
		{
			LineageID:      "lin-002",
			SourceColumnID: "col-root",
			TargetColumnID: "col-shared", // Same node as upstream source
			TargetDatabase: "shared_db",
			TargetTable:    "shared_table",
			TargetColumn:   "shared_col",
		},
	}

	graph := repo.buildGraph("col-root", upstream, downstream)

	// Should deduplicate col-shared
	assert.Len(t, graph.Nodes, 2) // col-root and col-shared
	assert.Len(t, graph.Edges, 2)

	// Verify only unique node IDs
	nodeIDs := make(map[string]int)
	for _, node := range graph.Nodes {
		nodeIDs[node.ID]++
	}

	for id, count := range nodeIDs {
		assert.Equal(t, 1, count, "Node %s should appear exactly once", id)
	}
}

func TestLineageRepository_BuildGraph_PreservesNodeMetadata(t *testing.T) {
	repo := &LineageRepository{}

	upstream := []domain.ColumnLineage{
		{
			LineageID:      "lin-001",
			SourceColumnID: "col-src-001",
			SourceDatabase: "source_db",
			SourceTable:    "source_table",
			SourceColumn:   "source_col",
			TargetColumnID: "col-root",
			TargetDatabase: "root_db",
			TargetTable:    "root_table",
			TargetColumn:   "root_col",
		},
	}

	graph := repo.buildGraph("col-root", upstream, []domain.ColumnLineage{})

	// Find the source node and verify metadata
	for _, node := range graph.Nodes {
		if node.ID == "col-src-001" {
			assert.Equal(t, "column", node.Type)
			assert.Equal(t, "source_db", node.DatabaseName)
			assert.Equal(t, "source_table", node.TableName)
			assert.Equal(t, "source_col", node.ColumnName)
			return
		}
	}
	t.Error("Source node not found in graph")
}

func TestLineageRepository_BuildGraph_PreservesEdgeMetadata(t *testing.T) {
	repo := &LineageRepository{}

	downstream := []domain.ColumnLineage{
		{
			LineageID:          "lin-001",
			SourceColumnID:     "col-root",
			TargetColumnID:     "col-tgt-001",
			TransformationType: "AGGREGATE",
			ConfidenceScore:    0.87,
		},
	}

	graph := repo.buildGraph("col-root", []domain.ColumnLineage{}, downstream)

	assert.Len(t, graph.Edges, 1)

	edge := graph.Edges[0]
	assert.Equal(t, "lin-001", edge.ID)
	assert.Equal(t, "col-root", edge.Source)
	assert.Equal(t, "col-tgt-001", edge.Target)
	assert.Equal(t, "AGGREGATE", edge.TransformationType)
	assert.InDelta(t, 0.87, edge.ConfidenceScore, 0.001)
}
