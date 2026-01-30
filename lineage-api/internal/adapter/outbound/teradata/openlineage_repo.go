package teradata

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/lineage-api/internal/domain"
)

// OpenLineageRepository implements domain.OpenLineageRepository using Teradata.
type OpenLineageRepository struct {
	db *sql.DB
}

// NewOpenLineageRepository creates a new OpenLineageRepository.
func NewOpenLineageRepository(db *sql.DB) *OpenLineageRepository {
	return &OpenLineageRepository{db: db}
}

// Ensure interface compliance
var _ domain.OpenLineageRepository = (*OpenLineageRepository)(nil)

// Namespace operations

// GetNamespace retrieves a namespace by its ID.
func (r *OpenLineageRepository) GetNamespace(ctx context.Context, namespaceID string) (*domain.OpenLineageNamespace, error) {
	query := `
		SELECT namespace_id, namespace_uri, description, spec_version, created_at
		FROM demo_user.OL_NAMESPACE
		WHERE namespace_id = ?`

	var ns domain.OpenLineageNamespace
	var createdAt sql.NullTime
	var description sql.NullString

	err := r.db.QueryRowContext(ctx, query, namespaceID).Scan(
		&ns.ID, &ns.URI, &description, &ns.SpecVersion, &createdAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get namespace: %w", err)
	}

	ns.Description = description.String
	if createdAt.Valid {
		ns.CreatedAt = createdAt.Time
	}
	return &ns, nil
}

// GetNamespaceByURI retrieves a namespace by its URI.
func (r *OpenLineageRepository) GetNamespaceByURI(ctx context.Context, uri string) (*domain.OpenLineageNamespace, error) {
	query := `
		SELECT namespace_id, namespace_uri, description, spec_version, created_at
		FROM demo_user.OL_NAMESPACE
		WHERE namespace_uri = ?`

	var ns domain.OpenLineageNamespace
	var createdAt sql.NullTime
	var description sql.NullString

	err := r.db.QueryRowContext(ctx, query, uri).Scan(
		&ns.ID, &ns.URI, &description, &ns.SpecVersion, &createdAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get namespace by URI: %w", err)
	}

	ns.Description = description.String
	if createdAt.Valid {
		ns.CreatedAt = createdAt.Time
	}
	return &ns, nil
}

// ListNamespaces retrieves all namespaces.
func (r *OpenLineageRepository) ListNamespaces(ctx context.Context) ([]domain.OpenLineageNamespace, error) {
	query := `
		SELECT namespace_id, namespace_uri, description, spec_version, created_at
		FROM demo_user.OL_NAMESPACE
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list namespaces: %w", err)
	}
	defer rows.Close()

	var namespaces []domain.OpenLineageNamespace
	for rows.Next() {
		var ns domain.OpenLineageNamespace
		var createdAt sql.NullTime
		var description sql.NullString

		if err := rows.Scan(&ns.ID, &ns.URI, &description, &ns.SpecVersion, &createdAt); err != nil {
			return nil, fmt.Errorf("scan namespace: %w", err)
		}
		ns.Description = description.String
		if createdAt.Valid {
			ns.CreatedAt = createdAt.Time
		}
		namespaces = append(namespaces, ns)
	}
	return namespaces, rows.Err()
}

// Dataset operations

// GetDataset retrieves a dataset by its ID.
func (r *OpenLineageRepository) GetDataset(ctx context.Context, datasetID string) (*domain.OpenLineageDataset, error) {
	query := `
		SELECT dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active
		FROM demo_user.OL_DATASET
		WHERE dataset_id = ?`

	var ds domain.OpenLineageDataset
	var description, sourceType sql.NullString
	var createdAt, updatedAt sql.NullTime
	var isActive string

	err := r.db.QueryRowContext(ctx, query, datasetID).Scan(
		&ds.ID, &ds.NamespaceID, &ds.Name, &description, &sourceType,
		&createdAt, &updatedAt, &isActive,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get dataset: %w", err)
	}

	ds.Description = description.String
	ds.SourceType = sourceType.String
	ds.IsActive = isActive == "Y"
	if createdAt.Valid {
		ds.CreatedAt = createdAt.Time
	}
	if updatedAt.Valid {
		ds.UpdatedAt = updatedAt.Time
	}
	return &ds, nil
}

// ListDatasets retrieves datasets for a namespace with pagination.
func (r *OpenLineageRepository) ListDatasets(ctx context.Context, namespaceID string, limit, offset int) ([]domain.OpenLineageDataset, int, error) {
	countQuery := `SELECT COUNT(*) FROM demo_user.OL_DATASET WHERE namespace_id = ? AND is_active = 'Y'`
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, namespaceID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count datasets: %w", err)
	}

	query := `
		SELECT dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active
		FROM demo_user.OL_DATASET
		WHERE namespace_id = ? AND is_active = 'Y'
		ORDER BY name
		OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`

	rows, err := r.db.QueryContext(ctx, query, namespaceID, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("list datasets: %w", err)
	}
	defer rows.Close()

	var datasets []domain.OpenLineageDataset
	for rows.Next() {
		var ds domain.OpenLineageDataset
		var description, sourceType sql.NullString
		var createdAt, updatedAt sql.NullTime
		var isActive string

		if err := rows.Scan(&ds.ID, &ds.NamespaceID, &ds.Name, &description, &sourceType,
			&createdAt, &updatedAt, &isActive); err != nil {
			return nil, 0, fmt.Errorf("scan dataset: %w", err)
		}
		ds.Description = description.String
		ds.SourceType = sourceType.String
		ds.IsActive = isActive == "Y"
		if createdAt.Valid {
			ds.CreatedAt = createdAt.Time
		}
		if updatedAt.Valid {
			ds.UpdatedAt = updatedAt.Time
		}
		datasets = append(datasets, ds)
	}
	return datasets, total, rows.Err()
}

// SearchDatasets searches datasets by name pattern.
func (r *OpenLineageRepository) SearchDatasets(ctx context.Context, query string, limit int) ([]domain.OpenLineageDataset, error) {
	sqlQuery := `
		SELECT dataset_id, namespace_id, name, description, source_type, created_at, updated_at, is_active
		FROM demo_user.OL_DATASET
		WHERE is_active = 'Y' AND UPPER(name) LIKE UPPER(?)
		ORDER BY name
		FETCH FIRST ? ROWS ONLY`

	rows, err := r.db.QueryContext(ctx, sqlQuery, "%"+query+"%", limit)
	if err != nil {
		return nil, fmt.Errorf("search datasets: %w", err)
	}
	defer rows.Close()

	var datasets []domain.OpenLineageDataset
	for rows.Next() {
		var ds domain.OpenLineageDataset
		var description, sourceType sql.NullString
		var createdAt, updatedAt sql.NullTime
		var isActive string

		if err := rows.Scan(&ds.ID, &ds.NamespaceID, &ds.Name, &description, &sourceType,
			&createdAt, &updatedAt, &isActive); err != nil {
			return nil, fmt.Errorf("scan dataset: %w", err)
		}
		ds.Description = description.String
		ds.SourceType = sourceType.String
		ds.IsActive = isActive == "Y"
		if createdAt.Valid {
			ds.CreatedAt = createdAt.Time
		}
		if updatedAt.Valid {
			ds.UpdatedAt = updatedAt.Time
		}
		datasets = append(datasets, ds)
	}
	return datasets, rows.Err()
}
