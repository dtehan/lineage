package redis

import (
	"fmt"
	"strings"
)

// Cache key format: ol:{entity}:{operation}:{params}
// Composite parameters use pipe (|) as delimiter.
// Colons separate structural segments; pipes separate parameter values.

// LineageGraphKey builds the cache key for GetColumnLineageGraph.
// Format: ol:lineage:graph:{datasetID}|{fieldName}|{direction}
func LineageGraphKey(datasetID, fieldName, direction string) string {
	return fmt.Sprintf("ol:lineage:graph:%s|%s|%s", datasetID, fieldName, direction)
}

// DatasetKey builds the cache key for GetDataset.
// Format: ol:dataset:get:{datasetID}
func DatasetKey(datasetID string) string {
	return fmt.Sprintf("ol:dataset:get:%s", datasetID)
}

// NamespacesKey builds the cache key for ListNamespaces.
// Format: ol:namespace:list
func NamespacesKey() string {
	return "ol:namespace:list"
}

// NamespaceKey builds the cache key for GetNamespace.
// Format: ol:namespace:get:{namespaceID}
func NamespaceKey(namespaceID string) string {
	return fmt.Sprintf("ol:namespace:get:%s", namespaceID)
}

// DatasetsKey builds the cache key for ListDatasets.
// Format: ol:dataset:list:{namespaceID}|{limit}|{offset}
func DatasetsKey(namespaceID string, limit, offset int) string {
	return fmt.Sprintf("ol:dataset:list:%s|%d|%d", namespaceID, limit, offset)
}

// DatasetSearchKey builds the cache key for SearchDatasets.
// Normalizes query to uppercase and trims whitespace for Teradata case-insensitive matching.
// Format: ol:dataset:search:{QUERY}|{limit}
func DatasetSearchKey(query string, limit int) string {
	return fmt.Sprintf("ol:dataset:search:%s|%d", strings.ToUpper(strings.TrimSpace(query)), limit)
}

// FieldsKey builds the cache key for ListFields.
// Format: ol:field:list:{datasetID}
func FieldsKey(datasetID string) string {
	return fmt.Sprintf("ol:field:list:%s", datasetID)
}

// DatasetStatisticsKey builds the cache key for GetDatasetStatistics.
// Format: ol:dataset:statistics:{datasetID}
func DatasetStatisticsKey(datasetID string) string {
	return fmt.Sprintf("ol:dataset:statistics:%s", datasetID)
}

// DatasetDDLKey builds the cache key for GetDatasetDDL.
// Format: ol:dataset:ddl:{datasetID}
func DatasetDDLKey(datasetID string) string {
	return fmt.Sprintf("ol:dataset:ddl:%s", datasetID)
}
