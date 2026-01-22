package config

import (
	"github.com/spf13/viper"
	"github.com/your-org/lineage-api/internal/adapter/outbound/redis"
	"github.com/your-org/lineage-api/internal/adapter/outbound/teradata"
)

// Config holds all configuration for the application.
type Config struct {
	Port     string
	Teradata teradata.Config
	Redis    redis.Config
}

// Load loads configuration from environment and config files.
func Load() (*Config, error) {
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
