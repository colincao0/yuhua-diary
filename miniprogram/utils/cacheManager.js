/**
 * 缓存管理工具类
 * 提供带过期时间的本地存储管理功能
 * 小白提示：这个文件帮助我们管理小程序的本地缓存，避免数据过期和存储空间不足的问题
 */
class CacheManager {
  /**
   * 设置缓存数据
   * @param {string} key - 缓存键名
   * @param {any} data - 要缓存的数据
   * @param {number} expireTime - 过期时间(毫秒)，默认24小时
   * 小白提示：就像给数据贴个标签，记录什么时候会过期
   */
  static setCache(key, data, expireTime = 24 * 60 * 60 * 1000) {
    const cacheData = {
      data,
      timestamp: Date.now(), // 记录当前时间戳
      expireTime
    }
    
    try {
      wx.setStorageSync(key, cacheData)
      console.log(`缓存设置成功: ${key}`)
    } catch (error) {
      console.error('设置缓存失败:', error)
      // 如果存储空间不足，清理过期缓存后重试
      this.clearExpiredCache()
      try {
        wx.setStorageSync(key, cacheData)
      } catch (retryError) {
        console.error('重试设置缓存仍然失败:', retryError)
      }
    }
  }

  /**
   * 获取缓存数据
   * @param {string} key - 缓存键名
   * @returns {any|null} 缓存的数据，如果不存在或已过期则返回null
   * 小白提示：获取数据时会自动检查是否过期，过期的数据会被自动删除
   */
  static getCache(key) {
    try {
      const cacheData = wx.getStorageSync(key)
      
      if (!cacheData) {
        return null
      }

      // 检查是否过期
      if (Date.now() - cacheData.timestamp > cacheData.expireTime) {
        wx.removeStorageSync(key)
        console.log(`缓存已过期并清理: ${key}`)
        return null
      }

      return cacheData.data
    } catch (error) {
      console.error('获取缓存失败:', error)
      return null
    }
  }

  /**
   * 删除指定缓存
   * @param {string} key - 缓存键名
   * 小白提示：手动删除不需要的缓存数据
   */
  static removeCache(key) {
    try {
      wx.removeStorageSync(key)
      console.log(`缓存删除成功: ${key}`)
    } catch (error) {
      console.error('删除缓存失败:', error)
    }
  }

  /**
   * 清理所有过期缓存
   * 小白提示：定期清理过期数据，释放存储空间
   */
  static clearExpiredCache() {
    try {
      const info = wx.getStorageInfoSync()
      const keys = info.keys
      
      keys.forEach(key => {
        try {
          const cacheData = wx.getStorageSync(key)
          if (cacheData && cacheData.timestamp && cacheData.expireTime) {
            if (Date.now() - cacheData.timestamp > cacheData.expireTime) {
              wx.removeStorageSync(key)
              console.log(`清理过期缓存: ${key}`)
            }
          }
        } catch (error) {
          // 忽略单个缓存项的错误
        }
      })
    } catch (error) {
      console.error('清理过期缓存失败:', error)
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计信息
   * 小白提示：查看当前缓存使用情况，帮助了解存储空间占用
   */
  static getCacheStats() {
    try {
      const info = wx.getStorageInfoSync()
      return {
        keys: info.keys.length, // 缓存项数量
        currentSize: info.currentSize, // 当前使用大小(KB)
        limitSize: info.limitSize, // 最大限制大小(KB)
        usage: ((info.currentSize / info.limitSize) * 100).toFixed(2) + '%' // 使用率
      }
    } catch (error) {
      console.error('获取缓存统计失败:', error)
      return null
    }
  }
}

// 导出缓存管理工具类
module.exports = CacheManager