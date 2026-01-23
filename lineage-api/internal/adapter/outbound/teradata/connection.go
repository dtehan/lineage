package teradata

import (
	"database/sql"
	"fmt"
)

// driverName is set by build-tagged init() in driver_*.go files
var driverName string

type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

func NewConnection(cfg Config) (*sql.DB, error) {
	var connStr string

	switch driverName {
	case "teradata":
		// Teradata GoSQL driver connection string
		connStr = fmt.Sprintf("%s/%s,%s", cfg.Host, cfg.User, cfg.Password)
	case "odbc":
		// ODBC connection string
		connStr = fmt.Sprintf("Driver={Teradata};DBCName=%s;UID=%s;PWD=%s;Database=%s",
			cfg.Host, cfg.User, cfg.Password, cfg.Database)
	default:
		// Stub driver for development without database
		connStr = "stub"
	}

	db, err := sql.Open(driverName, connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}
