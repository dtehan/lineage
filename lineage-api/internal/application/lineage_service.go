package application

import (
	"context"

	"github.com/lineage-api/internal/domain"
)

type LineageService struct {
	lineageRepo domain.LineageRepository
}

func NewLineageService(lineageRepo domain.LineageRepository) *LineageService {
	return &LineageService{lineageRepo: lineageRepo}
}

func (s *LineageService) GetLineageGraph(ctx context.Context, req GetLineageRequest) (*LineageGraphResponse, error) {
	graph, err := s.lineageRepo.GetLineageGraph(ctx, req.AssetID, req.Direction, req.MaxDepth)
	if err != nil {
		return nil, err
	}

	return &LineageGraphResponse{
		AssetID: req.AssetID,
		Nodes:   graph.Nodes,
		Edges:   graph.Edges,
	}, nil
}

func (s *LineageService) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) (*LineageResponse, error) {
	lineage, err := s.lineageRepo.GetUpstreamLineage(ctx, columnID, maxDepth)
	if err != nil {
		return nil, err
	}
	return &LineageResponse{Lineage: lineage}, nil
}

func (s *LineageService) GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) (*LineageResponse, error) {
	lineage, err := s.lineageRepo.GetDownstreamLineage(ctx, columnID, maxDepth)
	if err != nil {
		return nil, err
	}
	return &LineageResponse{Lineage: lineage}, nil
}

func (s *LineageService) GetImpactAnalysis(ctx context.Context, columnID string, maxDepth int) (*ImpactAnalysisResponse, error) {
	downstream, err := s.lineageRepo.GetDownstreamLineage(ctx, columnID, maxDepth)
	if err != nil {
		return nil, err
	}

	impactedAssets := make([]ImpactedAsset, 0, len(downstream))
	byDatabase := make(map[string]int)
	byDepth := make(map[int]int)

	for _, lineage := range downstream {
		impactType := "direct"
		if lineage.Depth > 1 {
			impactType = "indirect"
		}
		asset := ImpactedAsset{
			ID:           lineage.TargetColumnID,
			DatabaseName: lineage.TargetDatabase,
			TableName:    lineage.TargetTable,
			ColumnName:   lineage.TargetColumn,
			Depth:        lineage.Depth,
			ImpactType:   impactType,
		}
		impactedAssets = append(impactedAssets, asset)
		byDatabase[lineage.TargetDatabase]++
		byDepth[lineage.Depth]++
	}

	return &ImpactAnalysisResponse{
		SourceAsset:         columnID,
		TotalImpactedAssets: len(impactedAssets),
		ImpactedAssets:      impactedAssets,
		Summary: ImpactSummary{
			TotalImpacted: len(impactedAssets),
			ByDatabase:    byDatabase,
			ByDepth:       byDepth,
		},
	}, nil
}
