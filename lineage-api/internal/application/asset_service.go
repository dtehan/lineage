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
