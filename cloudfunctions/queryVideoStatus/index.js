/**
 * queryVideoStatus 云函数 - 即梦AI版本
 * 用于查询视频生成任务状态
 * 支持即梦AI和火山方舟两种服务类型的自动识别
 */

const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 即梦AI API配置 - 请在云函数环境变量中配置实际密钥
const ACCESS_KEY = process.env.JIMENG_ACCESS_KEY || 'YOUR_ACCESS_KEY_HERE'
const SECRET_KEY = process.env.JIMENG_SECRET_KEY || 'YOUR_SECRET_KEY_HERE'
const SERVICE_HOST = 'visual.volcengineapi.com'
const SERVICE_NAME = 'cv'
const API_VERSION = '2022-08-31'
const REGION = 'cn-north-1'

/**
 * 即梦AI请求签名算法
 * @param {Object} options 签名参数
 * @returns {Object} 请求头
 */
function signJimengRequest(options) {
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
  
  // 使用与generateVideo完全一致的时间戳格式
  const timeStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const dateStamp = timeStamp.slice(0, 8)
  
  // 构建规范请求 - 与generateVideo保持完全一致
  const canonicalMethod = method.toUpperCase()
  const canonicalUri = path
  const canonicalQuerystring = `Action=${action}&Version=${version}`
  const canonicalHeaders = [
    `host:${host}`,
    `x-date:${timeStamp}`
  ].join('\n') + '\n'
  const signedHeaders = 'host;x-date'
  const payloadHash = crypto.createHash('sha256').update(body || '{}').digest('hex')
  
  const canonicalRequest = [
    canonicalMethod,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
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
    'Host': host,
    'X-Date': timeStamp,
    'Content-Type': 'application/json'
  }
}

/**
 * 查询即梦AI视频生成状态
 * @param {string} taskId 任务ID
 * @returns {Object} 查询结果
 */
async function queryJimengVideoStatus(taskId) {
  console.log(`[即梦AI] 开始查询任务状态: ${taskId}`)
  
  try {
    // 构造即梦AI查询参数：必须同时传 req_key 与 task_id（否则服务端会返回 400）
    // 小白提示：req_key 是"接口模型/能力"的标识，task_id 是提交任务时返回的ID
    const requestData = {
      req_key: 'jimeng_vgfm_i2v_l20', // 使用图生视频模型标识
      task_id: taskId
    }
    // 注意：签名函数使用字符串参与签名，这里保持与实际发送一致
    const requestBody = JSON.stringify(requestData)
    
    const headers = signJimengRequest({
      method: 'POST',
      host: SERVICE_HOST,
      path: '/',
      service: SERVICE_NAME,
      region: REGION,
      action: 'CVSync2AsyncGetResult',
      version: API_VERSION,
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      body: requestBody
    })
    
    console.log('[即梦AI] 发送状态查询请求:', requestData)
    
    // 重要：请求URL需要带上 Action 与 Version，与签名中的 canonical querystring 保持一致
    const response = await axios.post(`https://${SERVICE_HOST}/?Action=CVSync2AsyncGetResult&Version=${API_VERSION}`, requestData, {
      headers,
      timeout: 30000
    })
    
    console.log('[即梦AI] API响应:', JSON.stringify(response.data, null, 2))
    
    if (response.data && response.data.code === 10000) {
      const result = response.data.data
      
      // 状态映射 - 修复前端期望的状态值
      let status = 'processing'
      let videoUrl = null
      
      if (result.status === 'done') {
        status = 'completed'  // 修复：前端期望 'completed' 而不是 'done'
        videoUrl = result.video_url
        console.log('[即梦AI] 视频生成完成:', videoUrl)
      } else if (result.status === 'failed') {
        status = 'failed'
        console.log('[即梦AI] 视频生成失败:', result.message || '未知错误')
      } else {
        console.log('[即梦AI] 视频生成中...', result.status)
      }
      
      return {
        success: true,
        status,
        videoUrl,
        message: result.message || '查询成功',
        rawData: result
      }
    } else {
      console.error('[即梦AI] API返回错误:', response.data)
      return {
        success: false,
        status: 'failed',
        error: response.data?.message || '查询失败',  // 修复：前端期望 'error' 字段
        message: response.data?.message || '查询失败'
      }
    }
  } catch (error) {
    console.error('[即梦AI] 查询状态失败:', error.message)
    return {
      success: false,
      status: 'failed',
      error: `查询失败: ${error.message}`,  // 修复：前端期望 'error' 字段
      message: `查询失败: ${error.message}`
    }
  }
}

