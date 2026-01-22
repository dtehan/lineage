//go:build !teradata

package teradata

import (
	"database/sql"
	"database/sql/driver"
	"errors"
)

func init() {
	driverName = "stub"
	// Register a stub driver for compilation without ODBC.
	// This allows the code to compile but will fail at runtime if used.
	sql.Register("stub", &stubDriver{})
}

// stubDriver implements a minimal sql driver that fails with a helpful error.
type stubDriver struct{}

func (d *stubDriver) Open(name string) (driver.Conn, error) {
	return nil, errors.New("teradata driver not available: rebuild with -tags teradata and ODBC installed")
}
