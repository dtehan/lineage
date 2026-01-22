// Package domain contains the core domain entities and repository interfaces.
package domain

import "time"

// Database represents a database in the asset registry.
type Database struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	OwnerName       string    `json:"ownerName,omitempty"`
	CreateTimestamp time.Time `json:"createTimestamp,omitempty"`
	CommentString   string    `json:"commentString,omitempty"`
}

// Table represents a table or view in the asset registry.
type Table struct {
	ID              string    `json:"id"`
	DatabaseName    string    `json:"databaseName"`
	TableName       string    `json:"tableName"`
	TableKind       string    `json:"tableKind"` // T=Table, V=View
	CreateTimestamp time.Time `json:"createTimestamp,omitempty"`
	CommentString   string    `json:"commentString,omitempty"`
	RowCount        int64     `json:"rowCount,omitempty"`
}

// Column represents a column in the asset registry.
type Column struct {
	ID             string `json:"id"`
	DatabaseName   string `json:"databaseName"`
	TableName      string `json:"tableName"`
	ColumnName     string `json:"columnName"`
	ColumnType     string `json:"columnType"`
	ColumnLength   int    `json:"columnLength,omitempty"`
	Nullable       bool   `json:"nullable"`
	CommentString  string `json:"commentString,omitempty"`
	ColumnPosition int    `json:"columnPosition"`
}

// ColumnLineage represents a column-to-column lineage relationship.
type ColumnLineage struct {
	LineageID          string  `json:"lineageId"`
	SourceColumnID     string  `json:"sourceColumnId"`
	SourceDatabase     string  `json:"sourceDatabase"`
	SourceTable        string  `json:"sourceTable"`
	SourceColumn       string  `json:"sourceColumn"`
	TargetColumnID     string  `json:"targetColumnId"`
	TargetDatabase     string  `json:"targetDatabase"`
	TargetTable        string  `json:"targetTable"`
	TargetColumn       string  `json:"targetColumn"`
	TransformationType string  `json:"transformationType"`
	ConfidenceScore    float64 `json:"confidenceScore"`
	Depth              int     `json:"depth,omitempty"`
}

// LineageGraph represents a graph of lineage nodes and edges.
type LineageGraph struct {
	Nodes []LineageNode `json:"nodes"`
	Edges []LineageEdge `json:"edges"`
}

// LineageNode represents a node in the lineage graph.
type LineageNode struct {
	ID           string         `json:"id"`
	Type         string         `json:"type"` // database, table, column
	DatabaseName string         `json:"databaseName"`
	TableName    string         `json:"tableName,omitempty"`
	ColumnName   string         `json:"columnName,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

// LineageEdge represents an edge in the lineage graph.
type LineageEdge struct {
	ID                 string  `json:"id"`
	Source             string  `json:"source"`
	Target             string  `json:"target"`
	TransformationType string  `json:"transformationType,omitempty"`
	ConfidenceScore    float64 `json:"confidenceScore,omitempty"`
}

// AssetType represents the type of an asset.
type AssetType string

const (
	AssetTypeDatabase AssetType = "database"
	AssetTypeTable    AssetType = "table"
	AssetTypeColumn   AssetType = "column"
)

// SearchResult represents a search result.
type SearchResult struct {
	ID           string    `json:"id"`
	Type         AssetType `json:"type"`
	DatabaseName string    `json:"databaseName"`
	TableName    string    `json:"tableName,omitempty"`
	ColumnName   string    `json:"columnName,omitempty"`
	MatchedOn    string    `json:"matchedOn"`
	Score        float64   `json:"score"`
}
