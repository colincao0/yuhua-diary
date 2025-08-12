// 保存日记云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { id, title, content, date, mood, videoInfo, updateVideoOnly } = event
    
    // 如果是仅更新视频信息
    if (updateVideoOnly && id && videoInfo) {
      const result = await db.collection('diaries')
        .where({
          _id: id,
          _openid: wxContext.OPENID
        })
        .update({
          data: {
            videoInfo: videoInfo,
            updateTime: new Date()
          }
        })
      
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
      title: title.trim(),
      content: content.trim(),
      date: date ? new Date(date) : now,
      mood: mood || '',
      _openid: wxContext.OPENID,
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
          _openid: wxContext.OPENID
        })
        .update({
          data: diaryData
        })
      
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
      diaryData.createTime = now
      
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