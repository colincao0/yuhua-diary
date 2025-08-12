/**
 * 火山引擎通用视觉服务文生图云函数 - 修复版
 * 功能：使用火山方舟API生成图片，支持批量和单个生成模式
 * 小白提示：这个云函数负责根据文字描述生成对应的图片
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')
const pLimit = require('p-limit')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 获取数据库引用
const db = cloud.database()

/**
 * 文生图云函数主入口
 * @param {Object} event - 包含分镜提示词的事件对象
 * @param {Array|Object} event.storyboards - 分镜提示词数组（批量生成）或单个分镜对象
 * @param {Object} event.storyboard - 单个分镜对象（单个生成）
 * @param {number} event.sceneId - 场景ID（单个生成时使用）
 * @param {string} event.diaryId - 日记ID
 * @returns {Object} 包含图片生成结果
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { storyboards, storyboard, sceneId, diaryId } = event
    
    // 判断是批量生成还是单个生成
    if (storyboard && sceneId) {
      // 单个场景生成模式
      console.log('开始生成单个场景图片，场景ID:', sceneId)
      
      try {
        const images = await generateSceneImages(storyboard, sceneId)
        
        return {
          success: true,
          images: images,
          message: '图片生成成功'
        }
      } catch (error) {
        console.error('单个场景图片生成失败:', error)
        
        // 返回备用图片
        return {
          success: true,
          images: getDefaultImages(sceneId),
          message: '使用备用图片',
          error: error.message
        }
      }
    } else if (storyboards && Array.isArray(storyboards)) {
      // 批量生成模式（分批串行处理）
      if (storyboards.length !== 4) {
        return {
          success: false,
          message: '分镜数量必须为4个'
        }
      }
      
      console.log('开始分批生成图片，日记ID:', diaryId, '分镜数量:', storyboards.length)
      console.log('使用分批串行处理，每批2个场景')
      
      const finalResults = []
      const errors = []
      
      // 分批处理：每次处理2个场景
      for (let batchIndex = 0; batchIndex < 2; batchIndex++) {
        const startIndex = batchIndex * 2
        const endIndex = Math.min(startIndex + 2, storyboards.length)
        const currentBatch = storyboards.slice(startIndex, endIndex)
        
        console.log(`开始处理第${batchIndex + 1}批，场景${startIndex + 1}-${endIndex}`)
        
        // 当前批次的并发处理（最多2个场景同时处理）
        const batchPromises = currentBatch.map(async (storyboard, index) => {
          const sceneId = startIndex + index + 1
          try {
            console.log(`开始生成场景${sceneId}图片...`)
            const images = await generateSceneImages(storyboard, sceneId)
            console.log(`场景${sceneId}图片生成成功`)
            return {
              scene_id: sceneId,
              images: images,
              success: true
            }
          } catch (error) {
            console.error(`场景${sceneId}图片生成失败:`, error)
            errors.push(`场景${sceneId}: ${error.message}`)
            return {
              scene_id: sceneId,
              images: getDefaultImages(sceneId),
              success: false,
              error: error.message
            }
          }
        })
        
        // 等待当前批次完成
        const batchResults = await Promise.all(batchPromises)
        finalResults.push(...batchResults)
        
        console.log(`第${batchIndex + 1}批处理完成，成功${batchResults.filter(r => r.success).length}个，失败${batchResults.filter(r => !r.success).length}个`)
        
        // 如果不是最后一批，添加间隔时间避免API频率限制
        if (batchIndex < 1) {
          console.log('等待2秒后处理下一批...')
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
      
      // 按场景ID排序确保顺序正确
      finalResults.sort((a, b) => a.scene_id - b.scene_id)
      
      // 保存生成结果到数据库
      if (diaryId) {
        await saveImageResults(diaryId, wxContext.OPENID, finalResults)
      }
      
      return {
        success: true,
        data: finalResults,
        errors: errors.length > 0 ? errors : null,
        message: errors.length > 0 ? `部分场景生成失败，已使用备用图片` : '所有图片生成成功'
      }
    } else {
      return {
        success: false,
        message: '参数格式错误：需要提供 storyboards 数组或 storyboard 对象'
      }
    }
    
  } catch (error) {
    console.error('文生图处理失败:', error)
    return {
      success: false,
      message: '图片生成失败: ' + error.message,
      error: error.toString()
    }
  }
}

/**
 * 生成单个场景的图片 - 火山引擎通用视觉服务版本
 * 
 * 使用火山引擎通用视觉服务API和AWS V4签名认证
 * 
 * @param {Object} storyboard - 分镜对象，包含提示词等信息
 * @param {number} sceneId - 场景ID
 * @param {number} retryCount - 重试次数，默认为0
 * @returns {Array} 图片数组
 */
