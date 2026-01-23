package domain

import "time"

type Database struct {
	ID              string    `json:"id" db:"database_id"`
	Name            string    `json:"name" db:"database_name"`
	OwnerName       string    `json:"ownerName,omitempty" db:"owner_name"`
	CreateTimestamp time.Time `json:"createTimestamp,omitempty" db:"create_timestamp"`
	CommentString   string    `json:"commentString,omitempty" db:"comment_string"`
}

type Table struct {
	ID              string    `json:"id" db:"table_id"`
	DatabaseName    string    `json:"databaseName" db:"database_name"`
	TableName       string    `json:"tableName" db:"table_name"`
	TableKind       string    `json:"tableKind" db:"table_kind"`
	CreateTimestamp time.Time `json:"createTimestamp,omitempty" db:"create_timestamp"`
	CommentString   string    `json:"commentString,omitempty" db:"comment_string"`
	RowCount        int64     `json:"rowCount,omitempty" db:"row_count"`
}

type Column struct {
	ID             string `json:"id" db:"column_id"`
	DatabaseName   string `json:"databaseName" db:"database_name"`
	TableName      string `json:"tableName" db:"table_name"`
	ColumnName     string `json:"columnName" db:"column_name"`
	ColumnType     string `json:"columnType" db:"column_type"`
	ColumnLength   int    `json:"columnLength,omitempty" db:"column_length"`
	Nullable       bool   `json:"nullable" db:"nullable"`
	CommentString  string `json:"commentString,omitempty" db:"comment_string"`
	ColumnPosition int    `json:"columnPosition" db:"column_position"`
}

type ColumnLineage struct {
	LineageID          string  `json:"lineageId" db:"lineage_id"`
	SourceColumnID     string  `json:"sourceColumnId" db:"source_column_id"`
	SourceDatabase     string  `json:"sourceDatabase" db:"source_database"`
	SourceTable        string  `json:"sourceTable" db:"source_table"`
	SourceColumn       string  `json:"sourceColumn" db:"source_column"`
	TargetColumnID     string  `json:"targetColumnId" db:"target_column_id"`
	TargetDatabase     string  `json:"targetDatabase" db:"target_database"`
	TargetTable        string  `json:"targetTable" db:"target_table"`
	TargetColumn       string  `json:"targetColumn" db:"target_column"`
	TransformationType string  `json:"transformationType" db:"transformation_type"`
	ConfidenceScore    float64 `json:"confidenceScore" db:"confidence_score"`
	Depth              int     `json:"depth,omitempty"`
}

type LineageGraph struct {
	Nodes []LineageNode `json:"nodes"`
	Edges []LineageEdge `json:"edges"`
}

type LineageNode struct {
	ID           string         `json:"id"`
	Type         string         `json:"type"`
	DatabaseName string         `json:"databaseName"`
	TableName    string         `json:"tableName,omitempty"`
	ColumnName   string         `json:"columnName,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

type LineageEdge struct {
	ID                 string  `json:"id"`
	Source             string  `json:"source"`
	Target             string  `json:"target"`
	TransformationType string  `json:"transformationType,omitempty"`
	ConfidenceScore    float64 `json:"confidenceScore,omitempty"`
}

type AssetType string

const (
	AssetTypeDatabase AssetType = "database"
	AssetTypeTable    AssetType = "table"
	AssetTypeColumn   AssetType = "column"
)

type SearchResult struct {
	ID           string    `json:"id"`
	Type         AssetType `json:"type"`
	DatabaseName string    `json:"databaseName"`
	TableName    string    `json:"tableName,omitempty"`
	ColumnName   string    `json:"columnName,omitempty"`
	MatchedOn    string    `json:"matchedOn"`
	Score        float64   `json:"score"`
}
