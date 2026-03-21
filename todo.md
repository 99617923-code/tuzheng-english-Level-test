# 途正英语AI分级测评 - TODO

## 核心要求
- [x] 移除所有Manus后端依赖（OAuth、tRPC、数据库）
- [x] 纯前端项目，后端API后续由客户提供
- [x] 遵循火鹰科技品牌规范，禁止出现Manus字样
- [x] 预留API接口层，方便后续对接客户后端

## 架构重构
- [x] 创建API service层（axios封装，对接客户后端）
- [x] 创建AuthContext（基于客户API的登录状态管理）
- [x] 重写main.tsx移除tRPC/Manus依赖
- [x] 开发登录页（手机号+密码+图形验证码）
- [x] 开发注册页

## 页面开发
- [x] 欢迎页 Home - 品牌展示+开始测评入口
- [x] 规则说明页 Rules - 测评流程+注意事项+麦克风授权
- [x] AI对话测评页 Test - 语音对话核心交互
- [x] 测评结果页 Result - 分级报告展示

## 前端模拟数据
- [x] 模拟AI对话流程（自适应出题逻辑）
- [x] 模拟语音录入→文字转换
- [x] 模拟AI评估→分级结果
- [x] 浏览器TTS朗读AI提问

## UI设计感优化
- [x] 教育温暖风设计风格统一
- [x] 对话气泡动画与交互
- [x] 录音按钮交互（按住说话）
- [x] 进度条与状态指示
- [x] 结果页庆祝动画

## 对接客户后端API
- [x] 查看 https://tzapp-admin.figo.cn/api-docs 了解可用接口
- [x] 对接captcha、login、register、me等认证接口（通过服务端代理解决CORS）
- [x] 测评相关API用mock，后续对接后端

## 交付文档
- [x] 输出后端API需求文档给后端工程师

## 对接更新后的API完善前端
- [x] 查看更新后的API文档，记录新增8个测评接口
- [x] 对接新增API到前端，替换模拟数据（start/evaluate/upload-audio/transcribe/tts/terminate/history/result）
- [x] 完善前端交互体验（录音→上传→ASR→评估→TTS完整链路）
- [x] 全流程测试验证（未登录正确返回AUTH_EXPIRED，登录后可正常测评）

## Bug修复
- [x] 排查登录接口返回400错误（字段映射修正）
- [x] 修复测评初始化失败问题（字段映射全面修正）

## 登录改为手机号+短信验证码
- [x] 检查后端是否有短信验证码接口（send-sms-code + sms-login）
- [x] 重写登录页为手机号+短信验证码模式（去掉图形验证码和密码）
- [x] 修复token传递问题（增强AUTH_EXPIRED全局处理+并发刷新保护）
- [x] 验证完整流程（vitest测试10个用例全部通过）

## UI改造 - 新LOGO+蓝绿色系+透明风格
- [x] 上传途正英语新LOGO到CDN（含透明背景版本）
- [x] 根据LOGO色系(蓝#1B3F91 + 绿#83BA12)调整全局CSS变量
- [x] 将各页面背景改为透明/半透明毛玻璃风格
- [x] 更新Home首页使用新LOGO和新配色
- [x] 更新Login登录页使用新LOGO和新配色
- [x] 更新Rules规则页使用新配色
- [x] 更新Test测评页使用新配色
- [x] 更新Result结果页使用新配色
- [x] 更新History历史页使用新配色
- [x] 验证整体UI效果

## 开发模式旁路登录
- [x] 在Login页面添加开发环境跳过短信验证的旁路入口
- [x] 旁路登录使用mock用户数据，仅在开发环境生效
- [x] 生产环境自动隐藏旁路入口（基于import.meta.env.DEV判断）

## Bug修复 - 开发模式旁路登录被踢回
- [x] 修复mock token触发AUTH_EXPIRED自动跳转登录页的问题
- [x] 开发模式下API 401错误不触发自动跳转

## 移除开发模式旁路登录
- [x] 移除Login页面的旁路登录按钮和mock用户数据
- [x] 移除AuthContext中的mock token判断逻辑

## Bug修复 - 测评初始化失败
- [x] 排查Test页面测评初始化失败原因（字段映射不匹配）
- [x] 修复refresh-token 401循环错误
- [x] 修复sms-login 400 Bad Request错误（字段映射全面修正）

## Bug修复 - 录音无法结束 + upload-audio 500
- [x] 修复移动端录音按钮松开后无法停止录音的问题（用MediaRecorder.state替代React状态判断）
- [x] 修复upload-audio接口返回500错误（代理层改为raw body直接透传multipart/form-data）

## Bug修复 - upload-audio 500 (Storage proxy credentials missing)
- [x] 排查processRecording中是否误用了Manus存储服务（确认代理层正常转发）
- [x] 确保录音上传走途正后端upload-audio接口而非Manus S3（curl测试确认代理正常）

## 新增文字输入模式
- [x] 在Test页面底部添加文字输入框和发送按钮
- [x] 实现文字输入直接提交评估（跳过录音上传和ASR转写，直接发送transcription字段）
- [x] 保留录音按钮，用户可以选择语音或文字输入（麦克风图标切换）
- [x] 测试文字输入完整测评流程（vitest 10个用例全通过）

## 口语训练营群二维码功能
- [x] 设计数据库表存储各等级对应的群二维码（level + qrcode_url）
- [x] 后端API：管理员CRUD群二维码配置
- [x] 后端API：前端根据等级获取对应群二维码
- [x] 后台管理页面：管理员上传/编辑各等级群二维码
- [x] 前端Result页面：点击"加入X级口语营"弹出对应等级群二维码弹窗
- [x] 编写vitest测试用例（24个测试全部通过）

## 客户演示版本（Mock模式）
- [x] Test页面改为纯mock模式：6道预设题目，不依赖任何后端API
- [x] AI考官语音条：AI题目用浏览器TTS朗读，显示为语音条样式
- [x] 用户回答语音条：用户录音/文字输入后显示为语音条样式
- [x] 每道题之间显示出题原则提示（自适应出题算法说明）
- [x] 测评结果页mock完整数据（等级、分数、建议等）
- [x] 群二维码演示版本：结果页直接展示示例群二维码
- [x] 确保全流程不依赖后端，演示不会出错

## 语音交互体验优化
- [x] 输入框和按住说话按钮固定在屏幕底部，不随聊天记录滚动
- [x] 参考微信语音按住说话效果：全屏录音遮罩、上滑取消发送、波纹动画
- [x] 聊天记录区域独立滚动，新消息自动滚到底部
- [x] 修复：桌面浏览器点击按住说话按钮时mouseLeave误触发取消录音
