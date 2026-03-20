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
- [ ] 排查登录接口返回400错误
- [ ] 修复测评初始化失败问题

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
