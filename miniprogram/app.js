// 导入工具类
const ErrorHandler = require('./utils/errorHandler')
const CacheManager = require('./utils/cacheManager')
const LoadingManager = require('./utils/loadingManager')

// app.js
// 语画日记小程序入口文件
App({
  /**
   * 小程序初始化完成时触发
   * 这里主要进行云开发环境的初始化
   */
  onLaunch() {
    console.log('语画日记小程序启动')
    
    // 初始化云开发环境
    this.initCloud()
    
    // 检查更新
    this.checkForUpdate()
    
    // 获取系统信息
    this.getSystemInfo()
  },

  /**
   * 初始化云开发环境
   * 云开发是微信提供的后端服务，包括数据库、存储、云函数等
   */
  initCloud() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    // 初始化云开发
    try {
      wx.cloud.init({
        // 这里填写你的云开发环境ID
        // 在微信开发者工具中创建云开发环境后会得到这个ID
        env: 'cloud1-7gkqsyzd582553ed', // 云环境ID
        traceUser: false, // 关闭用户访问记录，避免reportRealtimeAction错误
      })
      
      console.log('云开发初始化成功')
      this.globalData.cloudInitialized = true
    } catch (error) {
      console.error('云开发初始化失败:', error)
      // 即使初始化失败，也不阻止小程序运行
      this.globalData.cloudInitialized = false
    }
  },

  /**
   * 检查小程序更新
   * 当有新版本时提示用户更新
   */
  checkForUpdate() {
    const updateManager = wx.getUpdateManager()

    updateManager.onCheckForUpdate((res) => {
      console.log('检查更新结果:', res.hasUpdate)
    })

    updateManager.onUpdateReady(() => {
      // TODO: 建议为以下API调用添加success和fail回调
      wx.showModal({
      // 示例错误处理:
      // success: (res) => { console.log('成功:', res) },
      // fail: (err) => { console.error('失败:', err) }
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate()
          }
        }
      })
    })

    updateManager.onUpdateFailed(() => {
      console.error('新版本下载失败')
    })
  },

  /**
   * 获取系统信息
   * 用于适配不同设备和主题
   * 使用新的API替代过时的wx.getSystemInfo
   */
  getSystemInfo() {
    // 获取设备信息
    const deviceInfo = wx.getDeviceInfo()
    // 获取窗口信息
    const windowInfo = wx.getWindowInfo()
    // 获取应用基础信息
    const appBaseInfo = wx.getAppBaseInfo()
    // 获取系统设置
    const systemSetting = wx.getSystemSetting()
    
    // 合并所有信息
    const systemInfo = {
      ...deviceInfo,
      ...windowInfo,
      ...appBaseInfo,
      ...systemSetting
    }
    
    this.globalData.systemInfo = systemInfo
    
    // 检测是否为深色模式
    this.globalData.isDarkMode = systemSetting.theme === 'dark'
    
    console.log('系统信息:', systemInfo)
  },

  /**
   * 小程序显示时触发
   */
  onShow() {
    console.log('小程序显示')
  },

  /**
   * 小程序隐藏时触发
   */
  onHide() {
    console.log('小程序隐藏')
  },

  /**
   * 小程序发生脚本错误或 API 调用报错时触发
   */
  onError(msg) {
    console.error('小程序错误:', msg)
  },

  /**
   * 全局数据
   * 存储一些需要在多个页面间共享的数据
   */
  globalData: {
    cloudInitialized: false, // 云开发是否已初始化
    userInfo: null,          // 用户信息
    systemInfo: null,        // 系统信息
    isDarkMode: false,       // 是否为深色模式
    currentDiary: null,      // 当前编辑的日记
    // 工具类引用
    ErrorHandler,
    CacheManager,
    LoadingManager
  }
})