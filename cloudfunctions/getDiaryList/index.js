/**
 * 获取日记列表云函数
 * 功能：分页获取用户的日记列表，按日期倒序排列
 * 小白提示：这个云函数负责从数据库中获取用户的日记列表，支持分页加载
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
 * @param {number} event.page - 页码，默认为1
 * @param {number} event.pageSize - 每页数量，默认为10
 * @param {Object} context - 云函数上下文
 * @returns {Object} 查询结果
 */
exports.main = async (event, context) => {
  // 获取微信用户上下文信息
  const wxContext = cloud.getWXContext()
  
  try {
    const { page = 1, pageSize = 10 } = event
    
    // 计算跳过的记录数
    // 小白提示：分页原理 - 第1页跳过0条，第2页跳过10条，第3页跳过20条...
    const skip = (page - 1) * pageSize
    
    // 查询日记列表
    const result = await db.collection('diaries')
      .where({
        _openid: wxContext.OPENID // 只查询当前用户的日记
      })
      .orderBy('date', 'desc') // 按日期倒序排列（最新的在前面）
      .skip(skip) // 跳过前面的记录
      .limit(pageSize) // 限制返回数量
      .get()
    
    // 获取总数（用于判断是否还有更多数据）
    const countResult = await db.collection('diaries')
      .where({
        _openid: wxContext.OPENID
      })
      .count()
    
    return {
      success: true,
      data: result.data, // 日记列表数据
      total: countResult.total, // 总记录数
      page, // 当前页码
      pageSize, // 每页数量
      hasMore: skip + result.data.length < countResult.total // 是否还有更多数据
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