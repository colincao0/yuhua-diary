// 分镜生成云函数 - 调用DeepSeek大模型生成分镜提示词
const cloud = require('wx-server-sdk')
const axios = require('axios')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 分镜生成云函数入口
 * 支持日记内容作为输入，生成4个连贯的分镜提示词
 * 包含缓存机制、全局seed生成、角色卡片生成等功能
 * @param {Object} event - 云函数事件对象
 * @param {Object} context - 云函数上下文对象
 * @returns {Object} 包含分镜数据或错误信息的响应对象
 */
exports.main = async (event, context) => {
  try {
    const { content, diaryId } = event
    const openid = cloud.getWXContext().OPENID
    
    // 输入参数验证
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return {
        success: false,
        error: '日记内容不能为空'
      }
    }
    
    // 检查缓存（如果提供了diaryId）
    if (diaryId) {
      const cached = await getCachedStoryboard(diaryId, openid)
      if (cached) {
        console.log('返回缓存的分镜数据')
        return {
          success: true,
          storyboards: cached,
          fromCache: true
        }
      }
    }
    
    // 生成全局唯一的seed（用于确保图片生成一致性）
    const globalSeed = Math.floor(Math.random() * 1000000000) + 1
    console.log('生成全局seed:', globalSeed)
    
    // 生成角色卡片（用于统一主角形象）
    const characterCard = await generateCharacterCard(content)
    const characterDescription = characterCard.full_description || characterCard.description || '一个可爱的小女孩'
    console.log('生成角色卡片:', characterDescription)
    
    // 调用DeepSeek生成分镜
    const storyboards = await generateStoryboardWithDeepSeek(content, 0, characterDescription, null, globalSeed)
    
    // 缓存结果（如果提供了diaryId）
    if (diaryId && storyboards && storyboards.length > 0) {
      await cacheStoryboard(diaryId, openid, storyboards)
    }
    
    return {
      success: true,
      storyboards: storyboards,
      characterCard: characterCard,
      globalSeed: globalSeed
    }
    
  } catch (error) {
    console.error('分镜生成失败:', error)
    return {
      success: false,
      error: error.message || '分镜生成失败，请稍后重试'
    }
  }
}

/**
 * 调用DeepSeek API生成分镜
 * 包含重试机制和JSON解析增强逻辑
 * @param {string} content - 日记内容
 * @param {number} retryCount - 重试次数
 * @param {string} characterCard - 角色卡片描述
 * @param {string} lastResponse - 上次响应（用于重试）
 * @param {number} seed - 全局种子值
 * @returns {Array} 包含4个分镜的数组
 */
