package teradata

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/lineage-api/internal/domain"
)

// LineageRepository implements domain.LineageRepository using Teradata.
type LineageRepository struct {
	db        *sql.DB
	assetRepo domain.AssetRepository
}

// NewLineageRepository creates a new LineageRepository.
func NewLineageRepository(db *sql.DB, assetRepo domain.AssetRepository) *LineageRepository {
	return &LineageRepository{
		db:        db,
		assetRepo: assetRepo,
	}
}

// GetLineageGraph returns the full lineage graph for an asset.
func (r *LineageRepository) GetLineageGraph(ctx context.Context, assetID string, direction string, maxDepth int) (*domain.LineageGraph, error) {
	var upstream, downstream []domain.ColumnLineage
	var err error

	if direction == "upstream" || direction == "both" {
		upstream, err = r.GetUpstreamLineage(ctx, assetID, maxDepth)
		if err != nil {
			return nil, err
		}
	}

	if direction == "downstream" || direction == "both" {
		downstream, err = r.GetDownstreamLineage(ctx, assetID, maxDepth)
		if err != nil {
			return nil, err
		}
	}

	return r.buildGraph(ctx, assetID, upstream, downstream), nil
}

// GetUpstreamLineage returns upstream lineage using recursive CTE.
func (r *LineageRepository) GetUpstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
	query := `
		WITH RECURSIVE upstream_lineage AS (
			SELECT
				lineage_id,
				source_column_id,
				source_database,
				source_table,
				source_column,
				target_column_id,
				target_database,
				target_table,
				target_column,
				transformation_type,
				confidence_score,
				1 AS depth,
				CAST(target_column_id || '->' || source_column_id AS VARCHAR(10000)) AS path
			FROM demo_user.LIN_COLUMN_LINEAGE
			WHERE target_column_id = ?
			  AND is_active = 'Y'

			UNION ALL

			SELECT
				cl.lineage_id,
				cl.source_column_id,
				cl.source_database,
				cl.source_table,
				cl.source_column,
				cl.target_column_id,
				cl.target_database,
				cl.target_table,
				cl.target_column,
				cl.transformation_type,
				cl.confidence_score,
				ul.depth + 1,
				ul.path || '->' || cl.source_column_id
			FROM demo_user.LIN_COLUMN_LINEAGE cl
			JOIN upstream_lineage ul ON cl.target_column_id = ul.source_column_id
			WHERE cl.is_active = 'Y'
			  AND ul.depth < ?
			  AND POSITION(cl.source_column_id IN ul.path) = 0
		)
		SELECT DISTINCT
			lineage_id,
			source_column_id,
			source_database,
			source_table,
			source_column,
			target_column_id,
			target_database,
			target_table,
			target_column,
			transformation_type,
			confidence_score,
			depth
		FROM upstream_lineage
		ORDER BY depth, source_database, source_table, source_column
	`

	rows, err := r.db.QueryContext(ctx, query, columnID, maxDepth)
	if err != nil {
		return nil, fmt.Errorf("failed to query upstream lineage: %w", err)
	}
	defer rows.Close()

	return r.scanLineageRows(rows)
}

// GetDownstreamLineage returns downstream lineage using recursive CTE.
func (r *LineageRepository) GetDownstreamLineage(ctx context.Context, columnID string, maxDepth int) ([]domain.ColumnLineage, error) {
	query := `
		WITH RECURSIVE downstream_lineage AS (
			SELECT
				lineage_id,
				source_column_id,
				source_database,
				source_table,
				source_column,
				target_column_id,
				target_database,
				target_table,
				target_column,
				transformation_type,
				confidence_score,
				1 AS depth,
				CAST(source_column_id || '->' || target_column_id AS VARCHAR(10000)) AS path
			FROM demo_user.LIN_COLUMN_LINEAGE
			WHERE source_column_id = ?
			  AND is_active = 'Y'

			UNION ALL

			SELECT
				cl.lineage_id,
				cl.source_column_id,
				cl.source_database,
				cl.source_table,
				cl.source_column,
				cl.target_column_id,
				cl.target_database,
				cl.target_table,
				cl.target_column,
				cl.transformation_type,
				cl.confidence_score,
				dl.depth + 1,
				dl.path || '->' || cl.target_column_id
			FROM demo_user.LIN_COLUMN_LINEAGE cl
			JOIN downstream_lineage dl ON cl.source_column_id = dl.target_column_id
			WHERE cl.is_active = 'Y'
			  AND dl.depth < ?
			  AND POSITION(cl.target_column_id IN dl.path) = 0
		)
		SELECT DISTINCT
			lineage_id,
			source_column_id,
			source_database,
			source_table,
			source_column,
			target_column_id,
			target_database,
			target_table,
			target_column,
			transformation_type,
			confidence_score,
			depth
		FROM downstream_lineage
		ORDER BY depth, target_database, target_table, target_column
	`

	rows, err := r.db.QueryContext(ctx, query, columnID, maxDepth)
	if err != nil {
		return nil, fmt.Errorf("failed to query downstream lineage: %w", err)
	}
	defer rows.Close()

	return r.scanLineageRows(rows)
}

