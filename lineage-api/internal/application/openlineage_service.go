package application

import (
	"context"

	"github.com/lineage-api/internal/domain"
)

// OpenLineageService provides business logic for OpenLineage operations
type OpenLineageService struct {
	repo domain.OpenLineageRepository
}

// NewOpenLineageService creates a new OpenLineage service
func NewOpenLineageService(repo domain.OpenLineageRepository) *OpenLineageService {
	return &OpenLineageService{repo: repo}
}

// ListNamespaces returns all namespaces
func (s *OpenLineageService) ListNamespaces(ctx context.Context) ([]OpenLineageNamespaceResponse, error) {
	namespaces, err := s.repo.ListNamespaces(ctx)
	if err != nil {
		return nil, err
	}

	responses := make([]OpenLineageNamespaceResponse, len(namespaces))
	for i, ns := range namespaces {
		responses[i] = OpenLineageNamespaceResponse{
			ID:          ns.ID,
			URI:         ns.URI,
			Description: ns.Description,
			SpecVersion: ns.SpecVersion,
			CreatedAt:   ns.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
	}
	return responses, nil
}

// GetNamespace returns a specific namespace
func (s *OpenLineageService) GetNamespace(ctx context.Context, namespaceID string) (*OpenLineageNamespaceResponse, error) {
	ns, err := s.repo.GetNamespace(ctx, namespaceID)
	if err != nil {
		return nil, err
	}
	if ns == nil {
		return nil, nil
	}

	return &OpenLineageNamespaceResponse{
		ID:          ns.ID,
		URI:         ns.URI,
		Description: ns.Description,
		SpecVersion: ns.SpecVersion,
		CreatedAt:   ns.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}, nil
}

// ListDatasets returns datasets for a namespace with pagination
func (s *OpenLineageService) ListDatasets(ctx context.Context, namespaceID string, limit, offset int) (*PaginatedDatasetsResponse, error) {
	datasets, total, err := s.repo.ListDatasets(ctx, namespaceID, limit, offset)
	if err != nil {
		return nil, err
	}

	responses := make([]OpenLineageDatasetResponse, len(datasets))
	for i, ds := range datasets {
		responses[i] = s.datasetToResponse(ds)
	}

	hasNext := offset+limit < total
	return &PaginatedDatasetsResponse{
		Datasets: responses,
		Total:    total,
		Pagination: &PaginationMeta{
			TotalCount: total,
			Limit:      limit,
			Offset:     offset,
			HasNext:    hasNext,
		},
	}, nil
}

// GetDataset returns a specific dataset with its fields
func (s *OpenLineageService) GetDataset(ctx context.Context, datasetID string) (*OpenLineageDatasetResponse, error) {
	ds, err := s.repo.GetDataset(ctx, datasetID)
	if err != nil {
		return nil, err
	}
	if ds == nil {
		return nil, nil
	}

	response := s.datasetToResponse(*ds)

	// Get fields for this dataset
	fields, err := s.repo.ListFields(ctx, datasetID)
	if err != nil {
		return nil, err
	}

	response.Fields = make([]OpenLineageFieldResponse, len(fields))
	for i, f := range fields {
		response.Fields[i] = OpenLineageFieldResponse{
			ID:              f.ID,
			Name:            f.Name,
			Type:            f.Type,
			Description:     f.Description,
			OrdinalPosition: f.OrdinalPosition,
			Nullable:        f.Nullable,
		}
	}

	return &response, nil
}

// SearchDatasets searches datasets by name
func (s *OpenLineageService) SearchDatasets(ctx context.Context, query string, limit int) ([]OpenLineageDatasetResponse, error) {
	datasets, err := s.repo.SearchDatasets(ctx, query, limit)
	if err != nil {
		return nil, err
	}

	responses := make([]OpenLineageDatasetResponse, len(datasets))
	for i, ds := range datasets {
		responses[i] = s.datasetToResponse(ds)
	}
	return responses, nil
}

// GetLineageGraph returns the lineage graph for a field
func (s *OpenLineageService) GetLineageGraph(ctx context.Context, datasetID, fieldName, direction string, maxDepth int) (*OpenLineageLineageResponse, error) {
	// Validate and default direction
	if direction == "" {
		direction = "both"
	}

	// Get graph from repository
	graph, err := s.repo.GetColumnLineageGraph(ctx, datasetID, fieldName, direction, maxDepth)
	if err != nil {
		return nil, err
	}

	// Convert to response format
	response := &OpenLineageLineageResponse{
		DatasetID: datasetID,
		FieldName: fieldName,
		Direction: direction,
		MaxDepth:  maxDepth,
		Graph:     s.graphToResponse(graph),
	}

	return response, nil
}

// Helper methods

func (s *OpenLineageService) datasetToResponse(ds domain.OpenLineageDataset) OpenLineageDatasetResponse {
	return OpenLineageDatasetResponse{
		ID:          ds.ID,
		Namespace:   ds.NamespaceID,
		Name:        ds.Name,
		Description: ds.Description,
		SourceType:  ds.SourceType,
		CreatedAt:   ds.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:   ds.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

func (s *OpenLineageService) graphToResponse(graph *domain.OpenLineageGraph) *OpenLineageGraphResponse {
	if graph == nil {
		return &OpenLineageGraphResponse{
			Nodes: []OpenLineageNodeResponse{},
			Edges: []OpenLineageEdgeResponse{},
		}
	}

	nodes := make([]OpenLineageNodeResponse, len(graph.Nodes))
	for i, n := range graph.Nodes {
		nodes[i] = OpenLineageNodeResponse{
			ID:        n.ID,
			Type:      n.Type,
			Namespace: n.Namespace,
			Dataset:   n.Dataset,
			Field:     n.Field,
			Metadata:  n.Metadata,
		}
	}

	edges := make([]OpenLineageEdgeResponse, len(graph.Edges))
	for i, e := range graph.Edges {
		edges[i] = OpenLineageEdgeResponse{
			ID:                    e.ID,
			Source:                e.Source,
			Target:                e.Target,
			TransformationType:    string(e.TransformationType),
			TransformationSubtype: string(e.TransformationSubtype),
			ConfidenceScore:       e.ConfidenceScore,
		}
	}

	return &OpenLineageGraphResponse{
		Nodes: nodes,
		Edges: edges,
	}
}
