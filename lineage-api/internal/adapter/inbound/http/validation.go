package http

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5/middleware"
)

// Package-level validation configuration with safe defaults.
// These are initialized via SetValidationConfig from main.go at startup.
var (
	validationMinMaxDepth     = 1
	validationMaxDepthLimit   = 20
	validationDefaultMaxDepth = 5
)

// SetValidationConfig initializes the validation bounds from configuration.
// Must be called at startup before handling any requests.
func SetValidationConfig(minMaxDepth, maxDepthLimit, defaultMaxDepth int) {
	validationMinMaxDepth = minMaxDepth
	validationMaxDepthLimit = maxDepthLimit
	validationDefaultMaxDepth = defaultMaxDepth
}

// FieldError represents a validation error for a specific field.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrorResponse represents the structured response for validation errors.
// Implements VALID-03: error code, descriptive message, and request ID.
type ValidationErrorResponse struct {
	Error     string       `json:"error"`
	Code      string       `json:"code"`
	RequestID string       `json:"request_id"`
	Details   []FieldError `json:"details"`
}

// validDirections defines the allowlist for the direction parameter.
var validDirections = map[string]bool{
	"upstream":   true,
	"downstream": true,
	"both":       true,
}

// parseAndValidateLineageParams validates direction and maxDepth parameters for GetLineage.
// Returns the validated values and any field errors.
// Empty parameters use defaults (not errors per requirement).
func parseAndValidateLineageParams(r *http.Request) (direction string, maxDepth int, errors []FieldError) {
	errors = make([]FieldError, 0)

	// Validate direction
	direction = r.URL.Query().Get("direction")
	if direction == "" {
		direction = "both" // default
	} else if !validDirections[direction] {
		errors = append(errors, FieldError{
			Field:   "direction",
			Message: fmt.Sprintf("direction must be one of: upstream, downstream, both (got: %q)", direction),
		})
	}

	// Validate maxDepth
	maxDepthStr := r.URL.Query().Get("maxDepth")
	if maxDepthStr == "" {
		maxDepth = validationDefaultMaxDepth // default
	} else {
		var err error
		maxDepth, err = strconv.Atoi(maxDepthStr)
		if err != nil {
			errors = append(errors, FieldError{
				Field:   "maxDepth",
				Message: fmt.Sprintf("maxDepth must be an integer (got: %q)", maxDepthStr),
			})
		} else if maxDepth < validationMinMaxDepth || maxDepth > validationMaxDepthLimit {
			errors = append(errors, FieldError{
				Field:   "maxDepth",
				Message: fmt.Sprintf("maxDepth must be between %d and %d (got: %d)", validationMinMaxDepth, validationMaxDepthLimit, maxDepth),
			})
		}
	}

	return direction, maxDepth, errors
}

// parseAndValidateMaxDepth validates only the maxDepth parameter.
// Used by upstream, downstream, and impact endpoints that don't have direction.
// Returns the validated maxDepth and any field errors.
func parseAndValidateMaxDepth(r *http.Request, defaultDepth int) (maxDepth int, errors []FieldError) {
	errors = make([]FieldError, 0)

	maxDepthStr := r.URL.Query().Get("maxDepth")
	if maxDepthStr == "" {
		maxDepth = defaultDepth // use caller-specified default
	} else {
		var err error
		maxDepth, err = strconv.Atoi(maxDepthStr)
		if err != nil {
			errors = append(errors, FieldError{
				Field:   "maxDepth",
				Message: fmt.Sprintf("maxDepth must be an integer (got: %q)", maxDepthStr),
			})
		} else if maxDepth < validationMinMaxDepth || maxDepth > validationMaxDepthLimit {
			errors = append(errors, FieldError{
				Field:   "maxDepth",
				Message: fmt.Sprintf("maxDepth must be between %d and %d (got: %d)", validationMinMaxDepth, validationMaxDepthLimit, maxDepth),
			})
		}
	}

	return maxDepth, errors
}

// respondValidationError writes a 400 Bad Request response with validation error details.
// Implements VALID-03 requirements: error code, descriptive message, request ID.
func respondValidationError(w http.ResponseWriter, r *http.Request, fieldErrors []FieldError) {
	reqID := middleware.GetReqID(r.Context())
	respondJSON(w, http.StatusBadRequest, ValidationErrorResponse{
		Error:     "Validation failed",
		Code:      "VALIDATION_ERROR",
		RequestID: reqID,
		Details:   fieldErrors,
	})
}
