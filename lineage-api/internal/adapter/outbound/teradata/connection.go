package teradata

import (
	"database/sql"
	"fmt"
)

// driverName is set by build tags (driver_odbc.go or driver_stub.go).
var driverName string

// Config holds Teradata connection configuration.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

// NewConnection creates a new connection to Teradata.
func NewConnection(cfg Config) (*sql.DB, error) {
	var connStr string
	if driverName == "teradata" {
		// Teradata GoSQL driver uses JSON connection string
		connStr = fmt.Sprintf(
			`{"host":"%s","user":"%s","password":"%s","database":"%s"}`,
			cfg.Host,
			cfg.User,
			cfg.Password,
			cfg.Database,
		)
	} else {
		// ODBC driver uses traditional connection string
		connStr = fmt.Sprintf(
			"DRIVER={Teradata};DBCNAME=%s;UID=%s;PWD=%s;DATABASE=%s",
			cfg.Host,
			cfg.User,
			cfg.Password,
			cfg.Database,
		)
	}

	db, err := sql.Open(driverName, connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open connection: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}
