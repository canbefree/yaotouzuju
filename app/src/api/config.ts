/** 后端地址配置：H5 同源（线上由 Go 服务托管页面）；小程序需在构建时用 TARO_APP_BACKEND 指定 https 域名。 */

export const IS_H5 = process.env.TARO_ENV === 'h5'
export const PLATFORM = process.env.TARO_ENV as 'h5' | 'weapp' | 'tt' | string

const BACKEND = process.env.TARO_APP_BACKEND || ''

function h5Origin(): string {
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.host}`
  }
  return ''
}

export const HTTP_BASE = BACKEND || (IS_H5 ? h5Origin() : 'http://127.0.0.1:8090')
export const WS_BASE = (BACKEND || (IS_H5 ? h5Origin() : 'http://127.0.0.1:8090')).replace(/^http/, 'ws')
