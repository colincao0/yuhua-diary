// 用户身份验证云函数
// 处理用户登录，获取OPENID并注册用户信息
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 用户身份验证主函数
 * @param {Object} event - 云函数参数
 * @param {string} event.code - 微信登录凭证
 * @param {Object} event.userInfo - 用户基本信息
 * @returns {Object} 验证结果，包含OPENID
 */
exports.main = async (event, context) => {
  console.log('=== 用户身份验证开始 ===')
  console.log('接收到的参数:', {
    code: event.code ? '已提供' : '未提供',
    userInfo: event.userInfo ? '已提供' : '未提供'
  })
  
  try {
    // 1. 参数验证
    if (!event.code) {
      return {
        success: false,
        error: '缺少微信登录凭证'
      }
    }
    
    if (!event.userInfo) {
      return {
        success: false,
        error: '缺少用户信息'
      }
    }
    
    // 2. 获取微信用户上下文信息（包含OPENID）
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    console.log('获取到的OPENID:', openid)
    
    // 3. 验证OPENID是否有效
    if (!openid || openid === 'undefined') {
      return {
        success: false,
        error: '无法获取用户身份标识，请检查云开发环境配置'
      }
    }
    
    // 4. 准备用户数据
    const userData = {
      openid: openid,
      nickName: event.userInfo.nickName || '未知用户',
      avatarUrl: event.userInfo.avatarUrl || '',
      gender: event.userInfo.gender || 0,
      country: event.userInfo.country || '',
      province: event.userInfo.province || '',
      city: event.userInfo.city || '',
      language: event.userInfo.language || 'zh_CN',
      lastLoginTime: new Date(),
      createTime: new Date()
    }
    
    // 5. 检查用户是否已存在
    const existingUser = await db.collection('users').where({
      openid: openid
    }).get()
    
    if (existingUser.data.length > 0) {
      // 用户已存在，更新最后登录时间
      await db.collection('users').doc(existingUser.data[0]._id).update({
        data: {
          lastLoginTime: new Date(),
          // 更新用户信息（可能会变化）
          nickName: userData.nickName,
          avatarUrl: userData.avatarUrl
        }
      })
      
      console.log('用户已存在，更新登录时间')
    } else {
      // 新用户，创建用户记录
      await db.collection('users').add({
        data: userData
      })
      
      console.log('新用户注册成功')
    }
    
    // 6. 返回成功结果
    return {
      success: true,
      openid: openid,
      message: '身份验证成功',
      userData: {
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl
      }
    }
    
  } catch (error) {
    console.error('用户身份验证失败:', error)
    
    return {
      success: false,
      error: '身份验证失败: ' + error.message,
      debug: {
        errorMessage: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      }
    }
  }
}