async function generateStoryboardWithDeepSeek(content, retryCount = 0, characterCard, lastResponse = null, seed = null) {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'YOUR_DEEPSEEK_API_KEY_HERE'
  
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY_HERE') {
    console.log('DeepSeek API密钥未配置，使用备用分镜模板')
    return getDefaultStoryboards(content, characterCard, seed)
  }
  
  // 系统提示词 - 要求生成4个连贯的视觉分镜
  const systemPrompt = `你是一个专业的视觉分镜师。请根据用户提供的日记内容，生成4个连贯的视觉分镜，忠于原文，确保角色一致性。

要求：
1. 生成4个分镜，每个分镜包含scene_id、prompt、video_prompt、seed、style字段
2. prompt字段按照"角色卡片+风格+主体描述+美学+氛围"结构，中文输出，280字符以内
3. video_prompt为视频生成提示词，简洁明了
4. seed使用提供的全局种子值确保一致性
5. style包含model、preset、color、aspect_ratio字段
6. 严格按照JSON格式输出，不要包含任何其他文字

JSON格式示例：
{
  "storyboards": [
    {
      "scene_id": 1,
      "prompt": "角色描述，韩式动漫3D风格，主体行为描述，镜头美学，情感氛围",
      "video_prompt": "特写镜头，画面稳定",
      "seed": 123456789,
      "style": {
        "model": "dmx-3.0",
        "preset": "korean_anime",
        "color": "light_blue",
        "aspect_ratio": "9:16"
      }
    }
  ]
}`
  
  // 用户提示词 - 包含角色核心设定和日记内容
  const userPrompt = `角色核心设定：${characterCard}\n全局种子值：${seed}\n\n请为以下日记内容生成4个连贯的分镜：\n\n${content}`
  
  try {
    console.log('调用DeepSeek API生成分镜...')
    
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    })
    
    const responseText = response.data.choices[0].message.content
    console.log('DeepSeek API响应:', responseText)
    
    // 增强的JSON解析逻辑
    let parsedResponse
    try {
      parsedResponse = JSON.parse(responseText)
    } catch (parseError) {
      console.log('JSON解析失败，尝试修复...', parseError.message)
      
      // 尝试提取JSON部分
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsedResponse = JSON.parse(jsonMatch[0])
        } catch (secondParseError) {
          console.log('JSON修复失败，使用备用模板')
          throw new Error('JSON解析失败')
        }
      } else {
        throw new Error('未找到有效的JSON格式')
      }
    }
    
    // 验证和修正分镜数据
    const storyboards = parsedResponse.storyboards || []
    const validatedStoryboards = validateAndFixStoryboards(storyboards, characterCard, seed)
    
    if (validatedStoryboards.length === 4) {
      console.log('分镜生成成功')
      return validatedStoryboards
    } else {
      throw new Error('分镜数量不正确')
    }
    
  } catch (error) {
    console.error('DeepSeek API调用失败:', error.message)
    
    // 错误处理和重试机制
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000 // 指数退避
      console.log(`等待${delay}ms后重试...`)
      
      // 根据错误类型决定是否重试
      const shouldRetry = error.code === 'ECONNRESET' || 
                         error.code === 'ETIMEDOUT' || 
                         (error.response && error.response.status >= 500)
      
      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, delay))
        return generateStoryboardWithDeepSeek(content, retryCount + 1, characterCard, lastResponse, seed)
      }
    }
    
    // 重试失败后使用备用分镜模板
    console.log('使用备用分镜模板')
    return getDefaultStoryboards(content, characterCard, seed)
  }
}

/**
 * 验证和修正分镜数据
 * 确保分镜数量为4个，并为每个分镜附加全局唯一的seed
 * @param {Array} storyboards - 原始分镜数据
 * @param {string} characterCard - 角色卡片描述
 * @param {number} seed - 全局种子值
 * @returns {Array} 修正后的分镜数组
 */
function validateAndFixStoryboards(storyboards, characterCard, seed = null) {
  const validStoryboards = []
  const finalSeed = seed || Math.floor(Math.random() * 1000000000) + 1
  
  // 确保有4个分镜
  for (let i = 0; i < 4; i++) {
    const storyboard = storyboards[i] || {}
    
    // 修正分镜结构
    const validStoryboard = {
      scene_id: i + 1,
      prompt: storyboard.prompt || `${characterCard}，韩式动漫3D风格，场景${i + 1}的日常生活描述，中景镜头，柔和光线，温馨氛围，9:16竖版，高画质`,
      video_prompt: storyboard.video_prompt || generateDefaultVideoPrompt(i + 1),
      seed: finalSeed, // 使用全局种子确保一致性
      style: {
        model: 'dmx-3.0',
        preset: 'korean_anime',
        color: 'light_blue',
        aspect_ratio: '9:16',
        ...(storyboard.style || {})
      }
    }
    
    // 确保prompt长度不超过280字符
    if (validStoryboard.prompt.length > 280) {
      validStoryboard.prompt = validStoryboard.prompt.substring(0, 280)
    }
    
    validStoryboards.push(validStoryboard)
  }
  
  return validStoryboards
}

/**
 * 生成默认的视频提示词
 * @param {number} sceneId - 场景ID
 * @returns {string} 默认的视频提示词
 */
