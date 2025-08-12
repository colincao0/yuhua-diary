// 获取人物列表云函数
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 获取用户的人物列表
 * @param {Object} event - 云函数参数
 * @param {Object} context - 云函数上下文
 * @returns {Object} 返回人物列表数据
 */
exports.main = async (event, context) => {
  try {
    // 获取用户openid
    const { OPENID } = cloud.getWXContext()
    
    if (!OPENID) {
      return {
        success: false,
        error: '用户身份验证失败'
      }
    }
    
    // 从数据库查询用户的人物列表
    const result = await db.collection('characters')
      .where({
        userId: OPENID
      })
      .orderBy('createTime', 'desc') // 按创建时间倒序排列
      .get()
    
    // 处理返回数据，只返回必要字段，并转换为前端期望的格式
    // 同时刷新过期的临时访问链接
    const characterList = await Promise.all(result.data.map(async (character) => {
      const views = {
        front: character.frontView || '',
        side: character.sideView || '',
        back: character.backView || ''
      }
      
      // 处理图片链接 - 优化版本
      // 优先使用fileID，对于过期的临时链接进行清理
      try {
        const fileIds = []
        const urlMapping = {} // 用于映射原始URL到fileID
        let needsDatabaseUpdate = false
        const updateData = {}
        
        // 检查并处理frontView
        if (views.front) {
          if (views.front.startsWith('cloud://')) {
            // 正确的fileID，直接使用
            fileIds.push(views.front)
            urlMapping[views.front] = 'front'
          } else if (views.front.includes('tcb.qcloud.la') || views.front.includes('myqcloud.com') || views.front.includes('temp_file_url')) {
            // 过期的临时链接，清空并标记需要更新数据库
            console.log(`人物 ${character.name} 的frontView包含过期临时链接，将清空:`, views.front)
            views.front = ''
            updateData.frontView = ''
            needsDatabaseUpdate = true
          }
        }
        
        // 检查并处理sideView
        if (views.side) {
          if (views.side.startsWith('cloud://')) {
            fileIds.push(views.side)
            urlMapping[views.side] = 'side'
          } else if (views.side.includes('tcb.qcloud.la') || views.side.includes('myqcloud.com') || views.side.includes('temp_file_url')) {
            console.log(`人物 ${character.name} 的sideView包含过期临时链接，将清空:`, views.side)
            views.side = ''
            updateData.sideView = ''
            needsDatabaseUpdate = true
          }
        }
        
        // 检查并处理backView
        if (views.back) {
          if (views.back.startsWith('cloud://')) {
            fileIds.push(views.back)
            urlMapping[views.back] = 'back'
          } else if (views.back.includes('tcb.qcloud.la') || views.back.includes('myqcloud.com') || views.back.includes('temp_file_url')) {
            console.log(`人物 ${character.name} 的backView包含过期临时链接，将清空:`, views.back)
            views.back = ''
            updateData.backView = ''
            needsDatabaseUpdate = true
          }
        }
        
        // 如果需要更新数据库，清理过期链接
        if (needsDatabaseUpdate) {
          try {
            await db.collection('characters').doc(character._id).update({
              data: updateData
            })
            console.log(`已清理人物 ${character.name} 的过期图片链接`)
          } catch (updateError) {
            console.error(`更新人物 ${character.name} 数据失败:`, updateError)
          }
        }
        
        // 如果有有效的云存储文件ID，获取新的临时链接
        if (fileIds.length > 0) {
          console.log(`人物 ${character.name} 需要获取临时链接的fileIds:`, fileIds)
          console.log(`urlMapping:`, urlMapping)
          
          try {
            const tempUrlResult = await cloud.getTempFileURL({
              fileList: fileIds
            })
            
            console.log(`getTempFileURL返回结果:`, JSON.stringify(tempUrlResult, null, 2))
            
            if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
              tempUrlResult.fileList.forEach((file) => {
                console.log(`处理文件:`, file)
                if (file.tempFileURL && file.fileID) {
                  const viewType = urlMapping[file.fileID]
                  if (viewType) {
                    console.log(`将${viewType}视图从 ${views[viewType]} 更新为 ${file.tempFileURL}`)
                    views[viewType] = file.tempFileURL
                    console.log(`✅ 刷新${viewType}视图链接成功`)
                  }
                } else if (file.errCode) {
                  console.error(`❌ 获取临时链接失败 ${file.fileID}:`, file.errMsg)
                  // 如果fileID无效，也清空对应的字段
                  const viewType = urlMapping[file.fileID]
                  if (viewType) {
                    views[viewType] = ''
                  }
                }
              })
            } else {
              console.log(`⚠️ getTempFileURL没有返回文件列表`)
            }
          } catch (tempUrlError) {
            console.error(`调用getTempFileURL时发生错误:`, tempUrlError)
          }
        }
        
      } catch (error) {
        console.error('处理图片链接失败:', error)
        // 如果处理失败，确保不返回无效链接
        if (views.front && !views.front.startsWith('cloud://') && !views.front.startsWith('http')) {
          views.front = ''
        }
        if (views.side && !views.side.startsWith('cloud://') && !views.side.startsWith('http')) {
          views.side = ''
        }
        if (views.back && !views.back.startsWith('cloud://') && !views.back.startsWith('http')) {
          views.back = ''
        }
      }
      
      return {
        _id: character._id,
        name: character.name,
        description: character.description,
        views: views,
        createTime: character.createTime,
        updateTime: character.updateTime
      }
    }))
    
    return {
      success: true,
      characters: characterList,  // 修改字段名为characters
      total: characterList.length
    }
    
  } catch (error) {
    console.error('获取人物列表失败:', error)
    return {
      success: false,
      error: '获取人物列表失败，请稍后重试'
    }
  }
}