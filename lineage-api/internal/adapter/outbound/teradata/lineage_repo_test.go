package teradata

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TC-UNIT-020: TeradataLineageRepository GetLineageGraph
func TestLineageRepository_GetLineageGraph(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	graph, err := repo.GetLineageGraph(context.Background(), "demo_user.STG_CUSTOMER.customer_id", "both", 5)
	require.NoError(t, err)

	// Verify root node is included
	rootFound := false
	for _, node := range graph.Nodes {
		if node.ID == "demo_user.STG_CUSTOMER.customer_id" {
			rootFound = true
			assert.Equal(t, "column", node.Type)
			assert.Equal(t, "demo_user", node.DatabaseName)
			assert.Equal(t, "STG_CUSTOMER", node.TableName)
			assert.Equal(t, "customer_id", node.ColumnName)
			// Verify metadata is populated
			assert.NotNil(t, node.Metadata)
			assert.Equal(t, "INTEGER", node.Metadata["columnType"])
			break
		}
	}
	assert.True(t, rootFound, "Root node should be included in graph")

	// Verify no duplicate nodes
	nodeIDs := make(map[string]bool)
	for _, node := range graph.Nodes {
		assert.False(t, nodeIDs[node.ID], "Node %s should not be duplicated", node.ID)
		nodeIDs[node.ID] = true
	}

	// Verify all edges have valid source and target references
	for _, edge := range graph.Edges {
		assert.True(t, nodeIDs[edge.Source], "Edge source %s should exist in nodes", edge.Source)
		assert.True(t, nodeIDs[edge.Target], "Edge target %s should exist in nodes", edge.Target)
	}
}

func TestLineageRepository_GetLineageGraph_UpstreamOnly(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	graph, err := repo.GetLineageGraph(context.Background(), "demo_user.STG_CUSTOMER.customer_id", "upstream", 5)
	require.NoError(t, err)

	// Should have the root node and upstream source
	assert.GreaterOrEqual(t, len(graph.Nodes), 1)

	// Verify root node exists
	rootFound := false
	for _, node := range graph.Nodes {
		if node.ID == "demo_user.STG_CUSTOMER.customer_id" {
			rootFound = true
			break
		}
	}
	assert.True(t, rootFound, "Root node should be included")
}

func TestLineageRepository_GetLineageGraph_DownstreamOnly(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	graph, err := repo.GetLineageGraph(context.Background(), "demo_user.STG_CUSTOMER.customer_id", "downstream", 5)
	require.NoError(t, err)

	// Should have at least the root node
	assert.GreaterOrEqual(t, len(graph.Nodes), 1)

	// Verify root node exists
	rootFound := false
	for _, node := range graph.Nodes {
		if node.ID == "demo_user.STG_CUSTOMER.customer_id" {
			rootFound = true
			break
		}
	}
	assert.True(t, rootFound, "Root node should be included")
}

func TestLineageRepository_GetLineageGraph_PreservesNodeMetadata(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	graph, err := repo.GetLineageGraph(context.Background(), "demo_user.SRC_CUSTOMER.customer_id", "downstream", 5)
	require.NoError(t, err)

	// Find the source node and verify metadata
	for _, node := range graph.Nodes {
		if node.ID == "demo_user.SRC_CUSTOMER.customer_id" {
			assert.Equal(t, "column", node.Type)
			assert.Equal(t, "demo_user", node.DatabaseName)
			assert.Equal(t, "SRC_CUSTOMER", node.TableName)
			assert.Equal(t, "customer_id", node.ColumnName)
			// Verify metadata is populated with column type
			assert.NotNil(t, node.Metadata)
			assert.Equal(t, "INTEGER", node.Metadata["columnType"])
			return
		}
	}
	t.Error("Source node not found in graph")
}

func TestLineageRepository_GetLineageGraph_PreservesEdgeMetadata(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	graph, err := repo.GetLineageGraph(context.Background(), "demo_user.SRC_CUSTOMER.customer_id", "downstream", 1)
	require.NoError(t, err)

	// Find an edge and verify metadata is preserved
	for _, edge := range graph.Edges {
		if edge.Source == "demo_user.SRC_CUSTOMER.customer_id" {
			assert.NotEmpty(t, edge.ID)
			assert.Equal(t, "demo_user.SRC_CUSTOMER.customer_id", edge.Source)
			assert.NotEmpty(t, edge.Target)
			assert.NotEmpty(t, edge.TransformationType)
			return
		}
	}
}

func TestLineageRepository_GetLineageGraph_ColumnTypeInMetadata(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	// Test various column types
	testCases := []struct {
		columnID     string
		expectedType string
	}{
		{"demo_user.SRC_CUSTOMER.customer_id", "INTEGER"},
		{"demo_user.SRC_CUSTOMER.first_name", "VARCHAR(100)"},
		{"demo_user.SRC_CUSTOMER.email", "VARCHAR(255)"},
		{"demo_user.SRC_SALES.sale_date", "DATE"},
		{"demo_user.SRC_PRODUCT.price", "DECIMAL(10,2)"},
	}

	for _, tc := range testCases {
		t.Run(tc.columnID, func(t *testing.T) {
			graph, err := repo.GetLineageGraph(context.Background(), tc.columnID, "both", 1)
			require.NoError(t, err)

			// Find the node and verify column type
			for _, node := range graph.Nodes {
				if node.ID == tc.columnID {
					assert.NotNil(t, node.Metadata, "Metadata should be populated for %s", tc.columnID)
					assert.Equal(t, tc.expectedType, node.Metadata["columnType"], "Column type should match for %s", tc.columnID)
					return
				}
			}
			t.Errorf("Node %s not found in graph", tc.columnID)
		})
	}
}

func TestLineageRepository_GetUpstreamLineage(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	lineage, err := repo.GetUpstreamLineage(context.Background(), "demo_user.STG_CUSTOMER.customer_id", 5)
	require.NoError(t, err)

	// Should find upstream source
	assert.GreaterOrEqual(t, len(lineage), 1)

	// Verify lineage points to the correct target
	for _, lin := range lineage {
		assert.Equal(t, "demo_user.STG_CUSTOMER.customer_id", lin.TargetColumnID)
	}
}

func TestLineageRepository_GetDownstreamLineage(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	lineage, err := repo.GetDownstreamLineage(context.Background(), "demo_user.SRC_CUSTOMER.customer_id", 5)
	require.NoError(t, err)

	// Should find downstream targets
	assert.GreaterOrEqual(t, len(lineage), 1)

	// Verify lineage comes from the correct source
	for _, lin := range lineage {
		if lin.Depth == 1 {
			assert.Equal(t, "demo_user.SRC_CUSTOMER.customer_id", lin.SourceColumnID)
		}
	}
}

func TestLineageRepository_GetDirectLineage(t *testing.T) {
	assetRepo := NewAssetRepository()
	repo := NewLineageRepository(assetRepo)

	lineage, err := repo.GetDirectLineage(context.Background(), "demo_user.STG_CUSTOMER.customer_id")
	require.NoError(t, err)

	// Should find direct relationships
	for _, lin := range lineage {
		// Direct lineage should have this column as either source or target
		isSource := lin.SourceColumnID == "demo_user.STG_CUSTOMER.customer_id"
		isTarget := lin.TargetColumnID == "demo_user.STG_CUSTOMER.customer_id"
		assert.True(t, isSource || isTarget, "Column should be either source or target in direct lineage")
	}
}
