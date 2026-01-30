// Package logging provides structured logging configuration using Go's slog package.
// It includes request-scoped logging with request ID correlation and stack trace capture
// for error debugging.
package logging

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"strings"

	"github.com/go-chi/chi/v5/middleware"
)

// NewLogger creates a new JSON logger with the specified log level.
// The logger includes source file information (file:line) in each log entry.
func NewLogger(level slog.Level) *slog.Logger {
	opts := &slog.HandlerOptions{
		Level:     level,
		AddSource: true,
	}
	handler := slog.NewJSONHandler(os.Stdout, opts)
	return slog.New(handler)
}

// SetDefault sets the provided logger as the default logger for the slog package.
func SetDefault(logger *slog.Logger) {
	slog.SetDefault(logger)
}

// GetRequestLogger returns a logger with the request ID pre-attached as an attribute.
// This allows all log entries within a request to be correlated by their request_id.
// If no request ID is found in the context, an empty request_id is used.
func GetRequestLogger(ctx context.Context) *slog.Logger {
	reqID := middleware.GetReqID(ctx)
	return slog.Default().With("request_id", reqID)
}

// CaptureStack captures the current call stack and returns it as a formatted string.
// Each frame is formatted as "function @ file:line".
// The first 3 frames are skipped (runtime.Callers, CaptureStack, and the caller).
// A maximum of 10 frames are captured to avoid excessive output.
func CaptureStack() string {
	const (
		skipFrames = 3  // Skip runtime.Callers, CaptureStack, and caller
		maxFrames  = 10 // Maximum frames to capture
	)

	// Allocate space for program counters
	pcs := make([]uintptr, maxFrames+skipFrames)
	n := runtime.Callers(skipFrames, pcs)
	if n == 0 {
		return ""
	}

	// Limit to actual captured frames
	pcs = pcs[:n]

	// Convert program counters to frames
	frames := runtime.CallersFrames(pcs)

	var builder strings.Builder
	frameCount := 0

	for {
		frame, more := frames.Next()
		if frameCount >= maxFrames {
			break
		}

		if frameCount > 0 {
			builder.WriteString("\n")
		}

		// Format: function @ file:line
		builder.WriteString(fmt.Sprintf("%s @ %s:%d", frame.Function, frame.File, frame.Line))
		frameCount++

		if !more {
			break
		}
	}

	return builder.String()
}
