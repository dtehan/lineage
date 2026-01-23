package teradata

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/lineage-api/internal/domain"
)

// SearchRepository implements domain.SearchRepository using Teradata.
type SearchRepository struct {
	db *sql.DB
}

// NewSearchRepository creates a new SearchRepository.
func NewSearchRepository(db *sql.DB) *SearchRepository {
	return &SearchRepository{db: db}
}

// Search searches for assets matching the query.
func (r *SearchRepository) Search(ctx context.Context, query string, assetTypes []domain.AssetType, limit int) ([]domain.SearchResult, error) {
	var results []domain.SearchResult
	searchPattern := "%" + strings.ToUpper(query) + "%"

	// Determine which asset types to search
	searchDatabases := len(assetTypes) == 0
	searchTables := len(assetTypes) == 0
	searchColumns := len(assetTypes) == 0

	for _, t := range assetTypes {
		switch t {
		case domain.AssetTypeDatabase:
			searchDatabases = true
		case domain.AssetTypeTable:
			searchTables = true
		case domain.AssetTypeColumn:
			searchColumns = true
		}
	}

	// Search databases
	if searchDatabases {
		dbResults, err := r.searchDatabases(ctx, searchPattern, limit)
		if err != nil {
			return nil, err
		}
		results = append(results, dbResults...)
	}

	// Search tables
	if searchTables {
		tableResults, err := r.searchTables(ctx, searchPattern, limit)
		if err != nil {
			return nil, err
		}
		results = append(results, tableResults...)
	}

	// Search columns
	if searchColumns {
		colResults, err := r.searchColumns(ctx, searchPattern, limit)
		if err != nil {
			return nil, err
		}
		results = append(results, colResults...)
	}

	// Limit total results
	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

func (r *SearchRepository) searchDatabases(ctx context.Context, pattern string, limit int) ([]domain.SearchResult, error) {
	query := `
		SELECT TOP ?
			database_id,
			database_name
		FROM demo_user.LIN_DATABASE
		WHERE UPPER(database_name) LIKE ?
		  AND is_active = 'Y'
		ORDER BY database_name
	`

	rows, err := r.db.QueryContext(ctx, query, limit, pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to search databases: %w", err)
	}
	defer rows.Close()

	var results []domain.SearchResult
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, fmt.Errorf("failed to scan database search result: %w", err)
		}
		results = append(results, domain.SearchResult{
			ID:           id,
			Type:         domain.AssetTypeDatabase,
			DatabaseName: name,
			MatchedOn:    "database_name",
			Score:        1.0,
		})
	}

	return results, rows.Err()
}

func (r *SearchRepository) searchTables(ctx context.Context, pattern string, limit int) ([]domain.SearchResult, error) {
	query := `
		SELECT TOP ?
			table_id,
			database_name,
			table_name
		FROM demo_user.LIN_TABLE
		WHERE UPPER(table_name) LIKE ?
		  AND is_active = 'Y'
		ORDER BY database_name, table_name
	`

	rows, err := r.db.QueryContext(ctx, query, limit, pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to search tables: %w", err)
	}
	defer rows.Close()

	var results []domain.SearchResult
	for rows.Next() {
		var id, dbName, tableName string
		if err := rows.Scan(&id, &dbName, &tableName); err != nil {
			return nil, fmt.Errorf("failed to scan table search result: %w", err)
		}
		results = append(results, domain.SearchResult{
			ID:           id,
			Type:         domain.AssetTypeTable,
			DatabaseName: dbName,
			TableName:    tableName,
			MatchedOn:    "table_name",
			Score:        1.0,
		})
	}

	return results, rows.Err()
}

func (r *SearchRepository) searchColumns(ctx context.Context, pattern string, limit int) ([]domain.SearchResult, error) {
	query := `
		SELECT TOP ?
			column_id,
			database_name,
			table_name,
			column_name
		FROM demo_user.LIN_COLUMN
		WHERE UPPER(column_name) LIKE ?
		  AND is_active = 'Y'
		ORDER BY database_name, table_name, column_name
	`

	rows, err := r.db.QueryContext(ctx, query, limit, pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to search columns: %w", err)
	}
	defer rows.Close()

	var results []domain.SearchResult
	for rows.Next() {
		var id, dbName, tableName, columnName string
		if err := rows.Scan(&id, &dbName, &tableName, &columnName); err != nil {
			return nil, fmt.Errorf("failed to scan column search result: %w", err)
		}
		results = append(results, domain.SearchResult{
			ID:           id,
			Type:         domain.AssetTypeColumn,
			DatabaseName: dbName,
			TableName:    tableName,
			ColumnName:   columnName,
			MatchedOn:    "column_name",
			Score:        1.0,
		})
	}

	return results, rows.Err()
}
