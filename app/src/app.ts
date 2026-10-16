import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'

import { ensureLogin } from './store/session'
import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    void ensureLogin()
  })

  return children
}

export default App
