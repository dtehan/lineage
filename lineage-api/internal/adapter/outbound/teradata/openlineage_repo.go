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

// Field operations

// GetField retrieves a field by its ID.
func (r *OpenLineageRepository) GetField(ctx context.Context, fieldID string) (*domain.OpenLineageField, error) {
	query := `
		SELECT field_id, dataset_id, field_name, field_type, field_description, ordinal_position, nullable, created_at
		FROM demo_user.OL_DATASET_FIELD
		WHERE field_id = ?`

	var f domain.OpenLineageField
	var fieldType, description sql.NullString
	var createdAt sql.NullTime
	var nullable string

	err := r.db.QueryRowContext(ctx, query, fieldID).Scan(
		&f.ID, &f.DatasetID, &f.Name, &fieldType, &description,
		&f.OrdinalPosition, &nullable, &createdAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get field: %w", err)
	}

	f.Type = fieldType.String
	f.Description = description.String
	f.Nullable = nullable == "Y"
	if createdAt.Valid {
		f.CreatedAt = createdAt.Time
	}
	return &f, nil
}

// ListFields retrieves all fields for a dataset.
func (r *OpenLineageRepository) ListFields(ctx context.Context, datasetID string) ([]domain.OpenLineageField, error) {
	query := `
		SELECT field_id, dataset_id, field_name, field_type, field_description, ordinal_position, nullable, created_at
		FROM demo_user.OL_DATASET_FIELD
		WHERE dataset_id = ?
		ORDER BY ordinal_position`

	rows, err := r.db.QueryContext(ctx, query, datasetID)
	if err != nil {
		return nil, fmt.Errorf("list fields: %w", err)
	}
	defer rows.Close()

	var fields []domain.OpenLineageField
	for rows.Next() {
		var f domain.OpenLineageField
		var fieldType, description sql.NullString
		var createdAt sql.NullTime
		var nullable string

		if err := rows.Scan(&f.ID, &f.DatasetID, &f.Name, &fieldType, &description,
			&f.OrdinalPosition, &nullable, &createdAt); err != nil {
			return nil, fmt.Errorf("scan field: %w", err)
		}
		f.Type = fieldType.String
		f.Description = description.String
		f.Nullable = nullable == "Y"
		if createdAt.Valid {
			f.CreatedAt = createdAt.Time
		}
		fields = append(fields, f)
	}
	return fields, rows.Err()
}

// Job operations

// GetJob retrieves a job by its ID.
func (r *OpenLineageRepository) GetJob(ctx context.Context, jobID string) (*domain.OpenLineageJob, error) {
	query := `
		SELECT job_id, namespace_id, name, description, job_type, created_at, updated_at
		FROM demo_user.OL_JOB
		WHERE job_id = ?`

	var j domain.OpenLineageJob
	var description, jobType sql.NullString
	var createdAt, updatedAt sql.NullTime

	err := r.db.QueryRowContext(ctx, query, jobID).Scan(
		&j.ID, &j.NamespaceID, &j.Name, &description, &jobType, &createdAt, &updatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get job: %w", err)
	}

	j.Description = description.String
	j.JobType = jobType.String
	if createdAt.Valid {
		j.CreatedAt = createdAt.Time
	}
	if updatedAt.Valid {
		j.UpdatedAt = updatedAt.Time
	}
	return &j, nil
}

// ListJobs retrieves jobs for a namespace with pagination.
func (r *OpenLineageRepository) ListJobs(ctx context.Context, namespaceID string, limit, offset int) ([]domain.OpenLineageJob, int, error) {
	countQuery := `SELECT COUNT(*) FROM demo_user.OL_JOB WHERE namespace_id = ?`
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, namespaceID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count jobs: %w", err)
	}

	query := `
		SELECT job_id, namespace_id, name, description, job_type, created_at, updated_at
		FROM demo_user.OL_JOB
		WHERE namespace_id = ?
		ORDER BY name
		OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`

	rows, err := r.db.QueryContext(ctx, query, namespaceID, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()

	var jobs []domain.OpenLineageJob
	for rows.Next() {
		var j domain.OpenLineageJob
		var description, jobType sql.NullString
		var createdAt, updatedAt sql.NullTime

		if err := rows.Scan(&j.ID, &j.NamespaceID, &j.Name, &description, &jobType,
			&createdAt, &updatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan job: %w", err)
		}
		j.Description = description.String
		j.JobType = jobType.String
		if createdAt.Valid {
			j.CreatedAt = createdAt.Time
		}
		if updatedAt.Valid {
			j.UpdatedAt = updatedAt.Time
		}
		jobs = append(jobs, j)
	}
	return jobs, total, rows.Err()
}

// Run operations

