package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

// ErrorResponse represents a structured error response with request correlation.
type ErrorResponse struct {
	Error     string `json:"error"`
	RequestID string `json:"request_id"`
}

// respondJSON writes a JSON response with the given status code and data.
func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// respondError writes a JSON error response with request ID for correlation.
// The request ID is extracted from the request context (set by Chi's RequestID middleware).
func respondError(w http.ResponseWriter, r *http.Request, status int, message string) {
	reqID := middleware.GetReqID(r.Context())
	respondJSON(w, status, ErrorResponse{
		Error:     message,
		RequestID: reqID,
	})
}
