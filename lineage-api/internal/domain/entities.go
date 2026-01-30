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

// OpenLineage transformation types
type TransformationType string

const (
	TransformationDirect   TransformationType = "DIRECT"
	TransformationIndirect TransformationType = "INDIRECT"
)

// OpenLineage transformation subtypes
type TransformationSubtype string

const (
	SubtypeIdentity       TransformationSubtype = "IDENTITY"
	SubtypeTransformation TransformationSubtype = "TRANSFORMATION"
	SubtypeAggregation    TransformationSubtype = "AGGREGATION"
	SubtypeJoin           TransformationSubtype = "JOIN"
	SubtypeFilter         TransformationSubtype = "FILTER"
	SubtypeGroupBy        TransformationSubtype = "GROUP_BY"
	SubtypeSort           TransformationSubtype = "SORT"
	SubtypeWindow         TransformationSubtype = "WINDOW"
	SubtypeConditional    TransformationSubtype = "CONDITIONAL"
)

// OpenLineageNamespace represents a data source namespace (e.g., teradata://host:port)
type OpenLineageNamespace struct {
	ID          string    `json:"id" db:"namespace_id"`
	URI         string    `json:"uri" db:"namespace_uri"`
	Description string    `json:"description,omitempty" db:"description"`
	SpecVersion string    `json:"specVersion" db:"spec_version"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// OpenLineageDataset represents a dataset (table) in OpenLineage format
type OpenLineageDataset struct {
	ID          string    `json:"id" db:"dataset_id"`
	NamespaceID string    `json:"namespaceId" db:"namespace_id"`
	Name        string    `json:"name" db:"name"` // Format: database.table
	Description string    `json:"description,omitempty" db:"description"`
	SourceType  string    `json:"sourceType,omitempty" db:"source_type"` // TABLE, VIEW
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
	IsActive    bool      `json:"isActive" db:"is_active"`
}

// OpenLineageField represents a field (column) in a dataset
type OpenLineageField struct {
	ID              string    `json:"id" db:"field_id"`
	DatasetID       string    `json:"datasetId" db:"dataset_id"`
	Name            string    `json:"name" db:"field_name"`
	Type            string    `json:"type,omitempty" db:"field_type"`
	Description     string    `json:"description,omitempty" db:"field_description"`
	OrdinalPosition int       `json:"ordinalPosition" db:"ordinal_position"`
	Nullable        bool      `json:"nullable" db:"nullable"`
	CreatedAt       time.Time `json:"createdAt" db:"created_at"`
}

// OpenLineageJob represents a job (ETL process)
type OpenLineageJob struct {
	ID          string    `json:"id" db:"job_id"`
	NamespaceID string    `json:"namespaceId" db:"namespace_id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description,omitempty" db:"description"`
	JobType     string    `json:"jobType,omitempty" db:"job_type"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
}

// OpenLineageRun represents a job execution run
type OpenLineageRun struct {
	ID               string    `json:"id" db:"run_id"`
	JobID            string    `json:"jobId" db:"job_id"`
	EventType        string    `json:"eventType" db:"event_type"` // START, RUNNING, COMPLETE, ABORT, FAIL
	EventTime        time.Time `json:"eventTime" db:"event_time"`
	NominalStartTime time.Time `json:"nominalStartTime,omitempty" db:"nominal_start_time"`
	NominalEndTime   time.Time `json:"nominalEndTime,omitempty" db:"nominal_end_time"`
	Producer         string    `json:"producer,omitempty" db:"producer"`
	SchemaURL        string    `json:"schemaUrl,omitempty" db:"schema_url"`
	CreatedAt        time.Time `json:"createdAt" db:"created_at"`
}

// OpenLineageColumnLineage represents column-level lineage in OpenLineage format
type OpenLineageColumnLineage struct {
	ID                        string                `json:"id" db:"lineage_id"`
	RunID                     string                `json:"runId,omitempty" db:"run_id"`
	SourceNamespace           string                `json:"sourceNamespace" db:"source_namespace"`
	SourceDataset             string                `json:"sourceDataset" db:"source_dataset"`
	SourceField               string                `json:"sourceField" db:"source_field"`
	TargetNamespace           string                `json:"targetNamespace" db:"target_namespace"`
	TargetDataset             string                `json:"targetDataset" db:"target_dataset"`
	TargetField               string                `json:"targetField" db:"target_field"`
	TransformationType        TransformationType    `json:"transformationType" db:"transformation_type"`
	TransformationSubtype     TransformationSubtype `json:"transformationSubtype" db:"transformation_subtype"`
	TransformationDescription string                `json:"transformationDescription,omitempty" db:"transformation_description"`
	Masking                   bool                  `json:"masking" db:"masking"`
	ConfidenceScore           float64               `json:"confidenceScore" db:"confidence_score"`
	DiscoveredAt              time.Time             `json:"discoveredAt" db:"discovered_at"`
	IsActive                  bool                  `json:"isActive" db:"is_active"`
	Depth                     int                   `json:"depth,omitempty"` // For graph traversal
}

// OpenLineageGraph represents a lineage graph in OpenLineage format
type OpenLineageGraph struct {
	Nodes []OpenLineageNode `json:"nodes"`
	Edges []OpenLineageEdge `json:"edges"`
}

// OpenLineageNode represents a node in the OpenLineage graph
type OpenLineageNode struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"` // dataset, field
	Namespace string         `json:"namespace"`
	Dataset   string         `json:"dataset"`
	Field     string         `json:"field,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// OpenLineageEdge represents an edge in the OpenLineage graph
type OpenLineageEdge struct {
	ID                    string                `json:"id"`
	Source                string                `json:"source"`
	Target                string                `json:"target"`
	TransformationType    TransformationType    `json:"transformationType"`
	TransformationSubtype TransformationSubtype `json:"transformationSubtype"`
	ConfidenceScore       float64               `json:"confidenceScore,omitempty"`
}
