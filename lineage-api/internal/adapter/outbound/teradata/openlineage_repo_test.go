package teradata

import (
	"strings"
	"testing"

	"github.com/lineage-api/internal/domain"
)

func TestNewOpenLineageRepository(t *testing.T) {
	repo := NewOpenLineageRepository(nil)
	if repo == nil {
		t.Error("NewOpenLineageRepository returned nil")
	}
}

func TestBuildUpstreamQuery(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildUpstreamQuery(5)

	// Verify query contains key elements
	if query == "" {
		t.Error("buildUpstreamQuery returned empty query")
	}

	// Check for recursive CTE structure
	expectedPatterns := []string{
		"WITH RECURSIVE",
		"lineage_path",
		"OL_COLUMN_LINEAGE",
		"target_dataset = ?",
		"target_field = ?",
		"depth + 1",
		"depth < 5",
		"POSITION",      // Cycle detection
		"is_active = 'Y'",
	}

	for _, pattern := range expectedPatterns {
		if !strings.Contains(query, pattern) {
			t.Errorf("buildUpstreamQuery missing pattern: %s", pattern)
		}
	}
}

func TestBuildDownstreamQuery(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildDownstreamQuery(10)

	expectedPatterns := []string{
		"WITH RECURSIVE",
		"source_dataset = ?",
		"source_field = ?",
		"depth < 10",
		"POSITION", // Cycle detection
	}

	for _, pattern := range expectedPatterns {
		if !strings.Contains(query, pattern) {
			t.Errorf("buildDownstreamQuery missing pattern: %s", pattern)
		}
	}
}

func TestBuildBidirectionalQuery(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildBidirectionalQuery(3)

	expectedPatterns := []string{
		"upstream_path",
		"downstream_path",
		"UNION",
		"depth < 3",
		"POSITION", // Cycle detection
	}

	for _, pattern := range expectedPatterns {
		if !strings.Contains(query, pattern) {
			t.Errorf("buildBidirectionalQuery missing pattern: %s", pattern)
		}
	}
}

func TestBuildUpstreamQuery_MaxDepthEnforced(t *testing.T) {
	repo := &OpenLineageRepository{}

	testCases := []struct {
		maxDepth int
		expected string
	}{
		{1, "depth < 1"},
		{5, "depth < 5"},
		{20, "depth < 20"},
	}

	for _, tc := range testCases {
		query := repo.buildUpstreamQuery(tc.maxDepth)
		if !strings.Contains(query, tc.expected) {
			t.Errorf("buildUpstreamQuery(%d) should contain %q", tc.maxDepth, tc.expected)
		}
	}
}

func TestBuildDownstreamQuery_MaxDepthEnforced(t *testing.T) {
	repo := &OpenLineageRepository{}

	testCases := []struct {
		maxDepth int
		expected string
	}{
		{1, "depth < 1"},
		{10, "depth < 10"},
		{20, "depth < 20"},
	}

	for _, tc := range testCases {
		query := repo.buildDownstreamQuery(tc.maxDepth)
		if !strings.Contains(query, tc.expected) {
			t.Errorf("buildDownstreamQuery(%d) should contain %q", tc.maxDepth, tc.expected)
		}
	}
}

func TestBuildBidirectionalQuery_MaxDepthEnforcedBothDirections(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildBidirectionalQuery(7)

	// Should have depth check for both upstream and downstream paths
	// Count occurrences of "depth < 7"
	count := strings.Count(query, "depth < 7")
	if count != 2 {
		t.Errorf("buildBidirectionalQuery should have depth check in both CTEs, found %d occurrences", count)
	}
}

func TestBuildUpstreamQuery_CycleDetection(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildUpstreamQuery(5)

	// Verify cycle detection mechanism is present
	if !strings.Contains(query, "POSITION") {
		t.Error("buildUpstreamQuery should include POSITION for cycle detection")
	}
	if !strings.Contains(query, "path") {
		t.Error("buildUpstreamQuery should track path for cycle detection")
	}
}

func TestBuildDownstreamQuery_CycleDetection(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildDownstreamQuery(5)

	// Verify cycle detection mechanism is present
	if !strings.Contains(query, "POSITION") {
		t.Error("buildDownstreamQuery should include POSITION for cycle detection")
	}
}

func TestBuildBidirectionalQuery_CycleDetection(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildBidirectionalQuery(5)

	// Verify cycle detection in both paths
	// Should have POSITION check in both upstream and downstream
	count := strings.Count(query, "POSITION")
	if count < 2 {
		t.Errorf("buildBidirectionalQuery should have POSITION in both CTEs, found %d occurrences", count)
	}
}

func TestInterfaceCompliance(t *testing.T) {
	// Verify OpenLineageRepository implements domain.OpenLineageRepository
	var _ domain.OpenLineageRepository = (*OpenLineageRepository)(nil)
}

func TestBuildUpstreamQuery_QueryStructure(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildUpstreamQuery(5)

	// Verify the query follows proper CTE structure
	requiredClauses := []string{
		"SELECT DISTINCT", // Final SELECT should be DISTINCT
		"ORDER BY depth",  // Results should be ordered by depth
		"FROM lineage_path", // Should select from the CTE
	}

	for _, clause := range requiredClauses {
		if !strings.Contains(query, clause) {
			t.Errorf("buildUpstreamQuery should contain %q", clause)
		}
	}
}

func TestBuildDownstreamQuery_QueryStructure(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildDownstreamQuery(5)

	requiredClauses := []string{
		"SELECT DISTINCT",
		"ORDER BY depth",
		"FROM lineage_path",
	}

	for _, clause := range requiredClauses {
		if !strings.Contains(query, clause) {
			t.Errorf("buildDownstreamQuery should contain %q", clause)
		}
	}
}

func TestBuildBidirectionalQuery_QueryStructure(t *testing.T) {
	repo := &OpenLineageRepository{}
	query := repo.buildBidirectionalQuery(5)

	requiredClauses := []string{
		"SELECT DISTINCT",
		"ORDER BY depth",
		"combined", // Should select from combined results
	}

	for _, clause := range requiredClauses {
		if !strings.Contains(query, clause) {
			t.Errorf("buildBidirectionalQuery should contain %q", clause)
		}
	}
}
