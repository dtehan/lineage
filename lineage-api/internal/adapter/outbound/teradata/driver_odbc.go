//go:build teradata

package teradata

import (
	// Import ODBC driver for Teradata connectivity.
	// This requires the ODBC driver and C headers to be installed.
	_ "github.com/alexbrainman/odbc"
)

func init() {
	driverName = "odbc"
}
