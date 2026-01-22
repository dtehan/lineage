//go:build gosql

package teradata

import (
	// Import Teradata GoSQL driver for native Teradata connectivity.
	_ "github.com/Teradata/gosql-driver"
)

func init() {
	driverName = "teradata"
}