function generateDefaultVideoPrompt(sceneId) {
  const prompts = {
    1: '特写镜头，画面稳定',
    2: '中景镜头，轻微左摇',
    3: '广角镜头，缓慢拉远',
    4: '特写镜头，聚焦于细节'
  }
  return prompts[sceneId] || '镜头缓慢移动';
}

/**
 * 生成默认分镜模板
 * @param {string} content - 日记内容
 * @returns {Array} 包含4个分镜的数组
 */
function getDefaultStoryboards(content, characterCard = '一个可爱的小女孩', seed = null) {
  const sceneAnalysis = analyzeContentForScenes(content)
  
  // 生成默认seed（如果未提供）
  const finalSeed = seed || Math.floor(Math.random() * 1000000000) + 1;
  
  return [
    {
      scene_id: 1,
      prompt: generateEnhancedPrompt(sceneAnalysis.scene1, 1, characterCard),
      video_prompt: generateDefaultVideoPrompt(1),
      seed: finalSeed,
      style: {
        model: 'dmx-3.0',
        preset: 'korean_anime',
        color: 'light_blue',
        aspect_ratio: '9:16'
      }
    },
    {
      scene_id: 2,
      prompt: generateEnhancedPrompt(sceneAnalysis.scene2, 2, characterCard),
      video_prompt: generateDefaultVideoPrompt(2),
      seed: finalSeed,
      style: {
        model: 'dmx-3.0',
        preset: 'korean_anime',
        color: 'light_blue',
        aspect_ratio: '9:16'
      }
    },
    {
      scene_id: 3,
      prompt: generateEnhancedPrompt(sceneAnalysis.scene3, 3, characterCard),
      video_prompt: generateDefaultVideoPrompt(3),
      seed: finalSeed,
      style: {
        model: 'dmx-3.0',
        preset: 'korean_anime',
        color: 'light_blue',
        aspect_ratio: '9:16'
      }
    },
    {
      scene_id: 4,
      prompt: generateEnhancedPrompt(sceneAnalysis.scene4, 4, characterCard),
      video_prompt: generateDefaultVideoPrompt(4),
      seed: finalSeed,
      style: {
        model: 'dmx-3.0',
        preset: 'korean_anime',
        color: 'light_blue',
        aspect_ratio: '9:16'
      }
    }
  ]
}

/**
 * 分析日记内容并生成场景描述
 * @param {string} content - 日记内容
 * @returns {Object} 包含4个场景分析的对象
 */
function analyzeContentForScenes(content) {
  const keywords = extractKeywords(content)
  const emotions = extractEmotions(content)
  const locations = extractLocations(content)
  const activities = extractActivities(content)
  
  return {
    scene1: {
      type: 'opening',
      keywords: keywords.slice(0, 2),
      emotion: emotions[0] || 'peaceful',
      location: locations[0] || '日常环境',
      activity: activities[0] || '日常起居'
    },
    scene2: {
      type: 'development',
      keywords: keywords.slice(1, 3),
      emotion: emotions[1] || 'engaged',
      location: locations[1] || locations[0] || '主要场景',
      activity: activities[1] || activities[0] || '主要活动'
    },
    scene3: {
      type: 'climax',
      keywords: keywords.slice(2, 4),
      emotion: emotions[2] || emotions[0] || 'emotional',
      location: locations[2] || locations[0] || '关键地点',
      activity: activities[2] || '情感时刻'
    },
    scene4: {
      type: 'ending',
      keywords: keywords.slice(0, 2),
      emotion: emotions[3] || 'reflective',
      location: locations[3] || '宁静场所',
      activity: activities[3] || '思考反省'
    }
  }
}

/**
 * 生成增强的提示词 - 按照"风格+主体描述+美学+氛围"结构
 * @param {Object} sceneData - 场景数据
 * @param {number} sceneId - 场景ID
 * @returns {string} 优化后的提示词
 */
