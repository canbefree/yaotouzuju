import type { UserConfigExport } from "@tarojs/cli"

const API_TARGET = process.env.TARO_DEV_API || 'http://127.0.0.1:8090'
const WS_TARGET = API_TARGET.replace(/^http/, 'ws')

export default {
  logger: {
    quiet: false,
    stats: true
  },
  mini: {},
  h5: {
    devServer: {
      host: '0.0.0.0',
      port: 10086,
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: true },
        '/ws': { target: WS_TARGET, changeOrigin: true, ws: true }
      }
    }
  }
} satisfies UserConfigExport<'webpack5'>
