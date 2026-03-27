# 途正英语AI分级测评 - 微信小程序

## 项目概述

途正英语AI分级测评小程序，基于微信原生开发，完全复刻H5版本体验。已对接真实后端API，支持完整的测评流程。

## 技术栈

- 微信小程序原生开发（WXML + WXSS + JavaScript）
- 微信同声传译插件（前端实时语音识别，辅助后端Whisper精确评分）
- 后端API：`https://tzapp-admin.figo.cn`
- 语音评分：Whisper ASR + LLM 评分（后端集成）
- 录音存储：阿里云OSS

## 目录结构

```
miniprogram/
├── app.js                  # 全局入口（系统布局+登录状态+等级配置）
├── app.json                # 全局配置
├── app.wxss                # 全局样式（品牌色、毛玻璃、动画）
├── project.config.json     # 项目配置（AppID: wx560c0278194b128c）
├── sitemap.json            # 站点地图
├── assets/
│   └── icons/              # SVG图标
├── utils/
│   ├── request.js          # 网络请求封装（Token管理、自动刷新、文件上传）
│   ├── api.js              # API接口封装（14个接口，兼容后端camelCase/snake_case）
│   └── util.js             # 工具函数
└── pages/
    ├── home/               # 欢迎页（品牌展示+视频+入口）
    ├── login/              # 登录页（微信手机号快捷登录+短信验证码）
    ├── rules/              # 测评说明页（流程+录音权限）
    ├── test/               # 测评主页面（核心交互：听题→录音→上传→评分）
    ├── result/             # 结果页（等级+得分+群二维码）
    └── history/            # 历史记录页
```

## 开发准备

1. 在 `project.config.json` 中确认小程序 AppID（当前：`wx560c0278194b128c`）
2. 在微信公众平台添加同声传译插件（AppID: `wx069ba97219f66d99`）
3. 配置服务器域名白名单：
   - request合法域名：`https://tzapp-admin.figo.cn`
   - uploadFile合法域名：`https://tzapp-admin.figo.cn`
4. 使用微信开发者工具打开 `miniprogram` 目录

## 页面说明

| 页面 | 路径 | 功能 |
|------|------|------|
| 欢迎页 | `/pages/home/home` | 品牌展示、示例视频、开始测评入口 |
| 登录页 | `/pages/login/login` | 微信手机号快捷登录 + 短信验证码登录 |
| 测评说明 | `/pages/rules/rules` | 流程说明、录音权限授权 |
| 测评页 | `/pages/test/test` | 听题→录音→上传OSS→Whisper转写→LLM评分→下一题 |
| 结果页 | `/pages/result/result` | 等级展示、分项得分、群二维码入群 |
| 历史记录 | `/pages/history/history` | 测评记录列表、统计摘要 |

## 登录方式

1. **微信手机号快捷登录（推荐）**：用户点击按钮授权 → 前端获取phoneCode + loginCode → 后端换取手机号 → 自动注册/登录
2. **短信验证码登录**：输入手机号 → 获取验证码 → 登录

## 测评流程（真实API）

```
1. startTest()          → 创建测评会话，获取第一题
2. 播放AI语音           → audioUrl（后端TTS生成）
3. 用户按住说话          → RecorderManager录音 + 同声传译实时识别
4. uploadAudio()        → 录音上传到OSS，返回audioUrl
5. evaluateAnswer()     → 传audioUrl + recognizedText + duration → 后端Whisper+LLM评分
6. 返回评分+下一题       → 循环直到测评结束
7. getTestResult()      → 获取最终等级和详细报告
8. getQrcodeByLevel()   → 获取对应等级的学习群二维码
```

## API接口列表

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/auth/wx-phone-login` | POST | 微信手机号快捷登录 |
| `/api/v1/auth/send-sms-code` | POST | 发送短信验证码 |
| `/api/v1/auth/sms-login` | POST | 短信验证码登录 |
| `/api/v1/auth/me` | GET | 获取当前用户信息 |
| `/api/v1/auth/logout` | POST | 退出登录 |
| `/api/v1/auth/refresh-token` | POST | 刷新Token |
| `/api/v1/test/start` | POST | 创建测评会话 |
| `/api/v1/test/evaluate` | POST | 提交回答+AI评分 |
| `/api/v1/test/upload-audio` | POST | 上传录音到OSS |
| `/api/v1/test/transcribe` | POST | 语音转文字（Whisper） |
| `/api/v1/test/tts` | POST | 文本转语音 |
| `/api/v1/test/terminate` | POST | 终止测评 |
| `/api/v1/test/result/:sessionId` | GET | 获取测评结果 |
| `/api/v1/test/history` | GET | 查询测评历史 |
| `/api/v1/qrcode/level/:level` | GET | 获取群二维码 |

## 设计风格

- 品牌蓝：`#1B3F91`
- 品牌绿：`#83BA12`
- 毛玻璃卡片 + 渐变背景
- 自定义导航栏（全页面适配胶囊按钮）
- Nunito 字体

## 后端API

所有接口对接 `https://tzapp-admin.figo.cn`，认证方式为 `Bearer Token + X-App-Key`。

前端代码已做字段兼容处理，同时支持 camelCase 和 snake_case 两种命名风格。

详细接口文档见：`【内部】途正AI测评-后端开发技术文档.pdf`

---

*开发维护：广州火鹰信息科技有限公司*
