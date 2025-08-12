// 更新人物云函数
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 更新人物信息
 * @param {Object} event - 云函数参数
 * @param {string} event.characterId - 人物ID
 * @param {Object} event.characterData - 更新的人物数据
 * @param {string} event.characterData.name - 人物名称
 * @param {string} event.characterData.description - 人物描述
 * @param {string} event.characterData.frontView - 正面视图URL
 * @param {string} event.characterData.sideView - 侧面视图URL
 * @param {string} event.characterData.backView - 背面视图URL
 * @param {Object} context - 云函数上下文
 * @returns {Object} 返回更新结果
 */
exports.main = async (event, context) => {
  try {
    const { characterId, characterData } = event
    
    // 参数验证
    if (!characterId) {
      return {
        success: false,
        error: '人物ID不能为空'
      }
    }
    
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
        error: '人物不存在或无权限修改'
      }
    }
    
    // 检查新名称是否与其他人物重复（排除当前人物）
    const duplicateCheck = await db.collection('characters')
      .where({
        userId: OPENID,
        name: characterData.name.trim(),
        _id: db.command.neq(characterId)
      })
      .get()
    
    if (duplicateCheck.data.length > 0) {
      return {
        success: false,
        error: '该人物名称已存在，请使用其他名称'
      }
    }
    
    // 准备更新的数据
    const updateData = {
      name: characterData.name.trim(),
      description: characterData.description.trim(),
      frontView: characterData.frontView || '',
      sideView: characterData.sideView || '',
      backView: characterData.backView || '',
      updateTime: new Date()
    }
    
    // 更新数据库
    const result = await db.collection('characters')
      .where({
        _id: characterId,
        userId: OPENID
      })
      .update({
        data: updateData
      })
    
    if (result.stats.updated === 0) {
      return {
        success: false,
        error: '更新失败，人物可能已被删除'
      }
    }
    
    return {
      success: true,
      data: {
        _id: characterId,
        ...updateData
      }
    }
    
  } catch (error) {
    console.error('更新人物失败:', error)
    return {
      success: false,
      error: '更新人物失败，请稍后重试'
    }
  }
}