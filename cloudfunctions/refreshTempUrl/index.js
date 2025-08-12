// 刷新临时链接云函数
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 刷新临时链接云函数
 * 用于重新获取云存储文件的临时访问链接
 * @param {Object} event - 云函数参数
 * @param {string} event.cloudPath - 云存储文件路径
 * @param {Object} context - 云函数上下文
 * @returns {Object} 返回新的临时访问链接
 */
exports.main = async (event, context) => {
  try {
    const { cloudPath } = event
    
    // 参数验证
    if (!cloudPath) {
      return {
        success: false,
        error: '云存储路径不能为空'
      }
    }
    
    console.log('开始刷新临时链接:', cloudPath)
    
    // 构建完整的fileID
    const fileID = `cloud://default-env.6465-default-env-1330048749/${cloudPath}`
    
    console.log('构建的fileID:', fileID)
    
    // 获取新的临时访问链接
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [fileID]
    })
    
    if (!tempUrlResult.fileList || tempUrlResult.fileList.length === 0) {
      throw new Error('获取临时访问链接失败')
    }
    
    const fileInfo = tempUrlResult.fileList[0]
    
    // 检查是否获取成功
    if (fileInfo.status !== 0) {
      throw new Error(`获取临时链接失败: ${fileInfo.errmsg || '未知错误'}`)
    }
    
    const tempUrl = fileInfo.tempFileURL
    console.log('获取临时链接成功:', tempUrl)
    
    return {
      success: true,
      tempFileURL: tempUrl,
      cloudPath: cloudPath,
      fileID: fileID
    }
    
  } catch (error) {
    console.error('刷新临时链接失败 - 详细错误信息:', {
      message: error.message,
      stack: error.stack,
      cloudPath: event.cloudPath
    })
    
    // 返回详细的错误信息
    let errorMessage = '刷新临时链接失败'
    
    if (error.message.includes('不存在')) {
      errorMessage = '文件不存在或已被删除'
    } else if (error.message.includes('权限')) {
      errorMessage = '没有访问权限'
    } else if (error.message.includes('超时')) {
      errorMessage = '请求超时，请稍后重试'
    }
    
    return {
      success: false,
      error: errorMessage,
      debug: {
        originalError: error.message,
        cloudPath: event.cloudPath,
        timestamp: new Date().toISOString()
      }
    }
  }
}