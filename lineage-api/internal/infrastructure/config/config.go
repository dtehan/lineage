package config

import (
	"os"
	"path/filepath"

	"github.com/spf13/viper"
	"github.com/lineage-api/internal/adapter/outbound/redis"
	"github.com/lineage-api/internal/adapter/outbound/teradata"
)

// Config holds all configuration for the application.
type Config struct {
	Port     string
	Teradata teradata.Config
	Redis    redis.Config
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

	// Try to read config file (not required)
	_ = viper.ReadInConfig()

	return &Config{
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
	}, nil
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
