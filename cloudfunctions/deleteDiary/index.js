// 删除日记云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { id } = event
    
    if (!id) {
      return {
        success: false,
        message: '日记ID不能为空'
      }
    }
    
    // 删除日记
    const result = await db.collection('diaries')
      .where({
        _id: id,
        _openid: wxContext.OPENID
      })
      .remove()
    
    if (result.stats.removed === 0) {
      return {
        success: false,
        message: '日记不存在或无权限删除'
      }
    }
    
    return {
      success: true,
      message: '日记删除成功'
    }
  } catch (error) {
    console.error('删除日记失败:', error)
    return {
      success: false,
      message: '删除日记失败',
      error: error.message
    }
  }
}