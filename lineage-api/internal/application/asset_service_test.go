package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/lineage-api/internal/domain"
	"github.com/lineage-api/internal/domain/mocks"
)

// TC-UNIT-015: AssetService ListDatabases
func TestAssetServiceListDatabases(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	assetRepo.Databases = []domain.Database{
		{ID: "db-001", Name: "database1", OwnerName: "admin"},
		{ID: "db-002", Name: "database2", OwnerName: "user"},
	}

	service := NewAssetService(assetRepo)

	databases, err := service.ListDatabases(context.Background())

	require.NoError(t, err)
	assert.Len(t, databases, 2)
	assert.Equal(t, "database1", databases[0].Name)
	assert.Equal(t, "database2", databases[1].Name)
}

func TestAssetServiceListDatabases_Error(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	assetRepo.ListDatabasesErr = errors.New("database connection error")

	service := NewAssetService(assetRepo)

	_, err := service.ListDatabases(context.Background())

	assert.Error(t, err)
	assert.Equal(t, "database connection error", err.Error())
}

// TC-UNIT-016: AssetService ListTables
func TestAssetServiceListTables(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	assetRepo.Tables = []domain.Table{
		{ID: "tbl-001", DatabaseName: "test_db", TableName: "users", TableKind: "T"},
		{ID: "tbl-002", DatabaseName: "test_db", TableName: "orders", TableKind: "T"},
		{ID: "tbl-003", DatabaseName: "other_db", TableName: "products", TableKind: "T"},
	}

	service := NewAssetService(assetRepo)

	tables, err := service.ListTables(context.Background(), "test_db")

	require.NoError(t, err)
	assert.Len(t, tables, 2)

	// Verify tables belong to the correct database
	for _, table := range tables {
		assert.Equal(t, "test_db", table.DatabaseName)
	}
}

func TestAssetServiceListTables_EmptyResult(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	assetRepo.Tables = []domain.Table{}

	service := NewAssetService(assetRepo)

	tables, err := service.ListTables(context.Background(), "nonexistent_db")

	require.NoError(t, err)
	assert.Empty(t, tables)
}

// TC-UNIT-017: AssetService ListColumns
func TestAssetServiceListColumns(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	assetRepo.Columns = []domain.Column{
		{ID: "col-001", DatabaseName: "test_db", TableName: "users", ColumnName: "id", ColumnType: "INTEGER", ColumnPosition: 1},
		{ID: "col-002", DatabaseName: "test_db", TableName: "users", ColumnName: "name", ColumnType: "VARCHAR", ColumnPosition: 2},
		{ID: "col-003", DatabaseName: "test_db", TableName: "orders", ColumnName: "id", ColumnType: "INTEGER", ColumnPosition: 1},
	}

	service := NewAssetService(assetRepo)

	columns, err := service.ListColumns(context.Background(), "test_db", "users")

	require.NoError(t, err)
	assert.Len(t, columns, 2)

	// Verify columns belong to the correct table
	for _, col := range columns {
		assert.Equal(t, "test_db", col.DatabaseName)
		assert.Equal(t, "users", col.TableName)
	}
}

func TestAssetServiceListColumns_EmptyResult(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()

	service := NewAssetService(assetRepo)

	columns, err := service.ListColumns(context.Background(), "test_db", "nonexistent_table")

	require.NoError(t, err)
	assert.Empty(t, columns)
}

func TestAssetServiceGetDatabase(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	timestamp := time.Now()
	assetRepo.Databases = []domain.Database{
		{ID: "db-001", Name: "test_db", OwnerName: "admin", CreateTimestamp: timestamp},
	}

	service := NewAssetService(assetRepo)

	db, err := service.GetDatabase(context.Background(), "test_db")

	require.NoError(t, err)
	assert.Equal(t, "db-001", db.ID)
	assert.Equal(t, "test_db", db.Name)
	assert.Equal(t, "admin", db.OwnerName)
}

func TestAssetServiceGetDatabase_NotFound(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()

	service := NewAssetService(assetRepo)

	_, err := service.GetDatabase(context.Background(), "nonexistent")

	assert.Error(t, err)
}

func TestAssetServiceGetTable(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	assetRepo.Tables = []domain.Table{
		{ID: "tbl-001", DatabaseName: "test_db", TableName: "users", TableKind: "T", RowCount: 1000},
	}

	service := NewAssetService(assetRepo)

	table, err := service.GetTable(context.Background(), "test_db", "users")

	require.NoError(t, err)
	assert.Equal(t, "tbl-001", table.ID)
	assert.Equal(t, "users", table.TableName)
	assert.Equal(t, int64(1000), table.RowCount)
}

func TestAssetServiceGetColumn(t *testing.T) {
	assetRepo := mocks.NewMockAssetRepository()
	assetRepo.Columns = []domain.Column{
		{ID: "col-001", DatabaseName: "test_db", TableName: "users", ColumnName: "email", ColumnType: "VARCHAR", ColumnLength: 255},
	}

	service := NewAssetService(assetRepo)

	col, err := service.GetColumn(context.Background(), "test_db", "users", "email")

	require.NoError(t, err)
	assert.Equal(t, "col-001", col.ID)
	assert.Equal(t, "email", col.ColumnName)
	assert.Equal(t, "VARCHAR", col.ColumnType)
	assert.Equal(t, 255, col.ColumnLength)
}
