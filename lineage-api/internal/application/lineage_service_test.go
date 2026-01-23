package application

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/lineage-api/internal/domain"
	"github.com/lineage-api/internal/domain/mocks"
)

// TC-UNIT-010: LineageService GetLineageGraph
func TestLineageServiceGetLineageGraph(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure lineage repo with graph data
	lineageRepo.GraphData["col-001"] = &domain.LineageGraph{
		Nodes: []domain.LineageNode{
			{ID: "col-001", Type: "column", DatabaseName: "test_db", TableName: "test_table", ColumnName: "test_col"},
			{ID: "col-src-001", Type: "column", DatabaseName: "source_db", TableName: "source_table", ColumnName: "source_col"},
		},
		Edges: []domain.LineageEdge{
			{ID: "lin-001", Source: "col-src-001", Target: "col-001", TransformationType: "DIRECT"},
		},
	}

	service := NewLineageService(lineageRepo)

	req := GetLineageRequest{
		AssetID:   "col-001",
		Direction: "both",
		MaxDepth:  5,
	}

	response, err := service.GetLineageGraph(context.Background(), req)

	require.NoError(t, err)
	assert.NotNil(t, response)
	assert.Equal(t, "col-001", response.AssetID)
	assert.Len(t, response.Nodes, 2)
	assert.Len(t, response.Edges, 1)
}

// TC-UNIT-012: LineageService GetUpstreamLineage
func TestLineageServiceGetUpstreamLineage(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure upstream data
	lineageRepo.UpstreamData["col-001"] = []domain.ColumnLineage{
		{
			LineageID:      "lin-001",
			SourceColumnID: "col-src-001",
			TargetColumnID: "col-001",
			Depth:          1,
		},
		{
			LineageID:      "lin-002",
			SourceColumnID: "col-src-002",
			TargetColumnID: "col-src-001",
			Depth:          2,
		},
	}

	service := NewLineageService(lineageRepo)

	response, err := service.GetUpstreamLineage(context.Background(), "col-001", 10)

	require.NoError(t, err)
	assert.Len(t, response.Lineage, 2)
}

// TC-UNIT-013: LineageService GetDownstreamLineage
func TestLineageServiceGetDownstreamLineage(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure downstream data
	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{
		{
			LineageID:      "lin-001",
			SourceColumnID: "col-001",
			TargetColumnID: "col-tgt-001",
			Depth:          1,
		},
		{
			LineageID:      "lin-002",
			SourceColumnID: "col-tgt-001",
			TargetColumnID: "col-tgt-002",
			Depth:          2,
		},
	}

	service := NewLineageService(lineageRepo)

	response, err := service.GetDownstreamLineage(context.Background(), "col-001", 10)

	require.NoError(t, err)
	assert.Len(t, response.Lineage, 2)
}

// TC-UNIT-014: LineageService GetImpactAnalysis
func TestLineageServiceGetImpactAnalysis(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure multi-depth downstream data
	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{
		{
			LineageID:      "lin-001",
			SourceColumnID: "col-001",
			TargetColumnID: "col-tgt-001",
			TargetDatabase: "db1",
			TargetTable:    "table1",
			TargetColumn:   "col1",
			Depth:          1,
		},
		{
			LineageID:      "lin-002",
			SourceColumnID: "col-tgt-001",
			TargetColumnID: "col-tgt-002",
			TargetDatabase: "db1",
			TargetTable:    "table2",
			TargetColumn:   "col2",
			Depth:          2,
		},
		{
			LineageID:      "lin-003",
			SourceColumnID: "col-001",
			TargetColumnID: "col-tgt-003",
			TargetDatabase: "db2",
			TargetTable:    "table3",
			TargetColumn:   "col3",
			Depth:          1,
		},
	}

	service := NewLineageService(lineageRepo)

	response, err := service.GetImpactAnalysis(context.Background(), "col-001", 10)

	require.NoError(t, err)
	assert.Equal(t, "col-001", response.SourceAsset)

	// Verify ImpactedAssets
	assert.Len(t, response.ImpactedAssets, 3)

	// Verify impact categorization
	var directCount, indirectCount int
	for _, asset := range response.ImpactedAssets {
		if asset.ImpactType == "direct" {
			directCount++
		} else if asset.ImpactType == "indirect" {
			indirectCount++
		}
	}
	assert.Equal(t, 2, directCount, "Depth=1 assets should be direct")
	assert.Equal(t, 1, indirectCount, "Depth>1 assets should be indirect")

	// Verify summary statistics
	assert.Equal(t, 3, response.Summary.TotalImpacted)

	// Verify byDatabase grouping
	assert.Equal(t, 2, response.Summary.ByDatabase["db1"])
	assert.Equal(t, 1, response.Summary.ByDatabase["db2"])

	// Verify byDepth grouping
	assert.Equal(t, 2, response.Summary.ByDepth[1])
	assert.Equal(t, 1, response.Summary.ByDepth[2])
}

