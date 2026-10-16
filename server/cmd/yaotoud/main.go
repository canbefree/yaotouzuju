// 摇骰组局 · 服务端入口。
//
//	Go + net/http：REST 动作接口 + WebSocket 房间推送 + 静态 H5 托管
//	SQLite（modernc.org/sqlite，纯 Go）：用户 / 积分 / 对局归档 / 房间快照
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"yaotou/internal/api"
	"yaotou/internal/auth"
	"yaotou/internal/config"
	"yaotou/internal/game"
	"yaotou/internal/store"
)

func main() {
	config.LoadDotEnv(".env")
	cfg := config.Load()
	auth.Init(cfg)

	engine := game.NewEngine()
	hub := game.NewHub(engine)

	st, err := store.Open(cfg.DatabaseURL, engine)
	if err != nil {
		log.Fatalf("[yaotou] 打开数据库失败: %v", err)
	}
	defer st.Close()

	// 崩溃恢复
	if rooms, err := st.LoadRooms(); err == nil && len(rooms) > 0 {
		for _, r := range rooms {
			engine.Restore(r)
		}
		log.Printf("[yaotou] 恢复 %d 个未结束房间", len(rooms))
	}

	engine.OnChange(st.OnChange)

	apiSrv := api.New(engine, hub, st, cfg)

	mux := http.NewServeMux()
	apiSrv.Register(mux)
	mux.HandleFunc("/api/", jsonNotFound)
	mux.HandleFunc(cfg.WSPath, apiSrv.WSHandler())

	publicDir, _ := filepath.Abs(cfg.PublicDir)
	if info, err := os.Stat(filepath.Join(publicDir, "index.html")); err == nil && !info.IsDir() {
		mux.Handle("/", spaHandler(publicDir))
		log.Printf("[web] 静态站点：%s", publicDir)
	} else {
		mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { jsonNotFound(w, nil) })
		log.Printf("[web] 未找到前端构建（%s），仅提供 API", publicDir)
	}

	server := &http.Server{
		Addr:              cfg.Host + ":" + itoa(cfg.Port),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[yaotou] HTTP  http://%s:%d", cfg.Host, cfg.Port)
		log.Printf("[yaotou] WS    ws://%s:%d%s", cfg.Host, cfg.Port, cfg.WSPath)
		log.Printf("[yaotou] DB    %s", store.DSN(cfg.DatabaseURL))
		log.Printf("[yaotou] devLogin=%v", cfg.AllowDevLogin)
		for _, w := range cfg.Warnings() {
			log.Printf("[yaotou] WARN %s", w)
		}
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[yaotou] 监听失败: %v", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
	log.Println("[yaotou] 收到退出信号，正在关闭…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
	st.Close()
	log.Println("[yaotou] 已退出")
}

func spaHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := filepath.Clean(r.URL.Path)
		full := filepath.Join(dir, clean)
		if !strings.HasPrefix(full, dir) {
			http.NotFound(w, r)
			return
		}
		if info, err := os.Stat(full); err == nil && !info.IsDir() {
			if strings.HasSuffix(clean, ".html") {
				w.Header().Set("Cache-Control", "no-cache")
			} else if strings.Contains(clean, "/js/") || strings.Contains(clean, "/css/") || strings.Contains(clean, "/static/") {
				// 文件名带内容哈希，可长期缓存
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			fs.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}

func jsonNotFound(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(`{"ok":false,"code":"NOT_FOUND","msg":"未知接口"}`))
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
