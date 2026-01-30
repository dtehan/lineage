package application

import (
	"context"

	"github.com/lineage-api/internal/domain"
)

type AssetService struct {
	assetRepo domain.AssetRepository
}

func NewAssetService(assetRepo domain.AssetRepository) *AssetService {
	return &AssetService{assetRepo: assetRepo}
}

func (s *AssetService) ListDatabases(ctx context.Context) ([]domain.Database, error) {
	return s.assetRepo.ListDatabases(ctx)
}

func (s *AssetService) GetDatabase(ctx context.Context, name string) (*domain.Database, error) {
	return s.assetRepo.GetDatabase(ctx, name)
}

func (s *AssetService) ListTables(ctx context.Context, databaseName string) ([]domain.Table, error) {
	return s.assetRepo.ListTables(ctx, databaseName)
}

func (s *AssetService) GetTable(ctx context.Context, databaseName, tableName string) (*domain.Table, error) {
	return s.assetRepo.GetTable(ctx, databaseName, tableName)
}

func (s *AssetService) ListColumns(ctx context.Context, databaseName, tableName string) ([]domain.Column, error) {
	return s.assetRepo.ListColumns(ctx, databaseName, tableName)
}

func (s *AssetService) GetColumn(ctx context.Context, databaseName, tableName, columnName string) (*domain.Column, error) {
	return s.assetRepo.GetColumn(ctx, databaseName, tableName, columnName)
}

// ListDatabasesPaginated returns a paginated list of databases.
func (s *AssetService) ListDatabasesPaginated(ctx context.Context, limit, offset int) ([]domain.Database, int, error) {
	return s.assetRepo.ListDatabasesPaginated(ctx, limit, offset)
}

// ListTablesPaginated returns a paginated list of tables for a database.
func (s *AssetService) ListTablesPaginated(ctx context.Context, databaseName string, limit, offset int) ([]domain.Table, int, error) {
	return s.assetRepo.ListTablesPaginated(ctx, databaseName, limit, offset)
}

// ListColumnsPaginated returns a paginated list of columns for a table.
func (s *AssetService) ListColumnsPaginated(ctx context.Context, databaseName, tableName string, limit, offset int) ([]domain.Column, int, error) {
	return s.assetRepo.ListColumnsPaginated(ctx, databaseName, tableName, limit, offset)
}
