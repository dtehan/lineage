package application

import (
	"context"

	"github.com/your-org/lineage-api/internal/domain"
)

// SearchService provides search-related use cases.
type SearchService struct {
	searchRepo domain.SearchRepository
}

// NewSearchService creates a new SearchService.
func NewSearchService(searchRepo domain.SearchRepository) *SearchService {
	return &SearchService{
		searchRepo: searchRepo,
	}
}

// Search searches for assets.
func (s *SearchService) Search(ctx context.Context, req SearchRequest) (*SearchResponse, error) {
	// Convert string asset types to domain.AssetType
	var assetTypes []domain.AssetType
	for _, t := range req.AssetTypes {
		assetTypes = append(assetTypes, domain.AssetType(t))
	}

	// Default limit if not specified
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
