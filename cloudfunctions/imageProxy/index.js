// 图片代理云函数 - 解决外部图片访问限制问题
const cloud = require('wx-server-sdk')
const axios = require('axios')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 图片代理函数 - 下载外部图片并上传到云存储
 * @param {Object} event - 云函数参数
 * @param {string} event.imageUrl - 外部图片URL
 * @param {string} event.fileName - 文件名（可选）
 * @param {Object} context - 云函数上下文
 * @returns {Object} 返回云存储中的图片URL
 */
exports.main = async (event, context) => {
  try {
    const { imageUrl, fileName } = event
    
    // 参数验证
    if (!imageUrl) {
      return {
        success: false,
        error: '图片URL不能为空'
      }
    }
    
    console.log('开始代理图片:', imageUrl)
    
    // 获取用户openid用于文件路径
    const { OPENID } = cloud.getWXContext()
    
    // 临时注释：允许未登录状态下测试图片保存功能
    // if (!OPENID) {
    //   console.error('获取用户OPENID失败')
    //   return {
    //     success: false,
    //     error: '用户身份验证失败，无法保存图片'
    //   }
    // }
    
    console.log('用户OPENID:', OPENID || '未登录用户')
    
    // 下载外部图片
    console.log('正在下载外部图片...')
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (!response.data) {
      throw new Error('下载图片失败：响应数据为空')
    }
    
    console.log('图片下载成功，大小:', response.data.byteLength, 'bytes')
    
    // 生成文件名
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const defaultFileName = `character_image_${timestamp}_${randomStr}.jpg`
    const finalFileName = fileName || defaultFileName
    
    // 构建云存储路径（临时修改：支持未登录用户）
    const userPath = OPENID || 'guest_user'
    const cloudPath = `character-images/${userPath}/${finalFileName}`
    
    console.log('正在上传到云存储:', cloudPath)
    
    // 上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: Buffer.from(response.data)
    })
    
    if (!uploadResult.fileID) {
      throw new Error('上传到云存储失败')
    }
    
    console.log('上传成功，fileID:', uploadResult.fileID)
    
    // 获取临时访问链接
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })
    
    if (!tempUrlResult.fileList || tempUrlResult.fileList.length === 0) {
      throw new Error('获取临时访问链接失败')
    }
    
    const tempUrl = tempUrlResult.fileList[0].tempFileURL
    console.log('获取临时链接成功:', tempUrl)
    
    return {
      success: true,
      data: {
        fileID: uploadResult.fileID,
        tempFileURL: tempUrl,
        cloudPath: cloudPath,
        originalUrl: imageUrl
      }
    }
    
  } catch (error) {
    console.error('图片代理失败 - 详细错误信息:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data ? error.response.data.toString() : null
      } : null
    })
    
    // 返回详细的错误信息
    let errorMessage = '图片代理失败'
    
    if (error.code === 'ECONNABORTED') {
      errorMessage = '下载图片超时，请稍后重试'
    } else if (error.response?.status === 403) {
      errorMessage = '图片访问被拒绝，可能需要特殊权限'
    } else if (error.response?.status === 404) {
      errorMessage = '图片不存在或已过期'
    } else if (error.response?.status >= 500) {
      errorMessage = '图片服务器错误，请稍后重试'
    } else if (error.message.includes('上传')) {
      errorMessage = '上传到云存储失败，请检查云存储配置'
    }
    
    return {
      success: false,
      error: errorMessage,
      debug: {
        originalError: error.message,
        errorType: error.constructor.name,
        errorCode: error.code,
        timestamp: new Date().toISOString()
      }
    }
  }
}