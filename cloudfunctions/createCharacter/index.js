// 创建人物云函数
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 创建新人物
 * @param {Object} event - 云函数参数
 * @param {Object} event.characterData - 人物数据
 * @param {string} event.characterData.name - 人物名称
 * @param {string} event.characterData.description - 人物描述
 * @param {string} event.characterData.frontView - 正面视图URL
 * @param {string} event.characterData.sideView - 侧面视图URL
 * @param {string} event.characterData.backView - 背面视图URL
 * @param {Object} context - 云函数上下文
 * @returns {Object} 返回创建结果
 */
exports.main = async (event, context) => {
  try {
    const { characterData } = event
    
    // 参数验证
    if (!characterData || !characterData.name || !characterData.description) {
      return {
        success: false,
        error: '人物名称和描述不能为空'
      }
    }
    
    // 获取用户openid
    const { OPENID } = cloud.getWXContext()
    
    if (!OPENID) {
      return {
        success: false,
        error: '用户身份验证失败'
      }
    }
    
    // 检查人物名称是否已存在（同一用户下）
    const existingCharacter = await db.collection('characters')
      .where({
        userId: OPENID,
        name: characterData.name.trim()
      })
      .get()
    
    if (existingCharacter.data.length > 0) {
      return {
        success: false,
        error: '该人物名称已存在，请使用其他名称'
      }
    }
    
    // 准备插入的数据
    const insertData = {
      userId: OPENID,
      name: characterData.name.trim(),
      description: characterData.description.trim(),
      frontView: characterData.frontView || '',
      sideView: characterData.sideView || '',
      backView: characterData.backView || '',
      createTime: new Date(),
      updateTime: new Date()
    }
    
    // 插入到数据库
    const result = await db.collection('characters').add({
      data: insertData
    })
    
    return {
      success: true,
      data: {
        _id: result._id,
        ...insertData
      }
    }
    
  } catch (error) {
    console.error('创建人物失败:', error)
    return {
      success: false,
      error: '创建人物失败，请稍后重试'
    }
  }
}