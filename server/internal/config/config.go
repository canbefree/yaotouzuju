// Package config 读取环境变量（支持 .env 文件，见 .env.example）。
package config

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port          int
	Host          string
	WSPath        string
	DatabaseURL   string
	PublicDir     string
	WxAppID       string
	WxAppSecret   string
	TtAppID       string
	TtAppSecret   string
	AllowDevLogin bool
	TokenTTL      time.Duration
	TokenSecret   string
}

func getStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}

func getBool(key string, def bool) bool {
	v := strings.ToLower(os.Getenv(key))
	if v == "" {
		return def
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

// LoadDotEnv 极简 .env 解析器（KEY=VALUE，# 开头为注释）。不覆盖已存在的环境变量。
func LoadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		val := strings.TrimSpace(line[eq+1:])
		val = strings.Trim(val, `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, val)
		}
	}
}

func Load() *Config {
	cfg := &Config{
		Port:          getInt("PORT", 8090),
		Host:          getStr("HOST", "0.0.0.0"),
		WSPath:        "/ws",
		DatabaseURL:   getStr("DATABASE_URL", "file:./data/yaotou.db"),
		PublicDir:     getStr("PUBLIC_DIR", "./public"),
		WxAppID:       getStr("WX_APPID", ""),
		WxAppSecret:   getStr("WX_APPSECRET", ""),
		TtAppID:       getStr("TT_APPID", ""),
		TtAppSecret:   getStr("TT_APPSECRET", ""),
		AllowDevLogin: getBool("ALLOW_DEV_LOGIN", true),
		TokenTTL:      time.Duration(getInt("TOKEN_TTL_HOURS", 72)) * time.Hour,
		TokenSecret:   getStr("TOKEN_SECRET", ""),
	}
	if cfg.TokenSecret == "" {
		buf := make([]byte, 32)
		_, _ = rand.Read(buf)
		cfg.TokenSecret = base64.RawURLEncoding.EncodeToString(buf)
		log.Println("[config] 未设置 TOKEN_SECRET，已生成临时密钥：重启后登录态失效，生产必须固定")
	}
	return cfg
}

// Warnings 返回启动自检提醒。
func (c *Config) Warnings() []string {
	var w []string
	if c.AllowDevLogin {
		w = append(w, "ALLOW_DEV_LOGIN=on：任何人可用 dev:<名字> 登录，仅限联调")
	}
	if c.WxAppID == "" || c.WxAppSecret == "" {
		w = append(w, "微信 AppID/Secret 未配置：微信 code2session 不可用")
	}
	if c.TtAppID == "" || c.TtAppSecret == "" {
		w = append(w, "抖音 AppID/Secret 未配置：抖音 code2session 不可用")
	}
	return w
}