function generateEnhancedPrompt(sceneData, sceneId, characterCard) {
  const { type, keywords, emotion, location, activity } = sceneData
  
  // 1. 风格描述（专业短词语）
  const style = generateStyleDescription(type, sceneId)
  
  // 2. 主体描述（自然语言完整连贯描述：主体+行为+环境）
  const subject = generateSubjectDescription(type, activity, keywords)
  
  // 3. 美学描述（镜头语言等美学描述）
  const aesthetics = generateAestheticDescription(emotion, location)
  
  // 4. 氛围描述（情感氛围和技术参数）
  const atmosphere = generateAtmosphereDescription(emotion, type)
  
  // 按照用户要求的结构：角色卡片+风格+主体描述+美学+氛围
  const fullPrompt = `${characterCard}, ${style}, ${subject}, ${aesthetics}, ${atmosphere}`;
  return fullPrompt.substring(0, 280); // 截断到280个字符
}

/**
 * 生成主体描述（自然语言完整连贯描述：主体+行为+环境）
 * @param {string} type - 场景类型
 * @param {string} activity - 活动描述
 * @param {Array} keywords - 关键词
 * @returns {string} 主体描述
 */
function generateSubjectDescription(type, activity, keywords) {
  // 处理关键词，重点突出的内容放在前面
  const keywordStr = keywords.length > 0 ? keywords.slice(0, 3).join(', ') : '日常生活元素'

  // 根据场景类型生成完整连贯的主体描述
  const typeDescriptions = {
    opening: `一个年轻人开始新的一天，正在${activity}，周围环境包含${keywordStr}，展现日常生活的开始`,
    development: `主角专注地进行${activity}，身处充满${keywordStr}的环境中，展现积极投入的状态`,
    climax: `情感高潮时刻，主角深度体验${activity}，${keywordStr}成为画面的重要元素，突出内心感受`,
    ending: `宁静的结尾场景，主角在${activity}后进行反思，${keywordStr}作为背景元素营造温馨氛围`
  }

  // 强制使用中文描述，并提供一个中文回退
  return typeDescriptions[type] || `展现${activity}的场景，包含${keywordStr}元素`
}

/**
 * 生成风格描述（专业短词语）
 * @param {string} type - 场景类型
 * @param {number} sceneId - 场景ID
 * @returns {string} 风格描述
 */
function generateStyleDescription(type, sceneId) {
  const baseStyle = '韩式动漫3D风格'
  const lightingStyles = {
    opening: '柔和的晨光',
    development: '明亮的自然光', 
    climax: '戏剧性的电影光效',
    ending: '温暖的黄金时刻光线'
  }
  
  const lighting = lightingStyles[type] || '柔和光线'
  return `${baseStyle}, ${lighting}, 电影感构图`
}

/**
 * 生成美学描述（镜头语言等美学描述）
 * @param {string} emotion - 情感
 * @param {string} location - 位置
 * @returns {string} 美学描述
 */
function generateAestheticDescription(emotion, location) {
  // 镜头语言描述
  const cameraAngles = {
    peaceful: '中景, 平视角度',
    engaged: '特写镜头, 轻微低角度', 
    emotional: '戏剧性特写, 高对比度',
    reflective: '远景, 鸟瞰视角'
  }
  
  // 色彩美学
  const colorPalettes = {
    日常环境: '暖色调, 柔和阴影',
    主要场景: '鲜艳的色彩, 均衡曝光',
    关键地点: '丰富的色彩深度, 选择性对焦',
    宁静场所: '柔和的色调, 平缓的渐变'
  }
  
  const cameraWork = cameraAngles[emotion] || '中景, 平衡构图'
  const colorScheme = colorPalettes[location] || '和谐的色调'
  
  return `${cameraWork}, ${colorScheme}, 景深, 专业摄影`
}

/**
 * 生成氛围描述（情感氛围和技术参数）
 * @param {string} emotion - 情感
 * @param {string} type - 场景类型
 * @returns {string} 氛围描述
 */
