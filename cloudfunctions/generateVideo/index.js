/**
 * 图生视频云函数 - 即梦AI版本
 * 基于火山引擎即梦AI视觉智能服务实现图片到视频的转换
 * 使用CVSync2AsyncSubmitTask和CVSync2AsyncGetResult接口
 */

const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 图生视频云函数主入口 - 即梦AI版本
 * @param {Object} event - 包含选中图片的事件对象
 * @param {Array} event.selectedImages - 用户选中的图片URL数组
 * @param {string} event.diaryId - 日记ID
 * @param {string} event.sceneId - 场景ID（图片ID），用于关联视频与特定图片
 * @param {Object} event.videoParams - 视频参数配置
 * @returns {Object} 包含生成视频URL和封面图的结果
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    console.log('generateVideo云函数被调用（即梦AI版本），参数:', JSON.stringify(event, null, 2))
    const { selectedImages, diaryId, sceneId, videoParams = {} } = event
    
    // 验证输入参数
    if (!selectedImages || !Array.isArray(selectedImages)) {
      console.error('selectedImages参数错误:', selectedImages)
      return {
        success: false,
        error: '选中图片数据格式错误',
        message: '选中图片数据格式错误'
      }
    }
    
    if (selectedImages.length === 0) {
      console.error('selectedImages为空数组')
      return {
        success: false,
        error: '至少需要选择1张图片',
        message: '至少需要选择1张图片'
      }
    }
    
    if (!diaryId) {
      console.error('diaryId参数缺失')
      return {
        success: false,
        error: '日记ID不能为空',
        message: '日记ID不能为空'
      }
    }
    
    console.log('=== 即梦AI视频生成服务配置 ===')
    
    // 从环境变量获取即梦AI密钥 - 请在云函数环境变量中配置
    const ACCESS_KEY = process.env.JIMENG_ACCESS_KEY || 'YOUR_ACCESS_KEY_HERE'
    const SECRET_KEY = process.env.JIMENG_SECRET_KEY || 'YOUR_SECRET_KEY_HERE'
    
    console.log('即梦AI Access Key:', ACCESS_KEY ? 'API Key已配置' : '未配置')
    console.log('即梦AI Secret Key:', SECRET_KEY ? 'Secret Key已配置' : '未配置')
    
    if (!ACCESS_KEY || !SECRET_KEY || ACCESS_KEY === 'YOUR_ACCESS_KEY_HERE' || SECRET_KEY === 'YOUR_SECRET_KEY_HERE') {
      console.error('即梦AI API密钥未配置')
      throw new Error('服务配置错误：即梦AI API密钥未配置，请联系管理员')
    }
    
    // 提交视频生成任务
    console.log('开始调用即梦AI视觉智能服务 - 图生视频')
    const taskResult = await submitJimengVideoTask({
      selectedImages,
      videoParams,
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY
    })
    
    if (!taskResult.success) {
      console.error('提交即梦AI视频任务失败:', taskResult.error)
      return {
        success: false,
        message: taskResult.error || '视频生成任务提交失败'
      }
    }
    
    console.log('即梦AI视频任务提交成功，任务ID:', taskResult.taskId)
    
    // 保存任务记录到数据库
    const taskRecord = {
      taskId: taskResult.taskId,        // 即梦AI的原始任务ID（保持兼容性）
      jimengTaskId: taskResult.taskId,  // 专门用于即梦AI状态查询的字段
      diaryId: diaryId,
      sceneId: sceneId || 'batch',
      openid: wxContext.OPENID,
      status: 'processing',
      selectedImages: selectedImages,
      videoParams: videoParams,
      serviceType: 'jimeng', // 标记为即梦AI服务
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    
    const saveResult = await db.collection('video_tasks').add({
      data: taskRecord
    })
    
    console.log('任务记录保存成功，记录ID:', saveResult._id)
    
    // 返回任务ID，前端可以用来轮询状态
    return {
      success: true,
      taskId: saveResult._id, // 返回数据库记录ID作为任务标识
      jimengTaskId: taskResult.taskId, // 即梦AI的原始任务ID
      message: '视频生成任务已提交，请稍后查询结果',
      estimatedTime: '预计需要1-3分钟'
    }
    
  } catch (error) {
    console.error('generateVideo云函数执行失败:', {
      error: error.message,
      stack: error.stack,
      event: event
    })
    
    return {
      success: false,
      error: '视频生成服务暂时不可用：' + error.message,
      message: '视频生成服务暂时不可用：' + error.message
    }
  }
}