// GetDirectLineage returns direct relationships only.
func (r *LineageRepository) GetDirectLineage(ctx context.Context, columnID string) ([]domain.ColumnLineage, error) {
	query := `
		SELECT
			lineage_id,
			source_column_id,
			source_database,
			source_table,
			source_column,
			target_column_id,
			target_database,
			target_table,
			target_column,
			transformation_type,
			confidence_score,
			1 AS depth
		FROM demo_user.LIN_COLUMN_LINEAGE
		WHERE (source_column_id = ? OR target_column_id = ?)
		  AND is_active = 'Y'
	`

	rows, err := r.db.QueryContext(ctx, query, columnID, columnID)
	if err != nil {
		return nil, fmt.Errorf("failed to query direct lineage: %w", err)
	}
	defer rows.Close()

	return r.scanLineageRows(rows)
}

// scanLineageRows scans rows into ColumnLineage slice.
func (r *LineageRepository) scanLineageRows(rows *sql.Rows) ([]domain.ColumnLineage, error) {
	var results []domain.ColumnLineage
	for rows.Next() {
		var l domain.ColumnLineage
		err := rows.Scan(
			&l.LineageID,
			&l.SourceColumnID,
			&l.SourceDatabase,
			&l.SourceTable,
			&l.SourceColumn,
			&l.TargetColumnID,
			&l.TargetDatabase,
			&l.TargetTable,
			&l.TargetColumn,
			&l.TransformationType,
			&l.ConfidenceScore,
			&l.Depth,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}
		results = append(results, l)
	}
	return results, rows.Err()
}

// getColumnMetadata retrieves column metadata from the asset repository
func (r *LineageRepository) getColumnMetadata(ctx context.Context, dbName, tableName, columnName string) map[string]any {
	if r.assetRepo == nil {
		return nil
	}

	col, err := r.assetRepo.GetColumn(ctx, dbName, tableName, columnName)
	if err != nil {
		return nil
	}

	return map[string]any{
		"columnType":     col.ColumnType,
		"nullable":       col.Nullable,
		"columnPosition": col.ColumnPosition,
	}
}

// buildGraph constructs a LineageGraph from upstream and downstream data.
func (r *LineageRepository) buildGraph(ctx context.Context, rootID string, upstream, downstream []domain.ColumnLineage) *domain.LineageGraph {
	nodeMap := make(map[string]domain.LineageNode)
	var edges []domain.LineageEdge

	// Add root node
	parts := strings.Split(rootID, ".")
	if len(parts) == 3 {
		nodeMap[rootID] = domain.LineageNode{
			ID:           rootID,
			Type:         "column",
			DatabaseName: parts[0],
			TableName:    parts[1],
			ColumnName:   parts[2],
			Metadata:     r.getColumnMetadata(ctx, parts[0], parts[1], parts[2]),
		}
	}

	// Process upstream
	for _, l := range upstream {
		// Add source node
		if _, exists := nodeMap[l.SourceColumnID]; !exists {
			nodeMap[l.SourceColumnID] = domain.LineageNode{
				ID:           l.SourceColumnID,
				Type:         "column",
				DatabaseName: l.SourceDatabase,
				TableName:    l.SourceTable,
				ColumnName:   l.SourceColumn,
				Metadata:     r.getColumnMetadata(ctx, l.SourceDatabase, l.SourceTable, l.SourceColumn),
			}
		}
		// Add target node
		if _, exists := nodeMap[l.TargetColumnID]; !exists {
			nodeMap[l.TargetColumnID] = domain.LineageNode{
				ID:           l.TargetColumnID,
				Type:         "column",
				DatabaseName: l.TargetDatabase,
				TableName:    l.TargetTable,
				ColumnName:   l.TargetColumn,
				Metadata:     r.getColumnMetadata(ctx, l.TargetDatabase, l.TargetTable, l.TargetColumn),
			}
		}
		// Add edge
		edges = append(edges, domain.LineageEdge{
			ID:                 l.LineageID,
			Source:             l.SourceColumnID,
			Target:             l.TargetColumnID,
			TransformationType: l.TransformationType,
			ConfidenceScore:    l.ConfidenceScore,
		})
	}

	// Process downstream
	for _, l := range downstream {
		if _, exists := nodeMap[l.SourceColumnID]; !exists {
			nodeMap[l.SourceColumnID] = domain.LineageNode{
				ID:           l.SourceColumnID,
				Type:         "column",
				DatabaseName: l.SourceDatabase,
				TableName:    l.SourceTable,
				ColumnName:   l.SourceColumn,
				Metadata:     r.getColumnMetadata(ctx, l.SourceDatabase, l.SourceTable, l.SourceColumn),
			}
		}
		if _, exists := nodeMap[l.TargetColumnID]; !exists {
			nodeMap[l.TargetColumnID] = domain.LineageNode{
				ID:           l.TargetColumnID,
				Type:         "column",
				DatabaseName: l.TargetDatabase,
				TableName:    l.TargetTable,
				ColumnName:   l.TargetColumn,
				Metadata:     r.getColumnMetadata(ctx, l.TargetDatabase, l.TargetTable, l.TargetColumn),
			}
		}
		edges = append(edges, domain.LineageEdge{
			ID:                 l.LineageID,
			Source:             l.SourceColumnID,
			Target:             l.TargetColumnID,
			TransformationType: l.TransformationType,
			ConfidenceScore:    l.ConfidenceScore,
		})
	}

	// Convert map to slice
	nodes := make([]domain.LineageNode, 0, len(nodeMap))
	for _, node := range nodeMap {
		nodes = append(nodes, node)
	}

	return &domain.LineageGraph{
		Nodes: nodes,
		Edges: edges,
	}
}
