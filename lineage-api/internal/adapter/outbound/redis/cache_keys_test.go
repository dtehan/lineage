package redis

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// --- Determinism tests: same params must produce same key ---

func TestLineageGraphKey_Deterministic(t *testing.T) {
	key1 := LineageGraphKey("42", "customer_id", "upstream")
	key2 := LineageGraphKey("42", "customer_id", "upstream")
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:lineage:graph:42|customer_id|upstream", key1)
}

func TestDatasetKey_Deterministic(t *testing.T) {
	key1 := DatasetKey("42")
	key2 := DatasetKey("42")
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:dataset:get:42", key1)
}

func TestNamespacesKey_Deterministic(t *testing.T) {
	key1 := NamespacesKey()
	key2 := NamespacesKey()
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:namespace:list", key1)
}

func TestNamespaceKey_Deterministic(t *testing.T) {
	key1 := NamespaceKey("1")
	key2 := NamespaceKey("1")
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:namespace:get:1", key1)
}

func TestDatasetsKey_Deterministic(t *testing.T) {
	key1 := DatasetsKey("1", 50, 0)
	key2 := DatasetsKey("1", 50, 0)
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:dataset:list:1|50|0", key1)
}

func TestDatasetSearchKey_Deterministic(t *testing.T) {
	key1 := DatasetSearchKey("CUSTOMERS", 50)
	key2 := DatasetSearchKey("CUSTOMERS", 50)
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:dataset:search:CUSTOMERS|50", key1)
}

func TestFieldsKey_Deterministic(t *testing.T) {
	key1 := FieldsKey("42")
	key2 := FieldsKey("42")
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:field:list:42", key1)
}

func TestDatasetStatisticsKey_Deterministic(t *testing.T) {
	key1 := DatasetStatisticsKey("42")
	key2 := DatasetStatisticsKey("42")
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:dataset:statistics:42", key1)
}

func TestDatasetDDLKey_Deterministic(t *testing.T) {
	key1 := DatasetDDLKey("42")
	key2 := DatasetDDLKey("42")
	assert.Equal(t, key1, key2, "same params must produce same key")
	assert.Equal(t, "ol:dataset:ddl:42", key1)
}

// --- Differentiation tests: different params produce different keys ---

func TestLineageGraphKey_DifferentParams_DifferentKeys(t *testing.T) {
	key1 := LineageGraphKey("42", "customer_id", "upstream")
	key2 := LineageGraphKey("42", "customer_id", "downstream")
	key3 := LineageGraphKey("43", "customer_id", "upstream")
	key4 := LineageGraphKey("42", "order_id", "upstream")
	assert.NotEqual(t, key1, key2, "different direction must produce different key")
	assert.NotEqual(t, key1, key3, "different datasetID must produce different key")
	assert.NotEqual(t, key1, key4, "different fieldName must produce different key")
}

func TestDatasetsKey_DifferentParams_DifferentKeys(t *testing.T) {
	key1 := DatasetsKey("1", 50, 0)
	key2 := DatasetsKey("2", 50, 0)
	key3 := DatasetsKey("1", 100, 0)
	key4 := DatasetsKey("1", 50, 50)
	assert.NotEqual(t, key1, key2, "different namespaceID must produce different key")
	assert.NotEqual(t, key1, key3, "different limit must produce different key")
	assert.NotEqual(t, key1, key4, "different offset must produce different key")
}

func TestDatasetSearchKey_DifferentParams_DifferentKeys(t *testing.T) {
	key1 := DatasetSearchKey("CUSTOMERS", 50)
	key2 := DatasetSearchKey("ORDERS", 50)
	key3 := DatasetSearchKey("CUSTOMERS", 100)
	assert.NotEqual(t, key1, key2, "different query must produce different key")
	assert.NotEqual(t, key1, key3, "different limit must produce different key")
}

// --- Format tests: all keys start with "ol:" and follow ol:{entity}:{operation}:{params} ---

func TestAllKeys_FollowFormat(t *testing.T) {
	tests := []struct {
		name string
		key  string
	}{
		{"lineage graph", LineageGraphKey("42", "col_a", "both")},
		{"dataset get", DatasetKey("42")},
		{"namespace list", NamespacesKey()},
		{"namespace get", NamespaceKey("1")},
		{"dataset list", DatasetsKey("1", 50, 0)},
		{"dataset search", DatasetSearchKey("CUSTOMERS", 50)},
		{"field list", FieldsKey("42")},
		{"dataset statistics", DatasetStatisticsKey("42")},
		{"dataset ddl", DatasetDDLKey("42")},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.True(t, strings.HasPrefix(tc.key, "ol:"),
				"all keys must start with ol: prefix, got: %s", tc.key)

			// Verify format: at least 3 colon-separated segments (ol:entity:operation[:params])
			segments := strings.SplitN(tc.key, ":", 4)
			assert.GreaterOrEqual(t, len(segments), 3,
				"key must have at least 3 colon segments (ol:entity:operation), got: %s", tc.key)
			assert.Equal(t, "ol", segments[0], "first segment must be 'ol'")
			assert.NotEmpty(t, segments[1], "entity segment must not be empty")
			assert.NotEmpty(t, segments[2], "operation segment must not be empty")
		})
	}
}

// --- Search normalization tests ---

func TestDatasetSearchKey_CaseNormalization(t *testing.T) {
	keyLower := DatasetSearchKey("customers", 50)
	keyUpper := DatasetSearchKey("CUSTOMERS", 50)
	keyMixed := DatasetSearchKey("Customers", 50)
	assert.Equal(t, keyLower, keyUpper, "case-different queries must produce same key")
	assert.Equal(t, keyLower, keyMixed, "case-different queries must produce same key")
}

func TestDatasetSearchKey_WhitespaceTrimming(t *testing.T) {
	keyTrimmed := DatasetSearchKey("CUSTOMERS", 50)
	keyPadded := DatasetSearchKey("  CUSTOMERS  ", 50)
	keyTabbed := DatasetSearchKey("\tCUSTOMERS\t", 50)
	assert.Equal(t, keyTrimmed, keyPadded, "whitespace-padded queries must produce same key")
	assert.Equal(t, keyTrimmed, keyTabbed, "tab-padded queries must produce same key")
}

// --- Pipe delimiter tests ---

func TestCompositeKeys_UsePipeDelimiter(t *testing.T) {
	// Lineage graph key uses pipe between params, not colon
	lineageKey := LineageGraphKey("42", "col_a", "both")
	assert.Equal(t, "ol:lineage:graph:42|col_a|both", lineageKey,
		"composite params must use pipe delimiter")

	// Datasets key uses pipe between params
	datasetsKey := DatasetsKey("1", 50, 0)
	assert.Equal(t, "ol:dataset:list:1|50|0", datasetsKey,
		"composite params must use pipe delimiter")

	// Search key uses pipe between params
	searchKey := DatasetSearchKey("CUSTOMERS", 50)
	assert.Equal(t, "ol:dataset:search:CUSTOMERS|50", searchKey,
		"composite params must use pipe delimiter")

	// Verify pipe is used in params, not extra colons
	// After the third colon, params should contain pipes not colons
	partsLineage := strings.SplitN(lineageKey, ":", 4)
	assert.NotContains(t, partsLineage[3], ":",
		"params segment must not contain colons")
	assert.Contains(t, partsLineage[3], "|",
		"params segment must contain pipe delimiters")
}