function generateAtmosphereDescription(emotion, type) {
  // 情感氛围
  const emotionalAtmosphere = {
    peaceful: '宁静祥和的氛围',
    engaged: '充满活力和专注的氛围',
    emotional: '紧张而富有戏剧性的感觉',
    reflective: '沉思和怀旧的氛围'
  }
  
  // 技术参数
  const technicalSpecs = '9:16竖版，高画质，细节丰富'
  const atmosphere = emotionalAtmosphere[emotion] || '均衡的情感基调'
  
  return `${atmosphere}, ${technicalSpecs}, 梦幻空灵的质感`
}

/**
 * 根据日记内容生成结构化的角色卡片
 * @param {string} content - 日记内容
 * @returns {Object} 包含角色详细描述的JSON对象
 */
async function generateCharacterCard(content, retryCount = 0) {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_API_KEY) {
    console.log('无法生成角色卡片，缺少DEEPSEEK_API_KEY');
    return { description: '一个可爱的小女孩' };
  }

  const systemPrompt = `从日记中提取核心人物的特征，生成一个JSON对象描述其外貌。JSON结构如下：
{
  "description": "简短的角色核心描述（例如：一个活泼的短发女孩）",
  "hair_style": "具体的发型（例如：棕色及肩短发，有刘海）",
  "eye_color": "瞳色（例如：明亮的蓝色眼眸）",
  "outfit": "典型的着装风格（例如：穿着白色T恤和蓝色牛仔背带裤）",
  "accessories": "标志性配饰（例如：戴着一顶黄色的贝雷帽）"
}
要求：所有描述必须使用中文。如果日记中信息不足，请根据"可爱的小女孩"这一核心概念进行合理、一致的想象和补充。`;

  const userPrompt = `请为以下日记内容生成角色卡片：\n\n${content}`;

  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.6,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const card = JSON.parse(response.data.choices[0].message.content);
    // 将所有描述合并为一个字符串，用于后续注入
    card.full_description = Object.values(card).join('，');
    return card;

  } catch (error) {
    console.error('生成角色卡片失败:', error);
    if (retryCount < 2) {
      return await generateCharacterCard(content, retryCount + 1);
    }
    return { description: '一个可爱的小女孩', full_description: '一个可爱的小女孩' };
  }
}

/**
 * 从日记内容中提取关键词
 * @param {string} content - 日记内容
 * @returns {Array} 关键词数组
 */
function extractKeywords(content) {
  const commonKeywords = ['学校', '教室', '朋友', '家里', '公园', '咖啡厅', '图书馆', '操场', '家人', '学习', '工作', '自然']
  const found = []
  
  // 中文关键词映射 - 现在直接使用中文
  const chineseKeywords = {
    '学校': '学校', '教室': '教室', '朋友': '朋友', '家里': '家里',
    '公园': '公园', '咖啡厅': '咖啡厅', '图书馆': '图书馆', '操场': '操场',
    '家人': '家人', '学习': '学习', '工作': '工作', '自然': '自然',
    // 添加英文到中文的映射
    'school': '学校', 'classroom': '教室', 'friends': '朋友', 'home': '家里',
    'park': '公园', 'cafe': '咖啡厅', 'library': '图书馆', 'playground': '操场',
    'family': '家人', 'study': '学习', 'work': '工作', 'nature': '自然'
  }
  
  // 检查中文关键词
  for (const [key, chinese] of Object.entries(chineseKeywords)) {
    if (content.includes(key) && !found.includes(chinese)) {
      found.push(chinese)
    }
  }
  
  // 检查常见中文关键词
  for (const keyword of commonKeywords) {
    if (content.includes(keyword) && !found.includes(keyword)) {
      found.push(keyword)
    }
  }
  
  return found.length > 0 ? found.slice(0, 4) : ['日常生活', '宁静场景']
}

/**
 * 从日记内容中提取情感
 * @param {string} content - 日记内容
 * @returns {Array} 情感数组
 */
