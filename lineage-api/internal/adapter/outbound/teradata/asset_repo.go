package teradata

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/lineage-api/internal/domain"
)

// AssetRepository implements domain.AssetRepository using Teradata.
type AssetRepository struct {
	db *sql.DB
}

// NewAssetRepository creates a new AssetRepository.
func NewAssetRepository(db *sql.DB) *AssetRepository {
	return &AssetRepository{db: db}
}

// ListDatabases returns all databases from the lineage registry.
func (r *AssetRepository) ListDatabases(ctx context.Context) ([]domain.Database, error) {
	query := `
		SELECT
			database_id,
			database_name,
			owner_name,
			create_timestamp,
			comment_string
		FROM demo_user.LIN_DATABASE
		WHERE is_active = 'Y'
		ORDER BY database_name
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query databases: %w", err)
	}
	defer rows.Close()

	var databases []domain.Database
	for rows.Next() {
		var d domain.Database
		var ownerName, commentString sql.NullString
		var createTimestamp sql.NullTime

		err := rows.Scan(
			&d.ID,
			&d.Name,
			&ownerName,
			&createTimestamp,
			&commentString,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan database row: %w", err)
		}

		if ownerName.Valid {
			d.OwnerName = ownerName.String
		}
		if createTimestamp.Valid {
			d.CreateTimestamp = createTimestamp.Time
		}
		if commentString.Valid {
			d.CommentString = commentString.String
		}

		databases = append(databases, d)
	}

	return databases, rows.Err()
}

// GetDatabase returns a database by name.
func (r *AssetRepository) GetDatabase(ctx context.Context, name string) (*domain.Database, error) {
	query := `
		SELECT
			database_id,
			database_name,
			owner_name,
			create_timestamp,
			comment_string
		FROM demo_user.LIN_DATABASE
		WHERE database_name = ?
		  AND is_active = 'Y'
	`

	var d domain.Database
	var ownerName, commentString sql.NullString
	var createTimestamp sql.NullTime

	err := r.db.QueryRowContext(ctx, query, name).Scan(
		&d.ID,
		&d.Name,
		&ownerName,
		&createTimestamp,
		&commentString,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("database not found: %s", name)
		}
		return nil, fmt.Errorf("failed to query database: %w", err)
	}

	if ownerName.Valid {
		d.OwnerName = ownerName.String
	}
	if createTimestamp.Valid {
		d.CreateTimestamp = createTimestamp.Time
	}
	if commentString.Valid {
		d.CommentString = commentString.String
	}

	return &d, nil
}

// ListTables returns all tables for a database.
func (r *AssetRepository) ListTables(ctx context.Context, databaseName string) ([]domain.Table, error) {
	query := `
		SELECT
			table_id,
			database_name,
			table_name,
			table_kind,
			create_timestamp,
			comment_string
		FROM demo_user.LIN_TABLE
		WHERE database_name = ?
		  AND is_active = 'Y'
		ORDER BY table_name
	`

	rows, err := r.db.QueryContext(ctx, query, databaseName)
	if err != nil {
		return nil, fmt.Errorf("failed to query tables: %w", err)
	}
	defer rows.Close()

	var tables []domain.Table
	for rows.Next() {
		var t domain.Table
		var commentString sql.NullString
		var createTimestamp sql.NullTime

		err := rows.Scan(
			&t.ID,
			&t.DatabaseName,
			&t.TableName,
			&t.TableKind,
			&createTimestamp,
			&commentString,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan table row: %w", err)
		}

		if createTimestamp.Valid {
			t.CreateTimestamp = createTimestamp.Time
		}
		if commentString.Valid {
			t.CommentString = commentString.String
		}

		tables = append(tables, t)
	}

	return tables, rows.Err()
}

// GetTable returns a table by database and table name.
func (r *AssetRepository) GetTable(ctx context.Context, databaseName, tableName string) (*domain.Table, error) {
	query := `
		SELECT
			table_id,
			database_name,
			table_name,
			table_kind,
			create_timestamp,
			comment_string
		FROM demo_user.LIN_TABLE
		WHERE database_name = ?
		  AND table_name = ?
		  AND is_active = 'Y'
	`

	var t domain.Table
	var commentString sql.NullString
	var createTimestamp sql.NullTime

	err := r.db.QueryRowContext(ctx, query, databaseName, tableName).Scan(
		&t.ID,
		&t.DatabaseName,
		&t.TableName,
		&t.TableKind,
		&createTimestamp,
		&commentString,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("table not found: %s.%s", databaseName, tableName)
		}
		return nil, fmt.Errorf("failed to query table: %w", err)
	}

	if createTimestamp.Valid {
		t.CreateTimestamp = createTimestamp.Time
	}
	if commentString.Valid {
		t.CommentString = commentString.String
	}

	return &t, nil
}

// ListColumns returns all columns for a table.
func (r *AssetRepository) ListColumns(ctx context.Context, databaseName, tableName string) ([]domain.Column, error) {
	query := `
		SELECT
			column_id,
			database_name,
			table_name,
			column_name,
			column_type,
			column_length,
			nullable,
			comment_string,
			column_position
		FROM demo_user.LIN_COLUMN
		WHERE database_name = ?
		  AND table_name = ?
		  AND is_active = 'Y'
		ORDER BY column_position
	`

	rows, err := r.db.QueryContext(ctx, query, databaseName, tableName)
	if err != nil {
		return nil, fmt.Errorf("failed to query columns: %w", err)
	}
	defer rows.Close()

	var columns []domain.Column
	for rows.Next() {
		var c domain.Column
		var commentString sql.NullString
		var columnLength sql.NullInt64
		var nullable string

		err := rows.Scan(
			&c.ID,
			&c.DatabaseName,
			&c.TableName,
			&c.ColumnName,
			&c.ColumnType,
			&columnLength,
			&nullable,
			&commentString,
			&c.ColumnPosition,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan column row: %w", err)
		}

		if columnLength.Valid {
			c.ColumnLength = int(columnLength.Int64)
		}
		c.Nullable = nullable == "Y"
		if commentString.Valid {
			c.CommentString = commentString.String
		}

		columns = append(columns, c)
	}

	return columns, rows.Err()
}

// GetColumn returns a column by database, table, and column name.
func (r *AssetRepository) GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*domain.Column, error) {
	query := `
		SELECT
			column_id,
			database_name,
			table_name,
			column_name,
			column_type,
			column_length,
			nullable,
			comment_string,
			column_position
		FROM demo_user.LIN_COLUMN
		WHERE database_name = ?
		  AND table_name = ?
		  AND column_name = ?
		  AND is_active = 'Y'
	`

	var c domain.Column
	var commentString sql.NullString
	var columnLength sql.NullInt64
	var nullable string

	err := r.db.QueryRowContext(ctx, query, databaseName, tableName, columnName).Scan(
		&c.ID,
		&c.DatabaseName,
		&c.TableName,
		&c.ColumnName,
		&c.ColumnType,
		&columnLength,
		&nullable,
		&commentString,
		&c.ColumnPosition,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("column not found: %s.%s.%s", databaseName, tableName, columnName)
		}
		return nil, fmt.Errorf("failed to query column: %w", err)
	}

	if columnLength.Valid {
		c.ColumnLength = int(columnLength.Int64)
	}
	c.Nullable = nullable == "Y"
	if commentString.Valid {
		c.CommentString = commentString.String
	}

	return &c, nil
}

// ListDatabasesPaginated returns paginated databases with total count.
func (r *AssetRepository) ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]domain.Database, int, error) {
	// Get total count
	countQuery := `SELECT COUNT(*) FROM demo_user.LIN_DATABASE WHERE is_active = 'Y'`
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count databases: %w", err)
	}

	// Get paginated results
	query := `
		SELECT
			database_id,
			database_name,
			owner_name,
			create_timestamp,
			comment_string
		FROM demo_user.LIN_DATABASE
		WHERE is_active = 'Y'
		ORDER BY database_name
		OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
	`

	rows, err := r.db.QueryContext(ctx, query, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query databases: %w", err)
	}
	defer rows.Close()

	var databases []domain.Database
	for rows.Next() {
		var d domain.Database
		var ownerName, commentString sql.NullString
		var createTimestamp sql.NullTime

		err := rows.Scan(
			&d.ID,
			&d.Name,
			&ownerName,
			&createTimestamp,
			&commentString,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan database row: %w", err)
		}

		if ownerName.Valid {
			d.OwnerName = ownerName.String
		}
		if createTimestamp.Valid {
			d.CreateTimestamp = createTimestamp.Time
		}
		if commentString.Valid {
			d.CommentString = commentString.String
		}

		databases = append(databases, d)
	}

	return databases, total, rows.Err()
}

// ListTablesPaginated returns paginated tables for a database with total count.
func (r *AssetRepository) ListTablesPaginated(ctx context.Context, databaseName string, limit, offset int) ([]domain.Table, int, error) {
	// Get total count
	countQuery := `SELECT COUNT(*) FROM demo_user.LIN_TABLE WHERE database_name = ? AND is_active = 'Y'`
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, databaseName).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count tables: %w", err)
	}

	// Get paginated results
	query := `
		SELECT
			table_id,
			database_name,
			table_name,
			table_kind,
			create_timestamp,
			comment_string
		FROM demo_user.LIN_TABLE
		WHERE database_name = ?
		  AND is_active = 'Y'
		ORDER BY table_name
		OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
	`

	rows, err := r.db.QueryContext(ctx, query, databaseName, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query tables: %w", err)
	}
	defer rows.Close()

	var tables []domain.Table
	for rows.Next() {
		var t domain.Table
		var commentString sql.NullString
		var createTimestamp sql.NullTime

		err := rows.Scan(
			&t.ID,
			&t.DatabaseName,
			&t.TableName,
			&t.TableKind,
			&createTimestamp,
			&commentString,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan table row: %w", err)
		}

		if createTimestamp.Valid {
			t.CreateTimestamp = createTimestamp.Time
		}
		if commentString.Valid {
			t.CommentString = commentString.String
		}

		tables = append(tables, t)
	}

	return tables, total, rows.Err()
}

// ListColumnsPaginated returns paginated columns for a table with total count.
func (r *AssetRepository) ListColumnsPaginated(ctx context.Context, databaseName, tableName string, limit, offset int) ([]domain.Column, int, error) {
	// Get total count
	countQuery := `SELECT COUNT(*) FROM demo_user.LIN_COLUMN WHERE database_name = ? AND table_name = ? AND is_active = 'Y'`
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, databaseName, tableName).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count columns: %w", err)
	}

	// Get paginated results
	query := `
		SELECT
			column_id,
			database_name,
			table_name,
			column_name,
			column_type,
			column_length,
			nullable,
			comment_string,
			column_position
		FROM demo_user.LIN_COLUMN
		WHERE database_name = ?
		  AND table_name = ?
		  AND is_active = 'Y'
		ORDER BY column_position
		OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
	`

	rows, err := r.db.QueryContext(ctx, query, databaseName, tableName, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query columns: %w", err)
	}
	defer rows.Close()

	var columns []domain.Column
	for rows.Next() {
		var c domain.Column
		var commentString sql.NullString
		var columnLength sql.NullInt64
		var nullable string

		err := rows.Scan(
			&c.ID,
			&c.DatabaseName,
			&c.TableName,
			&c.ColumnName,
			&c.ColumnType,
			&columnLength,
			&nullable,
			&commentString,
			&c.ColumnPosition,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan column row: %w", err)
		}

		if columnLength.Valid {
			c.ColumnLength = int(columnLength.Int64)
		}
		c.Nullable = nullable == "Y"
		if commentString.Valid {
			c.CommentString = commentString.String
		}

		columns = append(columns, c)
	}

	return columns, total, rows.Err()
}

// Search searches for assets matching the query.
func (r *AssetRepository) Search(ctx context.Context, query string, assetTypes []domain.AssetType, limit int) ([]domain.SearchResult, error) {
	// Build the search query with LIKE
	searchPattern := "%" + query + "%"
	var results []domain.SearchResult

	// Search databases
	if len(assetTypes) == 0 || containsAssetType(assetTypes, domain.AssetTypeDatabase) {
		dbQuery := `
			SELECT database_id, database_name
			FROM demo_user.LIN_DATABASE
			WHERE LOWER(database_name) LIKE LOWER(?)
			  AND is_active = 'Y'
		`
		rows, err := r.db.QueryContext(ctx, dbQuery, searchPattern)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id, name string
				if err := rows.Scan(&id, &name); err == nil {
					results = append(results, domain.SearchResult{
						ID:           id,
						Type:         domain.AssetTypeDatabase,
						DatabaseName: name,
						MatchedOn:    "name",
						Score:        1.0,
					})
				}
			}
		}
	}

	// Search tables
	if len(assetTypes) == 0 || containsAssetType(assetTypes, domain.AssetTypeTable) {
		tblQuery := `
			SELECT table_id, database_name, table_name
			FROM demo_user.LIN_TABLE
			WHERE LOWER(table_name) LIKE LOWER(?)
			  AND is_active = 'Y'
		`
		rows, err := r.db.QueryContext(ctx, tblQuery, searchPattern)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id, dbName, tblName string
				if err := rows.Scan(&id, &dbName, &tblName); err == nil {
					results = append(results, domain.SearchResult{
						ID:           id,
						Type:         domain.AssetTypeTable,
						DatabaseName: dbName,
						TableName:    tblName,
						MatchedOn:    "tableName",
						Score:        1.0,
					})
				}
			}
		}
	}

	// Search columns
	if len(assetTypes) == 0 || containsAssetType(assetTypes, domain.AssetTypeColumn) {
		colQuery := `
			SELECT column_id, database_name, table_name, column_name
			FROM demo_user.LIN_COLUMN
			WHERE LOWER(column_name) LIKE LOWER(?)
			  AND is_active = 'Y'
		`
		rows, err := r.db.QueryContext(ctx, colQuery, searchPattern)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id, dbName, tblName, colName string
				if err := rows.Scan(&id, &dbName, &tblName, &colName); err == nil {
					results = append(results, domain.SearchResult{
						ID:           id,
						Type:         domain.AssetTypeColumn,
						DatabaseName: dbName,
						TableName:    tblName,
						ColumnName:   colName,
						MatchedOn:    "columnName",
						Score:        1.0,
					})
				}
			}
		}
	}

	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

func containsAssetType(types []domain.AssetType, t domain.AssetType) bool {
	for _, at := range types {
		if at == t {
			return true
		}
	}
	return false
}