// Test GetImpactAnalysis with error
func TestLineageServiceGetImpactAnalysis_Error(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure error
	lineageRepo.GetDownstreamLineageErr = errors.New("database error")

	service := NewLineageService(lineageRepo)

	_, err := service.GetImpactAnalysis(context.Background(), "col-001", 10)

	assert.Error(t, err)
}

// Test GetLineageGraph with error
func TestLineageServiceGetLineageGraph_Error(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure repository error
	lineageRepo.GetLineageGraphErr = errors.New("database error")

	service := NewLineageService(lineageRepo)

	req := GetLineageRequest{
		AssetID:   "col-001",
		Direction: "both",
		MaxDepth:  5,
	}

	_, err := service.GetLineageGraph(context.Background(), req)

	assert.Error(t, err)
}

// Test GetUpstreamLineage with error
func TestLineageServiceGetUpstreamLineage_Error(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure error
	lineageRepo.GetUpstreamLineageErr = errors.New("database error")

	service := NewLineageService(lineageRepo)

	_, err := service.GetUpstreamLineage(context.Background(), "col-001", 10)

	assert.Error(t, err)
}

// Test GetDownstreamLineage with error
func TestLineageServiceGetDownstreamLineage_Error(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure error
	lineageRepo.GetDownstreamLineageErr = errors.New("database error")

	service := NewLineageService(lineageRepo)

	_, err := service.GetDownstreamLineage(context.Background(), "col-001", 10)

	assert.Error(t, err)
}

// Test empty lineage results
func TestLineageServiceGetLineageGraph_EmptyResults(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure empty graph
	lineageRepo.GraphData["col-001"] = &domain.LineageGraph{
		Nodes: []domain.LineageNode{},
		Edges: []domain.LineageEdge{},
	}

	service := NewLineageService(lineageRepo)

	req := GetLineageRequest{
		AssetID:   "col-001",
		Direction: "both",
		MaxDepth:  5,
	}

	response, err := service.GetLineageGraph(context.Background(), req)

	require.NoError(t, err)
	assert.NotNil(t, response)
	assert.Equal(t, "col-001", response.AssetID)
	assert.Empty(t, response.Nodes)
	assert.Empty(t, response.Edges)
}

// Test impact analysis with empty downstream
func TestLineageServiceGetImpactAnalysis_NoImpact(t *testing.T) {
	lineageRepo := mocks.NewMockLineageRepository()

	// Configure empty downstream data
	lineageRepo.DownstreamData["col-001"] = []domain.ColumnLineage{}

	service := NewLineageService(lineageRepo)

	response, err := service.GetImpactAnalysis(context.Background(), "col-001", 10)

	require.NoError(t, err)
	assert.Equal(t, "col-001", response.SourceAsset)
	assert.Empty(t, response.ImpactedAssets)
	assert.Equal(t, 0, response.Summary.TotalImpacted)
}
