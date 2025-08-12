/**
 * 错误处理工具类
 * 提供统一的错误提示和日志记录功能
 * 小白提示：这个文件帮助我们统一处理小程序中的各种错误情况
 */

class ErrorHandler {
  /**
   * 显示错误提示给用户
   * @param {string} message - 错误消息
   * @param {string} title - 提示标题（可选）
   * @param {number} duration - 显示时长，单位毫秒（可选）
   */
  static showError(message, title = '提示', duration = 2000) {
    // 小白提示：wx.showToast 是微信小程序显示消息提示框的API
    wx.showToast({
      title: message,
      icon: 'none', // 不显示图标
      duration: duration
    })
    
    // 同时记录到控制台，方便开发调试
    console.error(`[错误提示] ${title}: ${message}`)
  }
  
  /**
   * 记录错误日志
   * @param {string} context - 错误发生的上下文（如：'保存日记'、'生成图片'等）
   * @param {Error|string} error - 错误对象或错误消息
   * @param {Object} extraData - 额外的调试数据（可选）
   */
  static logError(context, error, extraData = {}) {
    const errorInfo = {
      context: context,
      message: error.message || error,
      stack: error.stack || '无堆栈信息',
      timestamp: new Date().toISOString(),
      extraData: extraData
    }
    
    // 输出到控制台
    console.error(`[${context}] 错误详情:`, errorInfo)
    
    // TODO: 这里可以添加上报到云端的逻辑
    // 比如调用云函数将错误信息保存到数据库
    // 或者使用第三方错误监控服务
  }
  
  /**
   * 处理API调用错误
   * @param {Object} error - 错误对象
   * @param {string} apiName - API名称
   * @param {boolean} showToUser - 是否向用户显示错误（默认true）
   * @returns {Object} 标准化的错误响应
   */
  static handleApiError(error, apiName, showToUser = true) {
    let userMessage = '操作失败，请稍后重试'
    let errorCode = 'UNKNOWN_ERROR'
    
    // 根据不同的错误类型提供更友好的提示
    if (error.errMsg) {
      // 微信小程序API错误
      if (error.errMsg.includes('fail')) {
        if (error.errMsg.includes('network')) {
          userMessage = '网络连接失败，请检查网络后重试'
          errorCode = 'NETWORK_ERROR'
        } else if (error.errMsg.includes('timeout')) {
          userMessage = '请求超时，请稍后重试'
          errorCode = 'TIMEOUT_ERROR'
        } else if (error.errMsg.includes('auth')) {
          userMessage = '登录已过期，请重新登录'
          errorCode = 'AUTH_ERROR'
        }
      }
    } else if (error.message) {
      // 普通JavaScript错误
      if (error.message.includes('网络')) {
        userMessage = '网络连接异常，请检查网络设置'
        errorCode = 'NETWORK_ERROR'
      } else if (error.message.includes('超时')) {
        userMessage = '操作超时，请稍后重试'
        errorCode = 'TIMEOUT_ERROR'
      }
    }
    
    // 记录详细错误信息
    this.logError(apiName, error, { errorCode, userMessage })
    
    // 向用户显示友好的错误提示
    if (showToUser) {
      this.showError(userMessage)
    }
    
    return {
      success: false,
      errorCode: errorCode,
      message: userMessage,
      originalError: error
    }
  }
  
  /**
   * 包装API调用，自动处理错误
   * @param {Function} apiCall - API调用函数
   * @param {string} apiName - API名称
   * @param {Object} options - 选项配置
   * @returns {Promise} API调用结果
   */
  static async wrapApiCall(apiCall, apiName, options = {}) {
    const { showErrorToUser = true, defaultValue = null } = options
    
    try {
      const result = await apiCall()
      return result
    } catch (error) {
      const errorResult = this.handleApiError(error, apiName, showErrorToUser)
      
      // 如果提供了默认值，返回默认值而不是抛出错误
      if (defaultValue !== null) {
        return defaultValue
      }
      
      // 否则抛出标准化的错误
      throw errorResult
    }
  }
}

// 导出错误处理工具类
module.exports = ErrorHandler