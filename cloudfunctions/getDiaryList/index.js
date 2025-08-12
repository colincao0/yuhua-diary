// 获取日记列表云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { page = 1, pageSize = 10 } = event
    
    // 计算跳过的记录数
    const skip = (page - 1) * pageSize
    
    // 查询日记列表
    const result = await db.collection('diaries')
      .where({
        _openid: wxContext.OPENID
      })
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
    
    // 获取总数
    const countResult = await db.collection('diaries')
      .where({
        _openid: wxContext.OPENID
      })
      .count()
    
    return {
      success: true,
      data: result.data,
      total: countResult.total,
      page,
      pageSize,
      hasMore: skip + result.data.length < countResult.total
    }
  } catch (error) {
    console.error('获取日记列表失败:', error)
    return {
      success: false,
      message: '获取日记列表失败',
      error: error.message
    }
  }
}