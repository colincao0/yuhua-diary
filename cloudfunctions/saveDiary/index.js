/**
 * 保存日记云函数
 * 功能：创建新日记或更新现有日记，支持仅更新视频信息
 * 小白提示：这个云函数负责将用户写的日记保存到数据库中
 */
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前环境
})

// 获取数据库引用
const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 前端传入的参数
 * @param {string} event.id - 日记ID（更新时需要）
 * @param {string} event.title - 日记标题
 * @param {string} event.content - 日记内容
 * @param {string} event.date - 日记日期
 * @param {string} event.mood - 心情
 * @param {Object} event.videoInfo - 视频信息
 * @param {boolean} event.updateVideoOnly - 是否仅更新视频信息
 * @param {Object} context - 云函数上下文
 * @returns {Object} 操作结果
 */
exports.main = async (event, context) => {
  // 获取微信用户上下文信息
  const wxContext = cloud.getWXContext()
  
  try {
    const { id, title, content, date, mood, videoInfo, updateVideoOnly } = event
    
    // 如果是仅更新视频信息的请求
    if (updateVideoOnly && id && videoInfo) {
      const result = await db.collection('diaries')
        .where({
          _id: id,
          _openid: wxContext.OPENID // 确保只能修改自己的日记
        })
        .update({
          data: {
            videoInfo: videoInfo,
            updateTime: new Date()
          }
        })
      
      // 检查是否成功更新
      if (result.stats.updated === 0) {
        return {
          success: false,
          message: '日记不存在或无权限修改'
        }
      }
      
      return {
        success: true,
        message: '视频信息更新成功',
        id: id
      }
    }
    
    // 验证必填字段
    if (!title || !content) {
      return {
        success: false,
        message: '标题和内容不能为空'
      }
    }
    
    const now = new Date()
    const diaryData = {
      title: title.trim(), // 去除首尾空格
      content: content.trim(),
      date: date ? new Date(date) : now, // 如果没有指定日期，使用当前时间
      mood: mood || '', // 心情可以为空
      _openid: wxContext.OPENID, // 记录用户身份
      updateTime: now
    }
    
    // 如果包含视频信息，添加到数据中
    if (videoInfo) {
      diaryData.videoInfo = videoInfo
    }
    
    let result
    
    if (id) {
      // 更新现有日记
      result = await db.collection('diaries')
        .where({
          _id: id,
          _openid: wxContext.OPENID // 确保只能修改自己的日记
        })
        .update({
          data: diaryData
        })
      
      // 检查是否成功更新
      if (result.stats.updated === 0) {
        return {
          success: false,
          message: '日记不存在或无权限修改'
        }
      }
      
      return {
        success: true,
        message: '日记更新成功',
        id: id
      }
    } else {
      // 创建新日记
      diaryData.createTime = now // 记录创建时间
      
      result = await db.collection('diaries').add({
        data: diaryData
      })
      
      return {
        success: true,
        message: '日记保存成功',
        id: result._id
      }
    }
  } catch (error) {
    console.error('保存日记失败:', error)
    return {
      success: false,
      message: '保存日记失败',
      error: error.message
    }
  }
}