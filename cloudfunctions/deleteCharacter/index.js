// 删除人物云函数
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 删除指定人物
 * @param {Object} event - 云函数参数
 * @param {string} event.characterId - 人物ID
 * @param {Object} context - 云函数上下文
 * @returns {Object} 返回删除结果
 */
exports.main = async (event, context) => {
  try {
    const { characterId } = event
    
    // 参数验证
    if (!characterId) {
      return {
        success: false,
        error: '人物ID不能为空'
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
    
    // 检查人物是否存在且属于当前用户
    const existingCharacter = await db.collection('characters')
      .where({
        _id: characterId,
        userId: OPENID
      })
      .get()
    
    if (existingCharacter.data.length === 0) {
      return {
        success: false,
        error: '人物不存在或无权限删除'
      }
    }
    
    // 删除人物
    const result = await db.collection('characters')
      .where({
        _id: characterId,
        userId: OPENID
      })
      .remove()
    
    if (result.stats.removed === 0) {
      return {
        success: false,
        error: '删除失败，人物可能已被删除'
      }
    }
    
    return {
      success: true,
      message: '人物删除成功'
    }
    
  } catch (error) {
    console.error('删除人物失败:', error)
    return {
      success: false,
      error: '删除人物失败，请稍后重试'
    }
  }
}