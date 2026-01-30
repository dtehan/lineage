package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/lineage-api/internal/adapter/outbound/redis"
	"github.com/lineage-api/internal/adapter/outbound/teradata"
	"github.com/spf13/viper"
)

// ValidationConfig holds validation-specific configuration
type ValidationConfig struct {
	MaxDepthLimit   int // Upper bound for maxDepth parameter (default: 20)
	DefaultMaxDepth int // Default when not specified (default: 5)
	MinMaxDepth     int // Lower bound for maxDepth parameter (default: 1)
}

// Config holds all configuration for the application.
type Config struct {
	Port       string
	Teradata   teradata.Config
	Redis      redis.Config
	Validation ValidationConfig
}

// Load loads configuration from .env file, environment variables, and config files.
// Precedence (highest to lowest): environment variables > .env file > config.yaml > defaults
func Load() (*Config, error) {
	// Try to load .env file from current directory or project root
	loadDotEnv()

	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("/etc/lineage-api/")
	viper.AutomaticEnv()

	// Set defaults
	viper.SetDefault("PORT", "8080")
	viper.SetDefault("TERADATA_PORT", 1025)
	viper.SetDefault("TERADATA_DATABASE", "demo_user")
	viper.SetDefault("REDIS_ADDR", "localhost:6379")
	viper.SetDefault("REDIS_DB", 0)
	viper.SetDefault("VALIDATION_MAX_DEPTH_LIMIT", 20)
	viper.SetDefault("VALIDATION_DEFAULT_MAX_DEPTH", 5)
	viper.SetDefault("VALIDATION_MIN_MAX_DEPTH", 1)

	// Try to read config file (not required)
	_ = viper.ReadInConfig()

	cfg := &Config{
		Port: viper.GetString("PORT"),
		Teradata: teradata.Config{
			Host:     viper.GetString("TERADATA_HOST"),
			Port:     viper.GetInt("TERADATA_PORT"),
			User:     viper.GetString("TERADATA_USER"),
			Password: viper.GetString("TERADATA_PASSWORD"),
			Database: viper.GetString("TERADATA_DATABASE"),
		},
		Redis: redis.Config{
			Addr:     viper.GetString("REDIS_ADDR"),
			Password: viper.GetString("REDIS_PASSWORD"),
			DB:       viper.GetInt("REDIS_DB"),
		},
		Validation: ValidationConfig{
			MaxDepthLimit:   viper.GetInt("VALIDATION_MAX_DEPTH_LIMIT"),
			DefaultMaxDepth: viper.GetInt("VALIDATION_DEFAULT_MAX_DEPTH"),
			MinMaxDepth:     viper.GetInt("VALIDATION_MIN_MAX_DEPTH"),
		},
	}

	// Validate configuration
	if cfg.Validation.MinMaxDepth < 1 {
		return nil, fmt.Errorf("VALIDATION_MIN_MAX_DEPTH must be at least 1, got %d", cfg.Validation.MinMaxDepth)
	}
	if cfg.Validation.MaxDepthLimit < cfg.Validation.MinMaxDepth {
		return nil, fmt.Errorf("VALIDATION_MAX_DEPTH_LIMIT (%d) must be >= VALIDATION_MIN_MAX_DEPTH (%d)",
			cfg.Validation.MaxDepthLimit, cfg.Validation.MinMaxDepth)
	}
	if cfg.Validation.DefaultMaxDepth < cfg.Validation.MinMaxDepth ||
		cfg.Validation.DefaultMaxDepth > cfg.Validation.MaxDepthLimit {
		return nil, fmt.Errorf("VALIDATION_DEFAULT_MAX_DEPTH (%d) must be between %d and %d",
			cfg.Validation.DefaultMaxDepth, cfg.Validation.MinMaxDepth, cfg.Validation.MaxDepthLimit)
	}

	return cfg, nil
}

// loadDotEnv attempts to load a .env file from current directory or parent directory.
func loadDotEnv() {
	// Check current directory first
	if _, err := os.Stat(".env"); err == nil {
		viper.SetConfigFile(".env")
		viper.SetConfigType("dotenv")
		_ = viper.MergeInConfig()
		return
	}

	// Check parent directory (project root when running from lineage-api/)
	parentEnv := filepath.Join("..", ".env")
	if _, err := os.Stat(parentEnv); err == nil {
		viper.SetConfigFile(parentEnv)
		viper.SetConfigType("dotenv")
		_ = viper.MergeInConfig()
	}
}
