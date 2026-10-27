// Package store 用 SQLite 持久化用户、积分、对局归档与房间快照。
// 纯 Go 驱动（modernc.org/sqlite），无需 cgo，便于交叉编译。
package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"yaotou/internal/game"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
  openid     TEXT PRIMARY KEY,
  nickname   TEXT NOT NULL DEFAULT '',
  avatar     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  openid     TEXT NOT NULL,
  mode       TEXT NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  rounds     INTEGER NOT NULL DEFAULT 0,
  matches    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (openid, mode)
);
CREATE INDEX IF NOT EXISTS idx_scores_mode_points ON scores(mode, points DESC);
CREATE TABLE IF NOT EXISTS matches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id       TEXT NOT NULL,
  mode          TEXT NOT NULL,
  target_score  INTEGER NOT NULL,
  winner_openid TEXT NOT NULL,
  rounds        INTEGER NOT NULL,
  player_count  INTEGER NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_mode ON matches(mode, ended_at DESC);
CREATE TABLE IF NOT EXISTS match_players (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  openid   TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score    INTEGER NOT NULL,
  rank     INTEGER NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_match_players_openid ON match_players(openid);
CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  mode       TEXT NOT NULL,
  status     TEXT NOT NULL,
  host       TEXT NOT NULL,
  state      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`

// ScoreRow 排行榜一行。
type ScoreRow struct {
	OpenID   string
	Nickname string
	Avatar   string
	Points   int
	Wins     int
	Rounds   int
	Matches  int
}

// Store 持久化层。
type Store struct {
	db     *sql.DB
	engine *game.Engine
	jobs   chan func()
	wg     sync.WaitGroup
	once   sync.Once
}

// resolvePath 把 file: 形式的 DSN 解析成绝对路径 DSN（目录自动创建）。
func resolvePath(dsn string) (string, error) {
	p := strings.TrimPrefix(dsn, "file:")
	if !filepath.IsAbs(p) {
		abs, err := filepath.Abs(p)
		if err != nil {
			return "", err
		}
		p = abs
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return "", err
	}
	return "file:" + p + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)", nil
}

// Open 打开数据库并建表。
func Open(dsn string, engine *game.Engine) (*Store, error) {
	realDSN, err := resolvePath(dsn)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", realDSN)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite 单写者，串行最稳
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, err
	}
	s := &Store{db: db, engine: engine, jobs: make(chan func(), 1024)}
	s.wg.Add(1)
	go s.worker()
	return s, nil
}

func (s *Store) worker() {
	defer s.wg.Done()
	for job := range s.jobs {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[store] 写库 job panic: %v", r)
				}
			}()
			job()
		}()
	}
}

func (s *Store) enqueue(job func()) {
	defer func() { _ = recover() }()
	select {
	case s.jobs <- job:
	default:
		log.Println("[store] 写队列已满，丢弃一次持久化")
	}
}

// Close 停止 worker 并关闭数据库。
func (s *Store) Close() {
	s.once.Do(func() {
		close(s.jobs)
		s.wg.Wait()
		_ = s.db.Close()
	})
}

// OnChange 引擎变更回调：捕获快照并异步落库。
func (s *Store) OnChange(roomID string, ev game.Event) {
	snap, ok := s.engine.Snapshot(roomID)
	if !ok {
		s.enqueue(func() { _ = s.deleteRoom(roomID) })
		return
	}
	s.enqueue(func() { s.saveRoom(snap) })
	switch ev.Type {
	case game.EvRoundEnd:
		if rr := snap.RoundResult; rr != nil {
			s.enqueue(func() { s.recordRound(snap, rr) })
		}
	case game.EvMatchEnd:
		if mr := snap.MatchResult; mr != nil {
			s.enqueue(func() { s.recordMatch(snap, mr) })
		}
	}
}

func (s *Store) saveRoom(room *game.Room) {
	data, err := json.Marshal(room)
	if err != nil {
		return
	}
	_, err = s.db.Exec(
		`INSERT INTO rooms (id, mode, status, host, state, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET mode=excluded.mode, status=excluded.status, host=excluded.host, state=excluded.state, updated_at=excluded.updated_at`,
		room.RoomID, string(room.Mode), string(room.Status), room.HostOpenID, string(data), room.CreatedAt, room.UpdatedAt,
	)
	if err != nil {
		log.Printf("[store] 保存房间 %s 失败: %v", room.RoomID, err)
	}
}

func (s *Store) deleteRoom(roomID string) error {
	_, err := s.db.Exec(`DELETE FROM rooms WHERE id = ?`, roomID)
	return err
}

// DeleteRoom 供接口层主动删除。
func (s *Store) DeleteRoom(roomID string) { s.enqueue(func() { _ = s.deleteRoom(roomID) }) }

func (s *Store) upsertUserTx(openid, nickname, avatar string) {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(
		`INSERT INTO users (openid, nickname, avatar, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(openid) DO UPDATE SET
		   nickname = CASE WHEN excluded.nickname != '' THEN excluded.nickname ELSE users.nickname END,
		   avatar   = CASE WHEN excluded.avatar   != '' THEN excluded.avatar   ELSE users.avatar   END,
		   updated_at = excluded.updated_at`,
		openid, nickname, avatar, now, now,
	)
	if err != nil {
		log.Printf("[store] upsertUser %s 失败: %v", openid, err)
	}
}

// UpsertUser 写入/更新用户资料。
func (s *Store) UpsertUser(openid, nickname, avatar string) { s.upsertUserTx(openid, nickname, avatar) }

// GetUser 读取用户资料。
func (s *Store) GetUser(openid string) (nickname, avatar string, ok bool) {
	row := s.db.QueryRow(`SELECT nickname, avatar FROM users WHERE openid = ?`, openid)
	if err := row.Scan(&nickname, &avatar); err != nil {
		return "", "", false
	}
	return nickname, avatar, true
}

// recordRound 记一轮战绩：points 存「受罚次数」，wins 存「没受罚」次数。
func (s *Store) recordRound(room *game.Room, rr *game.RoundResult) {
	for _, rv := range rr.Reveal {
		var p *game.Player
		for _, q := range room.Players {
			if q.Seat == rv.Seat {
				p = q
				break
			}
		}
		if p == nil || p.Left {
			continue
		}
		s.upsertUserTx(p.OpenID, p.Nickname, p.Avatar)
		penalty, wins := 0, 0
		if rv.Seat == rr.LoserSeat {
			penalty = 1
		} else {
			wins = 1
		}
		_, err := s.db.Exec(
			`INSERT INTO scores (openid, mode, points, wins, rounds, matches, updated_at)
			 VALUES (?, ?, ?, ?, 1, 0, ?)
			 ON CONFLICT(openid, mode) DO UPDATE SET
			   points = scores.points + excluded.points,
			   wins   = scores.wins + excluded.wins,
			   rounds = scores.rounds + 1,
			   updated_at = excluded.updated_at`,
			p.OpenID, string(room.Mode), penalty, wins, time.Now().UnixMilli(),
		)
		if err != nil {
			log.Printf("[store] recordRound %s 失败: %v", p.OpenID, err)
		}
	}
}

func (s *Store) recordMatch(room *game.Room, mr *game.MatchResult) {
	now := time.Now().UnixMilli()
	res, err := s.db.Exec(
		`INSERT INTO matches (room_id, mode, target_score, winner_openid, rounds, player_count, started_at, ended_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		room.RoomID, string(room.Mode), room.TargetScore, mr.Ranking[0].OpenID, mr.Rounds, len(mr.Ranking), room.CreatedAt, now,
	)
	if err != nil {
		log.Printf("[store] recordMatch 失败: %v", err)
		return
	}
	matchID, _ := res.LastInsertId()
	for i, p := range mr.Ranking {
		s.upsertUserTx(p.OpenID, p.Nickname, p.Avatar)
		if _, err := s.db.Exec(
			`INSERT INTO match_players (match_id, openid, nickname, score, rank) VALUES (?, ?, ?, ?, ?)`,
			matchID, p.OpenID, p.Nickname, p.Penalties, i+1,
		); err != nil {
			log.Printf("[store] recordMatch player 失败: %v", err)
		}
		if _, err := s.db.Exec(
			`INSERT INTO scores (openid, mode, points, wins, rounds, matches, updated_at)
			 VALUES (?, ?, 0, 0, 0, 1, ?)
			 ON CONFLICT(openid, mode) DO UPDATE SET matches = scores.matches + 1, updated_at = excluded.updated_at`,
			p.OpenID, string(room.Mode), now,
		); err != nil {
			log.Printf("[store] recordMatch score 失败: %v", err)
		}
	}
	log.Printf("[store] 归档对局 #%d 冠军=%s 轮数=%d", matchID, mr.Ranking[0].Nickname, mr.Rounds)
}

// LoadRooms 载入未结束的房间。
func (s *Store) LoadRooms() ([]*game.Room, error) {
	rows, err := s.db.Query(`SELECT state FROM rooms WHERE status != 'finished'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*game.Room
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			continue
		}
		var room game.Room
		if err := json.Unmarshal([]byte(raw), &room); err != nil {
			continue
		}
		out = append(out, &room)
	}
	return out, rows.Err()
}

// TopScores 排行榜。
func (s *Store) TopScores(mode string, limit int) []ScoreRow {
	rows, err := s.db.Query(
		`SELECT s.openid, COALESCE(u.nickname,'玩家'), COALESCE(u.avatar,''), s.points, s.wins, s.rounds, s.matches
		 FROM scores s LEFT JOIN users u ON u.openid = s.openid
		 WHERE s.mode = ?
		 ORDER BY s.points DESC, s.wins DESC
		 LIMIT ?`, mode, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []ScoreRow{}
	for rows.Next() {
		var r ScoreRow
		if err := rows.Scan(&r.OpenID, &r.Nickname, &r.Avatar, &r.Points, &r.Wins, &r.Rounds, &r.Matches); err != nil {
			continue
		}
		out = append(out, r)
	}
	return out
}

// RankOf 返回某用户在某玩法的战绩与名次。
func (s *Store) RankOf(mode, openid string) (*ScoreRow, int, bool) {
	var r ScoreRow
	err := s.db.QueryRow(
		`SELECT s.openid, COALESCE(u.nickname,'玩家'), COALESCE(u.avatar,''), s.points, s.wins, s.rounds, s.matches
		 FROM scores s LEFT JOIN users u ON u.openid = s.openid
		 WHERE s.mode = ? AND s.openid = ?`, mode, openid,
	).Scan(&r.OpenID, &r.Nickname, &r.Avatar, &r.Points, &r.Wins, &r.Rounds, &r.Matches)
	if err != nil {
		return nil, 0, false
	}
	var better int
	_ = s.db.QueryRow(
		`SELECT COUNT(*) FROM scores WHERE mode = ? AND (points > ? OR (points = ? AND wins > ?))`,
		mode, r.Points, r.Points, r.Wins,
	).Scan(&better)
	return &r, better + 1, true
}

// MatchCount 已归档对局数（健康检查用）。
func (s *Store) MatchCount() int {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM matches`).Scan(&n); err != nil {
		return 0
	}
	return n
}

// DSN 返回用于日志的数据库路径。
func DSN(dsn string) string {
	return fmt.Sprintf("%s", strings.TrimPrefix(dsn, "file:"))
}
