package application

import (
	"context"

	"github.com/your-org/lineage-api/internal/domain"
)

// AssetService provides asset-related use cases.
type AssetService struct {
	assetRepo domain.AssetRepository
}

// NewAssetService creates a new AssetService.
func NewAssetService(assetRepo domain.AssetRepository) *AssetService {
	return &AssetService{
		assetRepo: assetRepo,
	}
}

// ListDatabases returns all databases.
func (s *AssetService) ListDatabases(ctx context.Context) ([]domain.Database, error) {
	return s.assetRepo.ListDatabases(ctx)
}

// GetDatabase returns a database by name.
func (s *AssetService) GetDatabase(ctx context.Context, name string) (*domain.Database, error) {
	return s.assetRepo.GetDatabase(ctx, name)
}

// ListTables returns all tables for a database.
func (s *AssetService) ListTables(ctx context.Context, databaseName string) ([]domain.Table, error) {
	return s.assetRepo.ListTables(ctx, databaseName)
}

// GetTable returns a table by database and table name.
func (s *AssetService) GetTable(ctx context.Context, databaseName, tableName string) (*domain.Table, error) {
	return s.assetRepo.GetTable(ctx, databaseName, tableName)
}

// ListColumns returns all columns for a table.
func (s *AssetService) ListColumns(ctx context.Context, databaseName, tableName string) ([]domain.Column, error) {
	return s.assetRepo.ListColumns(ctx, databaseName, tableName)
}

// GetColumn returns a column by database, table, and column name.
func (s *AssetService) GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*domain.Column, error) {
	return s.assetRepo.GetColumn(ctx, databaseName, tableName, columnName)
}