// GetRun retrieves a run by its ID.
func (r *OpenLineageRepository) GetRun(ctx context.Context, runID string) (*domain.OpenLineageRun, error) {
	query := `
		SELECT run_id, job_id, event_type, event_time, nominal_start_time, nominal_end_time, producer, schema_url, created_at
		FROM demo_user.OL_RUN
		WHERE run_id = ?`

	var run domain.OpenLineageRun
	var eventType, producer, schemaURL sql.NullString
	var eventTime, nominalStart, nominalEnd, createdAt sql.NullTime

	err := r.db.QueryRowContext(ctx, query, runID).Scan(
		&run.ID, &run.JobID, &eventType, &eventTime,
		&nominalStart, &nominalEnd, &producer, &schemaURL, &createdAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get run: %w", err)
	}

	run.EventType = eventType.String
	run.Producer = producer.String
	run.SchemaURL = schemaURL.String
	if eventTime.Valid {
		run.EventTime = eventTime.Time
	}
	if nominalStart.Valid {
		run.NominalStartTime = nominalStart.Time
	}
	if nominalEnd.Valid {
		run.NominalEndTime = nominalEnd.Time
	}
	if createdAt.Valid {
		run.CreatedAt = createdAt.Time
	}
	return &run, nil
}

// ListRuns retrieves runs for a job, ordered by most recent first.
func (r *OpenLineageRepository) ListRuns(ctx context.Context, jobID string, limit int) ([]domain.OpenLineageRun, error) {
	query := `
		SELECT run_id, job_id, event_type, event_time, nominal_start_time, nominal_end_time, producer, schema_url, created_at
		FROM demo_user.OL_RUN
		WHERE job_id = ?
		ORDER BY event_time DESC
		FETCH FIRST ? ROWS ONLY`

	rows, err := r.db.QueryContext(ctx, query, jobID, limit)
	if err != nil {
		return nil, fmt.Errorf("list runs: %w", err)
	}
	defer rows.Close()

	var runs []domain.OpenLineageRun
	for rows.Next() {
		var run domain.OpenLineageRun
		var eventType, producer, schemaURL sql.NullString
		var eventTime, nominalStart, nominalEnd, createdAt sql.NullTime

		if err := rows.Scan(&run.ID, &run.JobID, &eventType, &eventTime,
			&nominalStart, &nominalEnd, &producer, &schemaURL, &createdAt); err != nil {
			return nil, fmt.Errorf("scan run: %w", err)
		}
		run.EventType = eventType.String
		run.Producer = producer.String
		run.SchemaURL = schemaURL.String
		if eventTime.Valid {
			run.EventTime = eventTime.Time
		}
		if nominalStart.Valid {
			run.NominalStartTime = nominalStart.Time
		}
		if nominalEnd.Valid {
			run.NominalEndTime = nominalEnd.Time
		}
		if createdAt.Valid {
			run.CreatedAt = createdAt.Time
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

// Lineage operations

// GetColumnLineage retrieves column-level lineage with recursive traversal.
func (r *OpenLineageRepository) GetColumnLineage(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) ([]domain.OpenLineageColumnLineage, error) {
	// Build recursive CTE based on direction
	var query string
	switch direction {
	case "upstream":
		query = r.buildUpstreamQuery(maxDepth)
	case "downstream":
		query = r.buildDownstreamQuery(maxDepth)
	case "both":
		query = r.buildBidirectionalQuery(maxDepth)
	default:
		query = r.buildBidirectionalQuery(maxDepth)
	}

	rows, err := r.db.QueryContext(ctx, query, datasetID, fieldName)
	if err != nil {
		return nil, fmt.Errorf("get column lineage: %w", err)
	}
	defer rows.Close()

	var lineages []domain.OpenLineageColumnLineage
	for rows.Next() {
		var l domain.OpenLineageColumnLineage
		var runID, transDesc sql.NullString
		var transType, transSubtype string
		var masking, isActive string
		var confScore sql.NullFloat64
		var discoveredAt sql.NullTime
		var depth int

		if err := rows.Scan(
			&l.ID, &runID, &l.SourceNamespace, &l.SourceDataset, &l.SourceField,
			&l.TargetNamespace, &l.TargetDataset, &l.TargetField,
			&transType, &transSubtype, &transDesc, &masking, &confScore,
			&discoveredAt, &isActive, &depth,
		); err != nil {
			return nil, fmt.Errorf("scan lineage: %w", err)
		}

		l.RunID = runID.String
		l.TransformationType = domain.TransformationType(transType)
		l.TransformationSubtype = domain.TransformationSubtype(transSubtype)
		l.TransformationDescription = transDesc.String
		l.Masking = masking == "Y"
		l.IsActive = isActive == "Y"
		l.Depth = depth
		if confScore.Valid {
			l.ConfidenceScore = confScore.Float64
		}
		if discoveredAt.Valid {
			l.DiscoveredAt = discoveredAt.Time
		}
		lineages = append(lineages, l)
	}
	return lineages, rows.Err()
}

// buildUpstreamQuery builds a recursive CTE for upstream lineage traversal.
// Uses LOCKING ROW FOR ACCESS hint to reduce lock contention (PERF-CTE-05).
func (r *OpenLineageRepository) buildUpstreamQuery(maxDepth int) string {
	return fmt.Sprintf(`
		LOCKING ROW FOR ACCESS
		WITH RECURSIVE lineage_path (
			lineage_id, run_id, source_namespace, source_dataset, source_field,
			target_namespace, target_dataset, target_field,
			transformation_type, transformation_subtype, transformation_description,
			masking, confidence_score, discovered_at, is_active, depth, path
		) AS (
			-- Base case: direct upstream of target
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				1 AS depth,
				CAST(l.lineage_id AS VARCHAR(4000)) AS path
			FROM demo_user.OL_COLUMN_LINEAGE l
			WHERE l.target_dataset = ? AND l.target_field = ? AND l.is_active = 'Y'

			UNION ALL

			-- Recursive case: traverse upstream
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				lp.depth + 1,
				lp.path || ',' || l.lineage_id
			FROM demo_user.OL_COLUMN_LINEAGE l
			INNER JOIN lineage_path lp
				ON l.target_dataset = lp.source_dataset
				AND l.target_field = lp.source_field
			WHERE l.is_active = 'Y'
				AND lp.depth < %d
				AND POSITION(l.lineage_id IN lp.path) = 0
		)
		SELECT DISTINCT
			lineage_id, run_id, source_namespace, source_dataset, source_field,
			target_namespace, target_dataset, target_field,
			transformation_type, transformation_subtype, transformation_description,
			masking, confidence_score, discovered_at, is_active, depth
		FROM lineage_path
		ORDER BY depth`, maxDepth)
}

// buildDownstreamQuery builds a recursive CTE for downstream lineage traversal.
// Uses LOCKING ROW FOR ACCESS hint to reduce lock contention (PERF-CTE-05).
func (r *OpenLineageRepository) buildDownstreamQuery(maxDepth int) string {
	return fmt.Sprintf(`
		LOCKING ROW FOR ACCESS
		WITH RECURSIVE lineage_path (
			lineage_id, run_id, source_namespace, source_dataset, source_field,
			target_namespace, target_dataset, target_field,
			transformation_type, transformation_subtype, transformation_description,
			masking, confidence_score, discovered_at, is_active, depth, path
		) AS (
			-- Base case: direct downstream of source
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				1 AS depth,
				CAST(l.lineage_id AS VARCHAR(4000)) AS path
			FROM demo_user.OL_COLUMN_LINEAGE l
			WHERE l.source_dataset = ? AND l.source_field = ? AND l.is_active = 'Y'

			UNION ALL

			-- Recursive case: traverse downstream
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				lp.depth + 1,
				lp.path || ',' || l.lineage_id
			FROM demo_user.OL_COLUMN_LINEAGE l
			INNER JOIN lineage_path lp
				ON l.source_dataset = lp.target_dataset
				AND l.source_field = lp.target_field
			WHERE l.is_active = 'Y'
				AND lp.depth < %d
				AND POSITION(l.lineage_id IN lp.path) = 0
		)
		SELECT DISTINCT
			lineage_id, run_id, source_namespace, source_dataset, source_field,
			target_namespace, target_dataset, target_field,
			transformation_type, transformation_subtype, transformation_description,
			masking, confidence_score, discovered_at, is_active, depth
		FROM lineage_path
		ORDER BY depth`, maxDepth)
}

// buildBidirectionalQuery builds a recursive CTE for both upstream and downstream traversal.
// Uses LOCKING ROW FOR ACCESS hint to reduce lock contention (PERF-CTE-05).
func (r *OpenLineageRepository) buildBidirectionalQuery(maxDepth int) string {
	// For bidirectional, we combine upstream and downstream results
	return fmt.Sprintf(`
		LOCKING ROW FOR ACCESS
		WITH RECURSIVE upstream_path (
			lineage_id, run_id, source_namespace, source_dataset, source_field,
			target_namespace, target_dataset, target_field,
			transformation_type, transformation_subtype, transformation_description,
			masking, confidence_score, discovered_at, is_active, depth, path
		) AS (
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				1 AS depth,
				CAST(l.lineage_id AS VARCHAR(4000)) AS path
			FROM demo_user.OL_COLUMN_LINEAGE l
			WHERE l.target_dataset = ? AND l.target_field = ? AND l.is_active = 'Y'
			UNION ALL
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				up.depth + 1,
				up.path || ',' || l.lineage_id
			FROM demo_user.OL_COLUMN_LINEAGE l
			INNER JOIN upstream_path up
				ON l.target_dataset = up.source_dataset
				AND l.target_field = up.source_field
			WHERE l.is_active = 'Y'
				AND up.depth < %d
				AND POSITION(l.lineage_id IN up.path) = 0
		),
		downstream_path (
			lineage_id, run_id, source_namespace, source_dataset, source_field,
			target_namespace, target_dataset, target_field,
			transformation_type, transformation_subtype, transformation_description,
			masking, confidence_score, discovered_at, is_active, depth, path
		) AS (
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				1 AS depth,
				CAST(l.lineage_id AS VARCHAR(4000)) AS path
			FROM demo_user.OL_COLUMN_LINEAGE l
			WHERE l.source_dataset = ? AND l.source_field = ? AND l.is_active = 'Y'
			UNION ALL
			SELECT
				l.lineage_id, l.run_id, l.source_namespace, l.source_dataset, l.source_field,
				l.target_namespace, l.target_dataset, l.target_field,
				l.transformation_type, l.transformation_subtype, l.transformation_description,
				l.masking, l.confidence_score, l.discovered_at, l.is_active,
				dp.depth + 1,
				dp.path || ',' || l.lineage_id
			FROM demo_user.OL_COLUMN_LINEAGE l
			INNER JOIN downstream_path dp
				ON l.source_dataset = dp.target_dataset
				AND l.source_field = dp.target_field
			WHERE l.is_active = 'Y'
				AND dp.depth < %d
				AND POSITION(l.lineage_id IN dp.path) = 0
		)
		SELECT DISTINCT
			lineage_id, run_id, source_namespace, source_dataset, source_field,
			target_namespace, target_dataset, target_field,
			transformation_type, transformation_subtype, transformation_description,
			masking, confidence_score, discovered_at, is_active, depth
		FROM (
			SELECT * FROM upstream_path
			UNION
			SELECT * FROM downstream_path
		) combined
		ORDER BY depth`, maxDepth, maxDepth)
}

// GetColumnLineageGraph builds a graph representation from lineage records.
func (r *OpenLineageRepository) GetColumnLineageGraph(ctx context.Context, datasetID, fieldName string, direction string, maxDepth int) (*domain.OpenLineageGraph, error) {
	lineages, err := r.GetColumnLineage(ctx, datasetID, fieldName, direction, maxDepth)
	if err != nil {
		return nil, err
	}

	graph := &domain.OpenLineageGraph{
		Nodes: []domain.OpenLineageNode{},
		Edges: []domain.OpenLineageEdge{},
	}

	nodeMap := make(map[string]bool)

	// Add the seed node
	seedNodeID := fmt.Sprintf("%s/%s", datasetID, fieldName)
	graph.Nodes = append(graph.Nodes, domain.OpenLineageNode{
		ID:      seedNodeID,
		Type:    "field",
		Dataset: datasetID,
		Field:   fieldName,
	})
	nodeMap[seedNodeID] = true

	// Build nodes and edges from lineage records
	for _, l := range lineages {
		// Source node
		srcNodeID := fmt.Sprintf("%s/%s", l.SourceDataset, l.SourceField)
		if !nodeMap[srcNodeID] {
			graph.Nodes = append(graph.Nodes, domain.OpenLineageNode{
				ID:        srcNodeID,
				Type:      "field",
				Namespace: l.SourceNamespace,
				Dataset:   l.SourceDataset,
				Field:     l.SourceField,
			})
			nodeMap[srcNodeID] = true
		}

		// Target node
		tgtNodeID := fmt.Sprintf("%s/%s", l.TargetDataset, l.TargetField)
		if !nodeMap[tgtNodeID] {
			graph.Nodes = append(graph.Nodes, domain.OpenLineageNode{
				ID:        tgtNodeID,
				Type:      "field",
				Namespace: l.TargetNamespace,
				Dataset:   l.TargetDataset,
				Field:     l.TargetField,
			})
			nodeMap[tgtNodeID] = true
		}

		// Edge
		graph.Edges = append(graph.Edges, domain.OpenLineageEdge{
			ID:                    l.ID,
			Source:                srcNodeID,
			Target:                tgtNodeID,
			TransformationType:    l.TransformationType,
			TransformationSubtype: l.TransformationSubtype,
			ConfidenceScore:       l.ConfidenceScore,
		})
	}

	return graph, nil
}