function extractEmotions(content) {
  const emotionKeywords = {
    peaceful: ['平静', '安静', '舒适', 'peaceful', 'calm', 'quiet'],
    engaged: ['忙碌', '活跃', '专注', 'busy', 'active', 'focused'],
    emotional: ['激动', '感动', '难过', 'excited', 'moved', 'emotional'],
    reflective: ['思考', '回忆', '总结', 'thinking', 'reflecting', 'remembering']
  }
  
  const found = []
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        found.push(emotion)
        break
      }
    }
  }
  
  return found.length > 0 ? found : ['peaceful', 'engaged', 'emotional', 'reflective']
}

/**
 * 从日记内容中提取位置
 * @param {string} content - 日记内容
 * @returns {Array} 位置数组
 */
function extractLocations(content) {
  const locationKeywords = {
    日常环境: ['家', '房间', 'home', 'room'],
    主要场景: ['学校', '公司', 'school', 'office'],
    关键地点: ['公园', '咖啡厅', 'park', 'cafe'],
    宁静场所: ['图书馆', '花园', 'library', 'garden']
  }
  
  const found = []
  for (const [location, keywords] of Object.entries(locationKeywords)) {
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        found.push(location)
        break
      }
    }
  }
  
  return found.length > 0 ? found : ['日常环境', '主要场景', '关键地点', '宁静场所']
}

/**
 * 从日记内容中提取活动
 * @param {string} content - 日记内容
 * @returns {Array} 活动数组
 */
function extractActivities(content) {
  const activityKeywords = {
    日常起居: ['起床', '吃饭', 'waking up', 'eating'],
    主要活动: ['学习', '工作', 'studying', 'working'],
    情感时刻: ['聊天', '玩耍', 'chatting', 'playing'],
    思考反省: ['思考', '写作', 'thinking', 'writing']
  }
  
  const found = []
  for (const [activity, keywords] of Object.entries(activityKeywords)) {
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        found.push(activity)
        break
      }
    }
  }
  
  return found.length > 0 ? found : ['日常起居', '主要活动', '情感时刻', '思考反省']
}

/**
 * 获取默认场景
 * @param {number} sceneId - 场景ID
 * @returns {Object} 默认场景对象
 */
function getDefaultScene(sceneId) {
  return {
    scene_id: sceneId,
    prompt: `场景${sceneId}：韩式动漫3D风格，浅蓝主色调，9:16竖版，动态运镜`,
    style: {
      model: 'dmx-3.0',
      preset: 'korean_anime',
      color: 'light_blue',
      aspect_ratio: '9:16'
    }
  }
}

/**
 * 获取缓存的分镜数据
 * @param {string} diaryId - 日记ID
 * @param {string} openid - 用户openid
 * @returns {Array|null} 缓存的分镜数据或null
 */
async function getCachedStoryboard(diaryId, openid) {
  try {
    const res = await db.collection('storyboard_cache')
      .where({
        diaryId: diaryId,
        _openid: openid
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()
    
    if (res.data.length > 0) {
      const cache = res.data[0]
      // 检查缓存是否过期（24小时）
      const now = new Date()
      const cacheTime = new Date(cache.createTime)
      const hoursDiff = (now - cacheTime) / (1000 * 60 * 60)
      
      if (hoursDiff < 24) {
        return cache.storyboards
      }
    }
    
    return null
  } catch (error) {
    console.error('获取缓存失败:', error)
    return null
  }
}

/**
 * 缓存分镜数据
 * @param {string} diaryId - 日记ID
 * @param {string} openid - 用户openid
 * @param {Array} storyboards - 分镜数据
 */
async function cacheStoryboard(diaryId, openid, storyboards) {
  try {
    await db.collection('storyboard_cache').add({
      data: {
        diaryId: diaryId,
        _openid: openid,
        storyboards: storyboards,
        createTime: new Date()
      }
    })
    console.log('分镜数据已缓存')
  } catch (error) {
    console.error('缓存分镜数据失败:', error)
  }
}