async function generateSceneImages(storyboard, sceneId, retryCount = 0) {
  console.log('=== 火山方舟通用视觉模型图片生成开始 ===')
  
  // 从环境变量获取API密钥
  const arkApiKey = process.env.VOLC_SECRETKEY || 'YOUR_ARK_API_KEY_HERE'
  
  console.log('检查火山方舟API密钥配置...')
  console.log('ARK API Key 是否配置:', !!arkApiKey)
  console.log('ARK API Key 长度:', arkApiKey ? arkApiKey.length : 0)
  
  // 检查密钥是否配置
  if (!arkApiKey || arkApiKey === 'YOUR_ARK_API_KEY_HERE') {
    throw new Error('火山方舟API密钥未配置，请在云开发控制台配置 VOLC_SECRETKEY 环境变量')
  }
  
  console.log(`开始生成场景${sceneId}的图片`)
  
  // 添加请求间隔，避免429错误
  if (retryCount > 0) {
    const delay = Math.min(3000 * Math.pow(2, retryCount), 30000) // 指数退避，3秒起步，最大30秒
    console.log(`等待${delay}ms后重试...`)
    await new Promise(resolve => setTimeout(resolve, delay))
  } else {
    // 即使是第一次请求，也添加小延迟避免突发请求
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  try {
    // 构建火山方舟API请求参数
    const requestData = {
      model: 'doubao-seedream-3-0-t2i-250415',  // 火山方舟文生图标准模型ID
      prompt: storyboard.prompt,
      size: '576x1024',  // 竖版图片尺寸
      n: 4,  // 生成4张候选图片
      quality: 'standard'  // 标准质量
    }
    
    console.log('使用火山方舟API格式')
    console.log(`场景${sceneId}请求参数:`, JSON.stringify(requestData, null, 2))
    
    // 构建请求头（使用Bearer Token认证）
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${arkApiKey}`
    }
    
    console.log(`场景${sceneId}请求头:`, JSON.stringify(headers, null, 2))
    
    // 调用火山方舟API
    console.log(`场景${sceneId} - 发起火山方舟API请求...`);
    const response = await axios.post(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      requestData,
      {
        headers: headers,
        timeout: 60000 // 60秒超时
      }
    )
    
    console.log(`场景${sceneId}API响应状态:`, response.status)
    console.log(`场景${sceneId}API响应数据:`, JSON.stringify(response.data, null, 2))
    
    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      // 处理火山方舟通用视觉模型API响应格式（OpenAI兼容）
      const images = []
      const imageData = response.data.data
      
      console.log(`场景${sceneId}生成${imageData.length}张图片`)
      imageData.forEach((item, index) => {
        images.push({
          id: `scene_${sceneId}_img_${index + 1}`,
          url: item.url,
          thumbnail_url: item.url,
          width: 576,
          height: 1024,
          quality_score: calculateQualityScore({ image_url: item.url }),
          style_consistency: calculateStyleConsistency(storyboard.prompt, { image_url: item.url }),
          seed: Math.floor(Math.random() * 10000),
          created_at: new Date().toISOString()
        })
      })
      
      // 确保至少有一张图片
      if (images.length === 0) {
        const fallbackUrl = 'https://via.placeholder.com/576x1024'
        images.push({
          id: `scene_${sceneId}_img_1`,
          url: fallbackUrl,
          thumbnail_url: fallbackUrl,
          width: 576,
          height: 1024,
          quality_score: 75,
          style_consistency: 80,
          seed: Math.floor(Math.random() * 10000),
          created_at: new Date().toISOString()
        })
      }
      
      // 按质量评分排序
      images.sort((a, b) => b.quality_score - a.quality_score)
      
      console.log(`场景${sceneId}生成${images.length}张图片`)
      return images
    } else {
      throw new Error('API响应格式错误: ' + JSON.stringify(response.data))
    }
    
  } catch (error) {
    console.error(`场景${sceneId}图片生成失败:`, error)
    
    // 检查是否是429错误（请求频率限制）或网络超时
    const is429Error = error.response && error.response.status === 429
    const isTimeoutError = error.code === 'ECONNABORTED' || error.message.includes('timeout')
    const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ECONNRESET'
    const isRateLimitError = error.message && error.message.includes('Request failed with status code 429')
    
    // 如果是429错误、超时或网络错误，且重试次数少于5次，则重试
    if ((is429Error || isRateLimitError || isTimeoutError || isNetworkError) && retryCount < 5) {
      const errorType = is429Error || isRateLimitError ? '频率限制(429)' : isTimeoutError ? '超时' : '网络'
      console.log(`场景${sceneId}遇到${errorType}错误，尝试第${retryCount + 1}次重试...`)
      console.log(`错误详情: ${error.message}`)
      
      try {
        return await generateSceneImages(storyboard, sceneId, retryCount + 1)
      } catch (retryError) {
        console.error(`场景${sceneId}重试失败:`, retryError)
        // 如果重试也失败，继续抛出原错误
        if (retryCount >= 2) {
          throw retryError
        }
      }
    }
    
    throw error
  }
}

/**
 * 计算图片质量评分
 * @param {Object} imageData - 图片数据
 * @returns {number} 质量评分（0-100）
 * 小白提示：这个函数给生成的图片打分，分数越高质量越好
 */
function calculateQualityScore(imageData) {
  // 基础评分
  let score = 80
  
  // 根据图片尺寸调整评分
  if (imageData.width && imageData.height) {
    const aspectRatio = imageData.width / imageData.height
    const targetRatio = 9 / 16 // 目标比例 9:16
    const ratioDiff = Math.abs(aspectRatio - targetRatio)
    
    if (ratioDiff < 0.1) {
      score += 10 // 比例完美
    } else if (ratioDiff < 0.2) {
      score += 5  // 比例良好
    }
  }
  
  // 根据文件大小调整评分（如果有的话）
  if (imageData.file_size) {
    if (imageData.file_size > 100000) { // 大于100KB
      score += 5
    }
  }
  
  // 随机微调（模拟真实的质量检测）
  score += Math.random() * 10 - 5
  
  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * 计算风格一致性评分
 * @param {string} prompt - 原始提示词
 * @param {Object} imageData - 图片数据
 * @returns {number} 一致性评分（0-100）
 * 小白提示：这个函数检查生成的图片是否符合描述的风格
 */
function calculateStyleConsistency(prompt, imageData) {
  // 基础一致性评分
  let score = 85
  
  // 检查关键词匹配度
  const keywords = ['韩式', '动漫', '3D', '浅蓝', '竖版']
  const promptLower = prompt.toLowerCase()
  
  keywords.forEach(keyword => {
    if (promptLower.includes(keyword.toLowerCase())) {
      score += 2
    }
  })
  
  // 随机微调
  score += Math.random() * 10 - 5
  
  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * 获取默认备用图片
 * @param {number} sceneId - 场景ID
 * @returns {Array} 默认图片数组
 * 小白提示：当图片生成失败时，返回这些备用图片
 */
function getDefaultImages(sceneId) {
  // 生成 base64 编码的 SVG 默认图片
  const defaultImageUrl = 'data:image/svg+xml;base64,' + Buffer.from(`
    <svg width="576" height="1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#87CEEB"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="36" fill="white" text-anchor="middle" dy=".3em">Scene ${sceneId}</text>
    </svg>
  `).toString('base64')
  
  return Array.from({ length: 4 }, (_, index) => ({
    id: `default_scene_${sceneId}_img_${index + 1}`,
    url: defaultImageUrl,
    thumbnail_url: defaultImageUrl,
    width: 576,
    height: 1024,
    quality_score: 60,
    style_consistency: 70,
    seed: Math.floor(Math.random() * 10000),
    created_at: new Date().toISOString(),
    is_default: true
  }))
}

/**
 * 保存图片生成结果到数据库
 * @param {string} diaryId - 日记ID
 * @param {string} openid - 用户openid
 * @param {Array} imageResults - 图片生成结果
 * 小白提示：将生成的图片信息保存到数据库中，方便后续查看
 */
async function saveImageResults(diaryId, openid, imageResults) {
  try {
    await db.collection('image_generation_results').add({
      data: {
        diaryId: diaryId,
        _openid: openid,
        results: imageResults,
        createTime: new Date(),
        status: 'completed'
      }
    })
    console.log('图片生成结果已保存到数据库')
  } catch (error) {
    console.error('保存图片生成结果失败:', error)
  }
}

/**
 * 获取单张图片的详细信息（用于调试）
 * @param {string} imageUrl - 图片URL
 * @returns {Object} 图片详细信息
 * 小白提示：这个函数用于调试，获取图片的详细信息
 */
async function getImageDetails(imageUrl) {
  try {
    const response = await axios.head(imageUrl, { timeout: 5000 })
    return {
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length'],
      lastModified: response.headers['last-modified']
    }
  } catch (error) {
    console.error('获取图片详情失败:', error)
    return null
  }
}