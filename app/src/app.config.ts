export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/lobby/index',
    'pages/room/index',
    'pages/local/index',
    'pages/rules/index',
    'pages/settings/index'
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#8a5a34',
    navigationBarTitleText: '摇骰组局',
    navigationBarTextStyle: 'white',
    navigationStyle: 'custom'
  }
})