/**
 * 提交即梦AI视频生成任务
 * @param {Object} params - 任务参数
 * @param {Array} params.selectedImages - 选中的图片URL数组
 * @param {Object} params.videoParams - 视频参数
 * @param {string} params.accessKey - API访问密钥
 * @param {string} params.secretKey - API密钥
 * @returns {Object} 任务提交结果
 */
async function submitJimengVideoTask(params) {
  const { selectedImages, videoParams, accessKey, secretKey } = params
  
  try {
    console.log('=== 开始提交即梦AI视频生成任务 ===')
    console.log('图片数量:', selectedImages.length)
    console.log('视频参数:', videoParams)
    
    // 即梦AI图生视频需要图片URL，这里使用第一张图片
    const firstImageUrl = selectedImages[0]
    console.log('使用图片URL:', firstImageUrl)
    
    // 构建即梦AI API请求参数
    const requestData = {
      req_key: 'jimeng_vgfm_i2v_l20', // 即梦AI图生视频服务标识（i2v = Image-to-Video）
      prompt: videoParams.prompt || '根据图片内容生成一个精美的视频，展现画面中的美好时光',
      seed: videoParams.seed || -1, // 随机种子，默认-1（随机）
      aspect_ratio: videoParams.aspect_ratio || '16:9', // 视频尺寸比例
      image_url: firstImageUrl, // 输入图片URL
      // 添加图生视频特有参数
      image_strength: 0.8, // 图片参考强度，0.5-1.0，值越高越保持原图特征
      motion_strength: 0.6 // 运动强度，0.1-1.0，控制动态幅度
    }
    
    console.log('即梦AI请求参数:', JSON.stringify(requestData, null, 2))
    
    // 生成签名和请求头
    const signedRequest = await signJimengRequest({
      method: 'POST',
      host: 'visual.volcengineapi.com',
      path: '/',
      service: 'cv',
      region: 'cn-north-1',
      action: 'CVSync2AsyncSubmitTask',
      version: '2022-08-31',
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      body: JSON.stringify(requestData)
    })
    
    console.log('即梦AI签名请求头:', JSON.stringify(signedRequest, null, 2))
    
    // 调用即梦AI API
    console.log('即梦AI - 发起API请求...')
    const response = await axios.post(
      'https://visual.volcengineapi.com/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31',
      requestData,
      {
        headers: signedRequest,
        timeout: 60000 // 60秒超时
      }
    )
    
    console.log('即梦AI API响应状态:', response.status)
    console.log('即梦AI API响应数据:', JSON.stringify(response.data, null, 2))
    
    if (response.data && response.data.code === 10000 && response.data.data) {
      const taskId = response.data.data.task_id
      
      if (taskId) {
        console.log('即梦AI视频任务提交成功，任务ID:', taskId)
        return {
          success: true,
          taskId: taskId,
          serviceType: 'jimeng'
        }
      } else {
        console.error('即梦AI API响应中未找到任务ID')
        return {
          success: false,
          error: '任务提交失败：未获取到任务ID'
        }
      }
    } else {
      console.error('即梦AI API响应格式异常:', response.data)
      return {
        success: false,
        error: `任务提交失败：${response.data?.message || '未知错误'}`
      }
    }
    
  } catch (error) {
    console.error('提交即梦AI视频任务失败 - 详细错误信息:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data
    })
    
    // 处理不同类型的错误
    if (error.response) {
      const status = error.response.status
      const data = error.response.data
      
      if (status === 401) {
        return {
          success: false,
          error: 'API密钥认证失败，请检查密钥配置'
        }
      } else if (status === 403) {
        return {
          success: false,
          error: 'API访问权限不足，请检查服务开通状态'
        }
      } else if (status >= 500) {
        return {
          success: false,
          error: '即梦AI服务暂时不可用，请稍后重试'
        }
      } else {
        return {
          success: false,
          error: `API调用失败：${data?.message || error.message}`
        }
      }
    } else if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: '请求超时，请稍后重试'
      }
    } else {
      return {
        success: false,
        error: `网络错误：${error.message}`
      }
    }
  }
}

/**
 * 即梦AI请求签名算法
 * @param {Object} options - 请求选项
 * @returns {Object} 签名后的请求头
 */
