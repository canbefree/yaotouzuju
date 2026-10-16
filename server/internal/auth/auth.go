// Package auth 负责登录态签名与各平台 code2session。
package auth

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"yaotou/internal/config"
)

// Session 登录后得到的用户标识与会话信息。
type Session struct {
	OpenID   string
	Nickname string
	Avatar   string
}

type tokenPayload struct {
	OpenID string `json:"openid"`
	Exp    int64  `json:"exp"`
}

type signer struct {
	secret []byte
	ttl    time.Duration
}

var s *signer

// Init 初始化签名器。
func Init(cfg *config.Config) {
	s = &signer{secret: []byte(cfg.TokenSecret), ttl: cfg.TokenTTL}
}

func (sg *signer) mac(body string) string {
	h := hmac.New(sha256.New, sg.secret)
	h.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

// Issue 签发 token。
func Issue(openid string) string {
	body, _ := json.Marshal(tokenPayload{OpenID: openid, Exp: time.Now().Add(s.ttl).UnixMilli()})
	b := base64.RawURLEncoding.EncodeToString(body)
	return b + "." + s.mac(b)
}

// Verify 校验 token，返回 openid。
func Verify(token string) (string, bool) {
	if token == "" {
		return "", false
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return "", false
	}
	if !hmac.Equal([]byte(s.mac(parts[0])), []byte(parts[1])) {
		return "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", false
	}
	var p tokenPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return "", false
	}
	if p.OpenID == "" || p.Exp < time.Now().UnixMilli() {
		return "", false
	}
	return p.OpenID, true
}

// Bearer 从 Authorization 头解析并校验。
func Bearer(header string) (string, bool) {
	header = strings.TrimSpace(header)
	if len(header) < 7 || !strings.EqualFold(header[:7], "Bearer ") {
		return "", false
	}
	return Verify(strings.TrimSpace(header[7:]))
}

// Login 按平台登录：dev / wechat / douyin。
func Login(cfg *config.Config, platform, code, nickname, avatar string) (Session, error) {
	switch platform {
	case "dev":
		if !cfg.AllowDevLogin {
			return Session{}, errors.New("开发登录已关闭")
		}
		name := strings.TrimPrefix(code, "dev:")
		name = strings.TrimSpace(name)
		if name == "" {
			name = "游客"
		}
		return Session{OpenID: "dev:" + name, Nickname: nickname, Avatar: avatar}, nil
	case "wechat":
		return wechatLogin(cfg, code, nickname, avatar)
	case "douyin":
		return douyinLogin(cfg, code, nickname, avatar)
	default:
		return Session{}, errors.New("platform 必须是 wechat/douyin/dev")
	}
}

var httpClient = &http.Client{Timeout: 8 * time.Second}

func wechatLogin(cfg *config.Config, code, nickname, avatar string) (Session, error) {
	if cfg.WxAppID == "" || cfg.WxAppSecret == "" {
		return Session{}, errors.New("微信登录未配置（WX_APPID/WX_APPSECRET）")
	}
	q := url.Values{}
	q.Set("appid", cfg.WxAppID)
	q.Set("secret", cfg.WxAppSecret)
	q.Set("js_code", code)
	q.Set("grant_type", "authorization_code")
	resp, err := httpClient.Get("https://api.weixin.qq.com/sns/jscode2session?" + q.Encode())
	if err != nil {
		return Session{}, fmt.Errorf("微信登录请求失败：%w", err)
	}
	defer resp.Body.Close()
	var data struct {
		OpenID  string `json:"openid"`
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return Session{}, errors.New("微信登录响应解析失败")
	}
	if data.OpenID == "" {
		return Session{}, fmt.Errorf("微信登录失败：%d %s", data.ErrCode, data.ErrMsg)
	}
	return Session{OpenID: "wx_" + data.OpenID, Nickname: nickname, Avatar: avatar}, nil
}

func douyinLogin(cfg *config.Config, code, nickname, avatar string) (Session, error) {
	if cfg.TtAppID == "" || cfg.TtAppSecret == "" {
		return Session{}, errors.New("抖音登录未配置（TT_APPID/TT_APPSECRET）")
	}
	body, _ := json.Marshal(map[string]string{"appid": cfg.TtAppID, "secret": cfg.TtAppSecret, "code": code})
	resp, err := httpClient.Post("https://developer.toutiao.com/api/apps/v2/jscode2session", "application/json", bytes.NewReader(body))
	if err != nil {
		return Session{}, fmt.Errorf("抖音登录请求失败：%w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var data struct {
		Data struct {
			OpenID string `json:"openid"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return Session{}, errors.New("抖音登录响应解析失败")
	}
	if data.Data.OpenID == "" {
		return Session{}, fmt.Errorf("抖音登录失败：%s", data.Message)
	}
	return Session{OpenID: "tt_" + data.Data.OpenID, Nickname: nickname, Avatar: avatar}, nil
}
