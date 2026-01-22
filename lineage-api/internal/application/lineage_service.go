package application

import (
	"context"
	"fmt"
	"strings"

	"github.com/your-org/lineage-api/internal/domain"
)

// parseAssetID parses an asset ID and returns the type and components.
// Column IDs have 3 parts: database.table.column
// Table IDs have 2 parts: database.table
func parseAssetID(assetID string) (assetType string, database, table, column string) {
	parts := strings.Split(assetID, ".")
	switch len(parts) {
	case 3:
		return "column", parts[0], parts[1], parts[2]
	case 2:
		return "table", parts[0], parts[1], ""
	case 1:
		return "database", parts[0], "", ""
	default:
		return "unknown", "", "", ""
	}
}

// LineageService provides lineage-related use cases.
type LineageService struct {
	lineageRepo domain.LineageRepository
	assetRepo   domain.AssetRepository
	cache       domain.CacheRepository
}

// NewLineageService creates a new LineageService.
func NewLineageService(
	lineageRepo domain.LineageRepository,
	assetRepo domain.AssetRepository,
	cache domain.CacheRepository,
) *LineageService {
	return &LineageService{
		lineageRepo: lineageRepo,
		assetRepo:   assetRepo,
		cache:       cache,
	}
}

// GetLineageGraph returns the lineage graph for an asset.
func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) (*LineageGraphResponse, error) {
	// Check cache first
	cacheKey := fmt.Sprintf("lineage:%s:%s:%d", req.AssetID, req.Direction, req.MaxDepth)
	var cached LineageGraphResponse
	if err := s.cache.Get(ctx, cacheKey, &cached); err == nil {
		return &cached, nil
	}

	// Determine asset type from ID format
	assetType, database, table, _ := parseAssetID(req.AssetID)

	var graph *domain.LineageGraph
	var err error

	if assetType == "table" {
		// For table-level lineage, aggregate lineage for all columns
		graph, err = s.getTableLineageGraph(ctx, database, table, req.MaxDepth)
	} else {
		// Column-level or other: use existing behavior
		graph, err = s.lineageRepo.GetLineageGraph(ctx, req.AssetID, req.MaxDepth)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to get lineage graph: %w", err)
	}

	response := &LineageGraphResponse{
		AssetID: req.AssetID,
		Graph:   *graph,
	}

	// Cache the result (5 minute TTL)
	_ = s.cache.Set(ctx, cacheKey, response, 300)

	return response, nil
}

// getTableLineageGraph aggregates lineage for all columns in a table.
func (s *LineageService) getTableLineageGraph(ctx context.Context, database, table string, maxDepth int) (*domain.LineageGraph, error) {
	// Get all columns for the table
	columns, err := s.assetRepo.ListColumns(ctx, database, table)
	if err != nil {
		return nil, fmt.Errorf("failed to list columns for table %s.%s: %w", database, table, err)
	}

	// Aggregate all nodes and edges
	nodeMap := make(map[string]domain.LineageNode)
	edgeMap := make(map[string]domain.LineageEdge)

	// Add a table-level root node
	tableID := fmt.Sprintf("%s.%s", database, table)
	nodeMap[tableID] = domain.LineageNode{
		ID:           tableID,
		Type:         "table",
		DatabaseName: database,
		TableName:    table,
	}

	// Get lineage for each column
	for _, col := range columns {
		colGraph, err := s.lineageRepo.GetLineageGraph(ctx, col.ID, maxDepth)
		if err != nil {
			// Log error but continue with other columns
			continue
		}

		// Merge nodes
		for _, node := range colGraph.Nodes {
			if _, exists := nodeMap[node.ID]; !exists {
				nodeMap[node.ID] = node
			}
		}

		// Merge edges (dedup by ID)
		for _, edge := range colGraph.Edges {
			if _, exists := edgeMap[edge.ID]; !exists {
				edgeMap[edge.ID] = edge
			}
		}
	}

	// Convert maps to slices
	nodes := make([]domain.LineageNode, 0, len(nodeMap))
	for _, node := range nodeMap {
		nodes = append(nodes, node)
	}

	edges := make([]domain.LineageEdge, 0, len(edgeMap))
	for _, edge := range edgeMap {
		edges = append(edges, edge)
	}

	return &domain.LineageGraph{
		Nodes: nodes,
		Edges: edges,
	}, nil
}

// GetUpstreamLineage returns upstream lineage for a column.
func (s *LineageService) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
	return s.lineageRepo.GetUpstreamLineage(ctx, columnID, maxDepth)
}

// GetDownstreamLineage returns downstream lineage for a column.
func (s *LineageService) GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
	return s.lineageRepo.GetDownstreamLineage(ctx, columnID, maxDepth)
}

// GetImpactAnalysis returns impact analysis for a column.
func (s *LineageService) GetImpactAnalysis(ctx context.Context, columnID string, maxDepth int) (*ImpactAnalysisResponse, error) {
	downstream, err := s.lineageRepo.GetDownstreamLineage(ctx, columnID, maxDepth)
	if err != nil {
		return nil, fmt.Errorf("failed to get downstream lineage: %w", err)
	}

	// Build impact analysis
	impactedAssets := make([]ImpactedAsset, 0, len(downstream))
	byDatabase := make(map[string]int)
	byDepth := make(map[int]int)

	for _, lineage := range downstream {
		asset := ImpactedAsset{
			ID:           lineage.TargetColumnID,
			DatabaseName: lineage.TargetDatabase,
			TableName:    lineage.TargetTable,
			ColumnName:   lineage.TargetColumn,
			Depth:        lineage.Depth,
			ImpactType:   "direct",
		}
		if lineage.Depth > 1 {
			asset.ImpactType = "indirect"
		}
		impactedAssets = append(impactedAssets, asset)
		byDatabase[lineage.TargetDatabase]++
		byDepth[lineage.Depth]++
	}

	return &ImpactAnalysisResponse{
		AssetID:        columnID,
		ImpactedAssets: impactedAssets,
		Summary: ImpactSummary{
			TotalImpacted: len(impactedAssets),
			ByDatabase:    byDatabase,
			ByDepth:       byDepth,
		},
	}, nil
}
