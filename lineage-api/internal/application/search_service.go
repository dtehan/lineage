package application

import (
	"context"

	"github.com/lineage-api/internal/domain"
)

type SearchService struct {
	searchRepo domain.SearchRepository
}

func NewSearchService(searchRepo domain.SearchRepository) *SearchService {
	return &SearchService{searchRepo: searchRepo}
}

func (s *SearchService) Search(ctx context.Context, req SearchRequest) (*SearchResponse, error) {
	assetTypes := make([]domain.AssetType, 0, len(req.AssetTypes))
	for _, t := range req.AssetTypes {
		assetTypes = append(assetTypes, domain.AssetType(t))
	}

	limit := req.Limit
	if limit <= 0 {
		limit = 50
	}

	results, err := s.searchRepo.Search(ctx, req.Query, assetTypes, limit)
	if err != nil {
		return nil, err
	}

	return &SearchResponse{
		Results: results,
		Total:   len(results),
		Query:   req.Query,
	}, nil
}