async function signJimengRequest(options) {
  const {
    method,
    host,
    path,
    service,
    region,
    action,
    version,
    accessKeyId,
    secretAccessKey,
    body
  } = options

  // 生成时间戳
  const now = new Date()
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timeStamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', 'T') + 'Z'

  // 构建规范请求
  const canonicalUri = path
  const canonicalQuerystring = `Action=${action}&Version=${version}`
  const canonicalHeaders = [
    `host:${host}`,
    `x-date:${timeStamp}`
  ].join('\n') + '\n'
  const signedHeaders = 'host;x-date'
  
  // 计算body的SHA256哈希
  const bodyHash = crypto.createHash('sha256').update(body || '', 'utf8').digest('hex')
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    bodyHash
  ].join('\n')

  // 构建签名字符串
  const algorithm = 'HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/request`
  const stringToSign = [
    algorithm,
    timeStamp,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n')

  // 计算签名
  const kDate = crypto.createHmac('sha256', secretAccessKey).update(dateStamp).digest()
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest()
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest()
  const kSigning = crypto.createHmac('sha256', kService).update('request').digest()
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  // 构建Authorization头
  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    'Authorization': authorizationHeader,
    'Content-Type': 'application/json',
    'X-Date': timeStamp,
    'Host': host
  }
}

/**
 * 轮询即梦AI视频生成状态（备用函数，主要由queryVideoStatus云函数处理）
 * @param {string} taskId - 任务ID
 * @param {string} accessKey - API访问密钥
 * @param {string} secretKey - API密钥
 * @returns {Object} 状态查询结果
 */
async function pollJimengVideoStatus(taskId, accessKey, secretKey) {
  try {
    console.log('查询即梦AI视频状态:', { taskId, timestamp: new Date().toISOString() })
    
    // 构建查询请求参数
    const requestData = {
      req_key: 'jimeng_vgfm_i2v_l20',
      task_id: taskId
    }
    
    console.log('即梦AI状态查询参数:', JSON.stringify(requestData, null, 2))
    
    // 生成签名和请求头
    const signedRequest = await signJimengRequest({
      method: 'POST',
      host: 'visual.volcengineapi.com',
      path: '/',
      service: 'cv',
      region: 'cn-north-1',
      action: 'CVSync2AsyncGetResult',
      version: '2022-08-31',
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      body: JSON.stringify(requestData)
    })
    
    // 调用即梦AI状态查询API
    const response = await axios.post(
      'https://visual.volcengineapi.com/?Action=CVSync2AsyncGetResult&Version=2022-08-31',
      requestData,
      {
        headers: signedRequest,
        timeout: 30000 // 30秒超时
      }
    )
    
    console.log('即梦AI状态查询响应:', JSON.stringify(response.data, null, 2))
    
    if (response.data && response.data.code === 10000 && response.data.data) {
      const result = response.data.data
      const status = result.status
      
      console.log('即梦AI任务状态:', status)
      
      if (status === 'done') {
        // 任务完成
        const videoUrl = result.video_url
        if (videoUrl) {
          console.log('即梦AI视频生成完成，视频URL:', videoUrl)
          return {
            success: true,
            status: 'succeeded',
            videoUrl: videoUrl,
            coverUrl: result.cover_url || videoUrl // 封面图URL
          }
        } else {
          console.error('即梦AI任务完成但未获取到视频URL')
          return {
            success: false,
            status: 'failed',
            error: '视频生成完成但未获取到视频URL'
          }
        }
      } else if (status === 'processing' || status === 'in_queue') {
        // 任务处理中
        console.log('即梦AI任务处理中...')
        return {
          success: true,
          status: 'processing',
          message: '视频正在生成中，请稍后查询'
        }
      } else if (status === 'failed') {
        // 任务失败
        console.error('即梦AI任务失败')
        return {
          success: false,
          status: 'failed',
          error: result.error_message || '视频生成失败'
        }
      } else {
        // 未知状态
        console.warn('即梦AI任务状态未知:', status)
        return {
          success: true,
          status: 'processing',
          message: `任务状态：${status}`
        }
      }
    } else {
      console.error('即梦AI状态查询响应格式异常:', response.data)
      return {
        success: false,
        status: 'failed',
        error: `状态查询失败：${response.data?.message || '未知错误'}`
      }
    }
    
  } catch (error) {
    console.error('查询即梦AI视频状态失败:', {
      message: error.message,
      stack: error.stack,
      taskId: taskId
    })
    
    return {
      success: false,
      status: 'failed',
      error: `状态查询失败：${error.message}`
    }
  }
}

// 导出辅助函数供其他云函数使用
// 导出辅助函数供其他模块使用（可选）
// module.exports = {
//   submitJimengVideoTask,
//   signJimengRequest,
//   pollJimengVideoStatus
// }