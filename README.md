# 语画日记 📖✨

> 一款集语音、图片、文字于一体的微信小程序日记应用

## 🌟 项目特色

- 🎤 **智能语音转文字** - 说话即可记录，AI自动转换文字
- 📸 **图文并茂** - 支持添加图片，记录生活美好瞬间
- 😊 **心情追踪** - 记录每天的情绪状态，了解心情变化
- 📅 **多视图浏览** - 时间轴和日历两种方式查看日记
- 📊 **数据统计** - 记录天数、字数等个人数据分析
- ☁️ **云端同步** - 基于微信云开发，数据安全可靠

## 🚀 快速开始

### 环境要求

- 微信开发者工具 1.05.0+
- Node.js 14.0+
- 微信小程序开发权限

### 配置信息

- **小程序APPID**: `wxc68be427f947d995`
- **云环境ID**: `cloud1-7gkqsyzd582553ed`

### 一键检查配置

```bash
# 检查项目配置和云函数
node scripts/deploy-cloud-functions.js

# 运行功能测试
node scripts/test-functions.js
```

### 部署步骤

1. **导入项目**
   - 打开微信开发者工具
   - 导入项目目录
   - 填入APPID

2. **开通云开发**
   - 点击"云开发"按钮
   - 选择按量付费
   - 等待环境创建

3. **部署云函数**
   - 右键 `cloudfunctions/speechToText`
   - 选择"创建并部署：云端安装依赖"
   - 重复部署其他云函数

4. **配置数据库**
   - 在云开发控制台创建集合：`diaries`、`characters`
   - 设置权限为"仅创建者可读写"

## 📱 功能模块

### 核心功能
- **语音记录** - 实时语音转文字，支持方言识别
- **图片上传** - 多图上传，自动压缩优化
- **文字编辑** - 富文本编辑，支持表情符号
- **心情选择** - 多种心情状态记录

### 高级功能
- **AI图片生成** - 集成火山方舟API，根据文字生成图片
- **视频生成** - 即梦AI图生视频功能
- **人物管理** - 创建和管理日记中的人物角色
- **三视图生成** - 自动生成人物的正面、侧面、背面视图

### 数据管理
- **云端存储** - 所有数据安全存储在微信云开发
- **离线缓存** - 支持离线编辑，联网后自动同步
- **数据导出** - 支持导出个人日记数据

## 🛠️ 技术架构

### 前端技术
- **框架**: 微信小程序原生开发
- **样式**: WXSS + Flex布局
- **状态管理**: 页面级状态管理
- **组件化**: 自定义组件开发

### 后端服务
- **云函数**: Node.js + 微信云开发
- **数据库**: 微信云数据库 (MongoDB)
- **存储**: 微信云存储
- **API集成**: 火山方舟API、即梦AI API

### 第三方服务
- **语音识别**: 微信同声传译API
- **图片生成**: 火山方舟 doubao-pro-32k 模型
- **视频生成**: 即梦AI VGFM模型
- **图片处理**: 火山引擎veImageX

## 📂 项目结构

```
语画日记/
├── miniprogram/          # 小程序前端代码
│   ├── pages/           # 页面文件
│   ├── components/      # 自定义组件
│   ├── utils/          # 工具函数
│   └── images/         # 静态图片资源
├── cloudfunctions/      # 云函数
│   ├── speechToText/   # 语音转文字
│   ├── generateImages/ # AI图片生成
│   ├── generateVideo/  # AI视频生成
│   ├── saveDiary/      # 保存日记
│   └── getDiaryList/   # 获取日记列表
├── docs/               # 项目文档
└── scripts/            # 部署脚本
```

## 🔧 API配置

### 火山方舟API配置

1. 在火山方舟控制台创建应用
2. 获取API密钥
3. 在云函数中配置环境变量：
   ```javascript
   const API_KEY = 'your-volc-api-key';
   const ENDPOINT_ID = 'your-endpoint-id';
   ```

### 即梦AI配置

1. 注册即梦AI账号
2. 获取API密钥和签名密钥
3. 配置云函数环境变量：
   ```javascript
   const JIMENG_API_KEY = 'your-jimeng-api-key';
   const JIMENG_SECRET_KEY = 'your-jimeng-secret-key';
   ```

## 🚀 最新更新

### v2.1.0 (2025-08-11)
- ✅ **视频生成API优化** - 修复即梦AI图生视频功能
- ✅ **API模式修正** - 将req_key从t2v改为i2v模式
- ✅ **参数优化** - 添加image_strength和motion_strength参数
- ✅ **经验文档** - 创建《视频生成API优化经验总结.md》
- ✅ **最佳实践** - 提供API更换的通用方法论

### v2.0.0 (2025-08-10)
- ✅ **图片生成功能恢复** - 修复火山方舟API调用问题
- ✅ **视频生成功能** - 集成即梦AI图生视频
- ✅ **人物管理系统** - 完整的人物创建和管理功能
- ✅ **三视图生成** - 自动生成人物多角度视图

## 📋 待办事项

- [ ] 添加日记分类功能
- [ ] 实现日记搜索功能
- [ ] 添加日记分享功能
- [ ] 优化图片加载性能
- [ ] 添加数据统计图表
- [ ] 实现日记导出PDF功能

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系方式

- 项目维护者: Colin Cao
- 邮箱: colincao0@gmail.com
- 项目链接: [https://github.com/colincao0/yuhua-diary](https://github.com/colincao0/yuhua-diary)

## 🙏 致谢

感谢以下服务提供商的支持：
- 微信小程序云开发
- 火山方舟AI平台
- 即梦AI视频生成服务
- 火山引擎veImageX图片处理服务

---

⭐ 如果这个项目对你有帮助，请给它一个星标！