/**
 * 查询火山方舟视频生成状态（兼容性支持）
 * @param {string} taskId 任务ID
 * @returns {Object} 查询结果
 */
async function queryArkVideoStatus(taskId) {
  console.log(`[火山方舟] 开始查询任务状态: ${taskId}`)
  
  try {
    // 火山方舟API调用逻辑（如果需要兼容）
    // 这里可以添加火山方舟的状态查询逻辑
    console.log('[火山方舟] 暂不支持，请使用即梦AI')
    
    return {
      success: false,
      status: 'failed',
      message: '火山方舟服务暂不支持，请使用即梦AI'
    }
  } catch (error) {
    console.error('[火山方舟] 查询状态失败:', error.message)
    return {
      success: false,
      status: 'failed',
      message: `查询失败: ${error.message}`
    }
  }
}

/**
 * 云函数入口函数
 * @param {Object} event 事件参数
 * @param {Object} context 上下文
 * @returns {Object} 查询结果
 */
exports.main = async (event, context) => {
  console.log('=== queryVideoStatus 云函数开始执行 ===')
  console.log('输入参数:', JSON.stringify(event, null, 2))
  
  const { taskId } = event
  
  if (!taskId) {
    console.error('缺少必要参数: taskId')
    return {
      success: false,
      message: '缺少任务ID参数'
    }
  }
  
  try {
    // 查询数据库中的任务记录，使用数据库记录ID查询
    console.log('查询数据库中的任务记录，使用记录ID:', taskId)
    const taskRecord = await db.collection('video_tasks').doc(taskId).get()
    
    let serviceType = 'jimeng' // 默认使用即梦AI
    let jimengTaskId = null  // 即梦API的任务ID
    
    if (taskRecord.data) {
      const record = taskRecord.data
      serviceType = record.serviceType || 'jimeng'
      jimengTaskId = record.jimengTaskId  // 从数据库获取即梦任务ID
      console.log(`从数据库获取 - 服务类型: ${serviceType}, 即梦任务ID: ${jimengTaskId}`)
    } else {
      console.log('数据库中未找到任务记录，使用默认服务类型: jimeng')
    }
    
    // 即梦AI需要使用jimengTaskId而不是内部taskId
    if (serviceType === 'jimeng' && !jimengTaskId) {
      console.error('即梦AI任务缺少jimengTaskId')
      return {
        success: false,
        error: '任务记录中缺少即梦任务ID',
        message: '任务记录中缺少即梦任务ID'
      }
    }
    
    // 根据服务类型选择查询方法，使用对应的任务ID
    let result
    if (serviceType === 'ark' || serviceType === 'volcengine') {
      result = await queryArkVideoStatus(taskId)
    } else {
      // 重要：即梦AI查询需要传递jimengTaskId，而不是内部taskId
      console.log(`调用即梦AI状态查询，使用任务ID: ${jimengTaskId}`)
      result = await queryJimengVideoStatus(jimengTaskId)
    }
    
    // 更新数据库中的任务状态
    if (result.success && result.status === 'completed' && result.videoUrl) {  // 修复：状态已改为 'completed'
      try {
        await db.collection('video_tasks').doc(taskId).update({
          data: {
            status: 'completed',  // 修复：保持一致性
            videoUrl: result.videoUrl,
            completedAt: new Date()
          }
        })
        console.log('数据库状态更新成功')
      } catch (updateError) {
        console.error('更新数据库状态失败:', updateError)
      }
    }
    
    return result
    
  } catch (error) {
    console.error('查询视频状态失败:', error)
    return {
      success: false,
      status: 'failed',
      error: `查询失败: ${error.message}`,  // 修复：前端期望 'error' 字段
      message: `查询失败: ${error.message}`
    }
  }
}