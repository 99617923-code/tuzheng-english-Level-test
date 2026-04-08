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
- [x] 查看 https://super.tuzheng.cn/api-docs 了解可用接口
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
- [x] 修复：桌面端和手机端松开后录音不停止（改用全局window事件监听）
- [x] 修复：0级口语营二维码不显示（已确认图片URL有效，弹窗正常显示）

## 客户演示反馈优化
- [x] 去掉测评过程中的英文文字显示（AI题目和用户回答都只显示语音条）
- [x] 去掉文字输入模式（只保留语音录音，移除键盘切换按钮）
- [x] 去掉AI反馈（答对答错提示），用户回答后直接进入下一题
- [x] 去掉出题策略提示卡片（绿色卡片）
- [x] 出题逻辑改为从低到高（所有用户从零级开始逐步升级）
- [x] "加入口语营"按钮上移到结果卡片内+改红色醒目
- [ ] 简化规则页，去掉功能介绍文字（待客户确认）
- [x] 预留测评介绍视频位置（视频由客户后续提供）
- [x] 预留真人音频替换接口（audioUrl字段，后续替换为悠寒录制的音频）

## 页面优化（第二轮反馈）
- [x] 首页：去掉三个卡片说明，换成测评示例视频（点击查看范例）
- [x] 规则页：去掉顶部大图，简化内容让手机一屏看完
- [x] 规则页：题目数量改为10-15道
- [x] 测评页：修复多余的AI loading语音条
- [x] 测评页：用淡虚线卡片区分每道题的问与答，每题有“第 N 题”标签
- [x] 首页：去掉AI考官头像，让界面更简洁

## 小程序原生适配（全面调整）
- [x] 全局：app.js适配状态栏+胶囊按钮高度，全局CSS变量
- [x] 首页home：Logo不被胶囊遮挡，去掉H5式登录按钮，适配小程序原生布局
- [x] 测评说明页rules：录音授权改用wx.authorize原生API
- [x] 登录页login：改为小程序原生登录流程（wx.login + 手机号快捷登录）
- [x] 测评页test：适配小程序原生导航和布局
- [x] 结果页result：适配小程序原生布局
- [x] 历史页history：适配小程序原生布局

## 小程序测评记录页排版优化
- [x] 优化history页面卡片排版：信息层次更清晰、日期不截断、状态标签更醒目

## 小程序升级 - 对接真实后端API（去掉Mock模式）
- [x] api.js：确认evaluate接口参数兼容（增加recognizedText和duration字段映射）
- [x] test.js：测评页对接真实API（去掉mock逻辑，走真实startTest/evaluateAnswer/uploadAudio）
- [x] test.js：evaluate接口增加recognizedText参数（同声传译识别文字传给后端辅助评分）
- [x] test.js：evaluate接口增加duration参数（录音时长传给后端）
- [x] test.js：录音上传+evaluate一体化流程（上传音频→拿audioUrl→传给evaluate）
- [x] result.js：结果页对接真实getQrcodeByLevel接口（去掉mock二维码）
- [x] result.js：群二维码level参数适配后端格式（数字0-3 vs 字符串starter/elementary等）
- [x] login.js：确认微信手机号登录接口参数格式与后端一致
- [x] home.js：确认首页登录状态检查逻辑正确
- [x] history.js：确认历史记录接口字段映射正确
- [x] 全面检查所有页面去掉mock/模拟数据残留
- [x] 保存checkpoint并同步到GitHub

## Bug修复 - 控制台报错（scope.record权限 + timeout）
- [x] 修复app.json中scope.record权限配置格式（需加requiredPrivateInfos声明）
- [x] 排查首页timeout错误原因（网络请求超时）
- [x] 优化request.js超时处理和错误提示

## 新增功能 - 小程序分享
- [x] 首页(home)添加onShareAppMessage分享给好友
- [x] 首页(home)添加onShareTimeline分享到朋友圈
- [x] 结果页(result)添加分享功能（分享测评结果 + 朋友圈）
- [x] 测评说明页(rules)添加分享功能

## 优化 - 分享封面图和标题
- [x] 制作分享封面图（首页首屏效果，5:4比例500x400px）
- [x] 上传封面图到CDN- [x] 修改分享标题为“途正英语AI智能分级测评，3分钟测出你的英语水平”"
- [x] 更新所有页面的onShareAppMessage和onShareTimeline

## 小程序升级 - 自适应分级测评引擎v2对接
- [x] api.js：新增/更新start、evaluate、getResult接口适配v2格式
- [x] test.js：完整重写，实现自适应升级循环（start→evaluate循环→finished跳结果页）
- [x] test.wxml：适配v2数据字段（majorLevelDisplay、subLevelDisplay、通过/未通过标签、升级提示）
- [x] test.wxss：新增升级提示toast样式、通过/未通过标签样式
- [x] result.js：完整重写，对接v2结果格式（优劣势、最高通过小级、分项得分）
- [x] result.wxml：新增优势/劣势列表、最高通过小级展示
- [x] result.wxss：新增优劣势列表样式、最高通过小级样式
- [x] history.js：适配v2字段（majorLevel、highestSubLevel、overallScore等）

## Bug修复 - 测评功能无法使用
- [x] 修复test.js start接口调用报"服务器繁忙"（增强错误处理+自动重试+详细日志）
- [x] 修复录音器启动失败（录音前检查scope.record权限+引导用户去设置+try-catch包裹）
- [x] 修复页面跳转重复（增加_isNavigating防重复跳转标志+navigateBack失败降级reLaunch）
- [x] 修复scope.record权限配置警告（优化permission描述文案）
- [x] request.js增强token刷新竞态处理（订阅者队列模式替代单Promise）
- [x] request.js增加详细日志输出（请求/响应/错误全链路日志）
- [x] request.js增加HTTP 403处理和upload状态码检查
- [x] test.js增加防重复提交保护（_isSubmitting标志）
- [x] test.js增加初始化自动重试（最多2次）+重试耗尽弹窗确认
- [x] test.wxml修复按钮文字引用错误（改用data中的nextButtonText）
- [x] app.js增加全局onError和onUnhandledRejection处理
- [x] evaluate接口超时时间从30s增加到45s（AI评估耗时较长）

## 结果页功能增强 + 测评中断恢复
- [x] 结果页增加“重新测评”按钮（绿色渐变按钮+确认弹窗+清除缓存后跳转规则页）
- [x] 结果页增加“分享结果”按钮（open-type=share调用wx.shareAppMessage+朋友圈分享）
- [x] 结果页按钮样式重新设计（双主按钮并排+分享按钮+返回首页链接）
- [x] 测评中断恢复：test.js在initTest和handleNext后自动保存状态到Storage
- [x] 测评中断恢复：home.js onShow检测未完成测评+弹窗提示+banner显示
- [x] 测评中断恢复：用户选择继续时跳转test?resume=1恢复，选择放弃时清除缓存
- [x] 测评正常结束时自动清除缓存，用户主动退出时保留缓存（30分钟过期）

## 测评记录页+测评报告页+测评说明页 UI重新设计
- [x] 测评记录页：重新设计统计头部（蓝色渐变背景+白色数据）
- [x] 测评记录页：优化记录卡片（区分已完成/未完成、清晰信息层级、去除冗余标签）
- [x] 测评记录页：增加空状态设计和整体间距优化
- [x] 测评报告页：重新设计等级展示区（大号等级徽章+环形分数+conic-gradient）
- [x] 测评报告页：优化分项得分展示（进度条+颜色区分）
- [x] 测评报告页：优化底部按钮区域和整体视觉层次
- [x] 测评报告页：增加section图标+优势/待提升列表+学习建议卡片
- [x] 测评说明页：根据最新测评流程更新内容（5步流程+新注意事项）
- [x] 补充缺失的SVG图标（zap/trending-up/headphones/check-circle/bar-chart）

## 测评说明页流程重写 + 记录页下拉刷新 + 报告页保存图片
- [x] 测评说明页：重写流程描述，突出自适应循环机制（听题→准备→录音→AI评估→通过升级循环→生成报告）
- [x] 测评说明页：增加自适应循环流程图（时间线设计+循环箭头提示）
- [x] 测评记录页：增加下拉刷新功能（enablePullDownRefresh+onPullDownRefresh）
- [x] 测评报告页：增加“保存测评海报”功能（canvas2d绘制精美海报+保存到相册+权限引导）

## 测评说明页交互优化
- [x] 进入页面自动弹出录音授权（onLoad时自动调用wx.authorize，已拒绝则延迟引导去设置）
- [x] 开始测评按钮和授权状态置顶显示（hero-section区域）
- [x] 测评说明内容改为折叠面板（测评流程+注意事项默认收起，点击展开）
- [x] 整体界面更简洁干净（授权状态条+大按钮+折叠说明）

## 用户体验极致优化：一步直达测评
- [x] 首页“开始测评”按钮直接跳转测评页（跳过说明页）
- [x] 首页在点击开始前自动完成录音授权（onShow时自动wx.authorize）
- [x] 首页保留测评示例视频
- [x] 测评页增加AI外教引导气泡（3步引导：欢迎→流程说明→开始）
- [x] 测评页顶部增加简短提示（安静环境+英语回答）
- [x] 处理说明页路由引用（result/history跳转改为直接进入test）
- [x] 开始测评按钮增加脉冲微动画（pulse-ring CSS动画）

## Bug修复 - 测评核心流程（音频+录音+评分）
- [x] 修复AI外教语音无法播放（听不到音频）→ 增加TTS降级+自动播放
- [x] 修复录音录不到音问题（点击录音无效）→ 改为tap切换模式
- [x] 修复总是0分说没答案问题（evaluate接口返回异常）→ 增加Whisper降级转写

## 测评页UI和交互全面修复
- [x] 话筒图标改为白色（录音按钮中间的mic图标）
- [x] 删除"点击播放题目"按钮（listening阶段的手动播放按钮）
- [x] 音频自动播放（进入题目后自动播放外教语音，无需手动点击）
- [x] 隐藏英文文本内容（听力对话测试，不显示questionText）
- [x] 录音改为tap切换模式（点击开始录音/点击结束录音，替代touchstart/touchend）
- [x] 增加后端Whisper转写降级（同声传译插件失败时用后端转写）
- [x] 增加TTS降级方案（audioUrl为空时用后端TTS生成语音）

## 重测+确认最终评级机制
- [x] 结果页增加"重新测评"按钮（用户可多次重测直到满意）
- [x] 结果页增加"确认最终评级"按钮（用户确认后才显示完整报告和群二维码）
- [x] 确认前：只显示等级和分数概览，不显示群二维码
- [x] 确认后：显示完整测评报告+对应级别群二维码，不可更改
- [x] 确认操作需二次确认弹窗（提示确认后不可更改）
- [x] 题号从第1题开始（不应一来就第2题）
- [x] 最少答10题才定级（前10题内答得不好也继续测试，答得好一直升级，至少10题后才定级）

## Bug修复（第二轮）- 测评核心流程仍不工作
- [x] 深度排查：音频仍不自动播放→ 每次重建audioContext+超时保护
- [x] 深度排查：录音仍无法录制→ 修复onEnded不触发导致卡在listening
- [x] 深度排查：evaluate仍返回0分→ 即使上传失败也提交evaluate
- [x] 修复：第2题开始卡在"正在播放题目"→ 每次重建audioContext
- [x] 修复：录音按钮不出现→ 超时保护强制进入answering
- [x] 修复：题号偏移→ 前端自己维护计数不依赖后端

## Bug修复（第三轮）- 前端兜底方案优化
- [x] 检查app.json录音权限scope.record声明格式→ 格式正确，是开发者工具版本警告
- [x] TTS三级降级：WechatSI插件TTS→后端TTS→显示题目文字让用户看着回答
- [x] 音频播放失败时自动进入TTS降级流程（三级降级确保用户能听到或看到题目）
- [x] timeout保护已有（15秒强制进入answering）

## Bug修复（第四轮）- 网络异常重试机制 + LLM评分题目上下文修复
- [x] evaluate网络失败时自动重试3次（每次间隔1.5秒，避免网络中断导致题目错位）
- [x] 重试都失败后弹窗提示用户"重新提交"或"跳过此题"（不静默跳过）
- [x] evaluate接口增加questionText参数，确保LLM评分使用正确的题目上下文（修复"回答父亲年龄"却被评为"早餐"的bug）
- [x] api.js中evaluateAnswer同时传递questionText和question_text两种格式（兼容后端命名）

## Bug修复（第五轮）- evaluate返回0分"No answer provided"
- [x] 排查Whisper转写返回空文本的原因（增加完整返回值日志+多字段名尝试）
- [x] 修复recognizedText为空时evaluate仍返回0分的问题（空字符串也始终传递给后端）
- [x] 后端需配合：当recognizedText为空但audioUrl存在时，后端应自己用audioUrl转写再评分

## Bug修复（第六轮）- 第一道题播放时Error: timeout
- [ ] 排查playQuestionAudio中的超时保护逻辑，定位timeout错误来源
- [ ] 修复timeout错误（音频已正常播放但仍报timeout）

## Bug修复（第六轮）- Token过期导致upload失败→evaluate 0分
- [x] upload-audio遇到30时，token刷新后自动重试上传（不能直接跳过）
- [x] request.js中uploadFile函数增加401检测+token刷新+自动重试机制（与request函数保持一致）

## 优化 - Token提前检查（第六轮补充）
- [x] request.js增加ensureTokenValid函数（本地JWT解码检查过期时间，剩余<2分钟时主动刷新）
- [x] test.js submitAnswer开始前调用ensureTokenValid（避免上传/评估过程中遇到401）

## 报告页布局优化（第七轮）
- [x] 报告页“确认最终评级”和“重新测评”按钮放在首屏（hero-card下方）
- [x] 评价建议部分改为可折叠（“查看详细报告”折叠卡片）
- [x] 修复报告页右侧内容贴边问题（scroll-area增加padding 32rpx）

## 升级逻辑优化（第七轮）
- [ ] 分析当前升级判定逻辑
- [ ] 优化：同一小级至少出4道题，平均分低于60才判定不通过（而非连续2道没答好就停止）

## 前端速度极致优化（第七轮）
- [ ] 录音结束后立即开始上传（不等用户确认）
- [ ] 上传和Whisper转写并行执行（不串行等待）
- [ ] evaluate提交时尽可能带上已有的recognizedText，减少后端重复转写
- [ ] 编写后端配合说明文档

## Token定时器优化（第七轮补充）
- [x] 登录时读取expires_in字段，启动定时器在过期前3分钟自动刷新Token
- [x] 覆盖所有接口（全局定时刷新，不仅仅是submitAnswer）
- [x] 退出登录时停止定时器

## 前端速度优化调整（第七轮补充）
- [x] 跳过单独的transcribe调用，直接把audioUrl传给evaluate（后端内部转写+评分）
- [x] 录音结束后立即开始上传（不等UI动画）

## 后端配合文档（第七轮）
- [x] 编写完整后端配合文档：升级逻辑优化 + evaluate兜底转写 + 速度优化方案 + Token有效期

## UI修复（第七轮 - 真机截图反馈）
- [x] 报告页：顶部提示语增加上方间距，避免被导航栏遮挡（scroll-area padding增大）
- [x] 报告页：分项得分右侧数字增加padding，不贴边（score-val min-width+text-align right）
- [x] 报告页：content-card padding增加制36rpx+overflow:hidden
- [x] 测评页：AI对话卡片增加顶部间距（main-area padding-top从+20改为+40）
- [x] 测评页：语音播放波形铺满整个播音条（bar数量30→60，flex:1+justify-content:space-between）
- [x] 测评页：优化中间空白布局（padding-top增加）

## UI修复（第八轮）
- [x] 测评页：级别/题号从导航栏移出到内容区顶部（level-info-bar），导航栏只保留返回+计时器

## 适配后端新算法（第九轮）
- [x] 处理evaluate返回的levelUp和levelUpMessage字段
- [x] 升级时触发恭喜动画/提示（展示levelUpMessage）
- [x] 检查前端保底逻辑（MIN_QUESTIONS_BEFORE_FINISH从10降到6）与后端新算法兼容性
- [x] 确保前端正确处理2-4题动态出题逻辑（前端无需额外处理，后端控制出题节奏）

## UI修复（第十轮）
- [x] 将计时器从右上角导航栏移到级别信息条（level-info-bar）右侧，与"第*题·G*"同行显示

## Bug修复（第十一轮）
- [x] api.js: startTest支持forceNew参数
- [x] result.js: 重新测评时传forceNew:true
- [x] test.js: 前端保底forceContinue时传forceNew:true
- [x] test.js: 恢复失败重新开始时传forceNew:true
- [x] home.js: “重新开始”选项传forceNew:true，“继续测评”保持resume=1

## 性能优化（第十二轮）
- [ ] 分析evaluate返回后到下一题展示的延迟环节
- [ ] 优化前端处理流程，减少不必要的等待时间

## 适配后端preview状态（第十三轮）
- [x] result.js: 处理后端返回的status:"preview"状态，设置isPreview字段
- [x] result.wxml: 区分“测评报告（实时预览）”和“测评报告（预览）”标题
- [x] 预览状态下确认按钮置灰+提示“测评未完成，完成后可确认”
- [x] 预览状态下显示“测评尚未完成”警告提示条（橙色风格）

## Bug修复 - SVG图标缺失（第十四轮）
- [x] 修复chevron-down.svg加载500错误（文件缺失，已创建）

## UI修复 - 状态栏文字颜色（第十五轮）
- [x] 修复所有页面状态栏文字白色看不清的问题（app.json+6个页面JSON全部设置navigationBarTextStyle:black）

## Bug修复 - 第20题后崩溃稳定性修复（第十六轮）
- [x] 前端：录音按钮加防抖锁（_isStartingRecord），防止连点导致多次启动录音
- [x] 前端：submitAnswer/handleSkip/handleNext中对currentQuestion做null安全检查
- [x] 前端：弹窗互斥锁（_showingModal），防止多个wx.showModal叠加导致UI卡死
- [x] 前端：全局异常恢复方法（_resetToSafeState），状态混乱时提供用户可操作的恢复选项
- [x] 前端：跳过失败恢复（_handleSkipFailure），evaluate失败后提供"重试跳过"/"继续录音"选项
- [x] 前端：handleNext中后端返回question:null时安全处理（提示用户选择查看结果或重试）
- [x] 前端：所有wx.showModal调用统一加弹窗互斥锁
- [x] 前端：cleanup方法中重置所有锁状态
- [ ] 反馈后端：evaluate返回status:"continue"但question:null的问题
- [ ] 反馈后端："sessionId和questionId不匹配"错误的触发条件

## 上架准备（第十七轮）
- [x] 首页去掉视频区域（后续录好视频再加回来）

## Bug修复 - 结果页问题（第十八轮）
- [x] 结果页弹出“录音失败，请重试”弹窗（添加页面卸载标志，离开test页后录音回调不再弹窗）
- [x] 用时显示0''（后端返回0时显示为'--'而非0''）

## 等级配置动态化（第十九轮）- [x] app.js: levelConfig的label更新为后端一致的描述（学前水平/小学水平/中学水平/雅思水平），删除写死的description和recommendation
- [x] result.js: levelLabel优先使用后端返回的majorLevelLabel，前端config做兆底
- [x] history.js: levelLabel优先使用后端返回的majorLevelLabel
- [x] test.js: MAJOR_LEVEL_NAMES更新为正确描述（学前水平/小学水平/中学水平/雅思水平）
- [x] api.js: evaluate和getTestResult增加majorLevelName、majorLevelLabel字段兼容
- [ ] 待后端补充：startTest和evaluate(continue)接口返回majorLevelName和majorLevelLabel字段后，test.js改为优先使用后端字段

## 域名替换（已完成）
- [x] request.js: BASE_URL 已替换为 https://super.tuzheng.cn
- [x] request.js: 注释中的后端地址已同步更新
- [x] api.js: 注释中的后端地址已同步更新
- [ ] 小程序后台: 服务器域名白名单添加 super.tuzheng.cn

## 第二十轮优化
- [x] API域名替换为 https://super.tuzheng.cn
- [x] 首页视频改为动态读取后台配置（无视频时不展示）
- [x] 外教头像换成帅气男外教卡通形象
- [x] 播放题目录音时暂停图标改为白色（pause.svg stroke改为white）
- [x] 群二维码前面图标改为白色（新建users-white.svg）
- [x] 全局排查黑图标+蓝底不协调问题（共修复12个图标，新增彩色SVG版本）

## Bug修复 - intro-video重复调用timeout（第二十一轮）
- [x] 修复onLoad和onShow重复调用_loadIntroVideo导致timeout（onLoad不再调用+防重复锁）

## 第二十二轮优化
- [x] 未完成测评弹窗增加关闭按钮（仅隐藏提示，不删除session）
- [x] feedback区域加“AI 分析”文字标题（不要图标）
- [x] 升级恭喜改为Duolingo风格全屏弹窗+烟花动画效果（全屏蒙层+烟花粒子+星星动画+弹跳卡片）

## 第二十三轮优化
- [x] 首页视频播放自动识别横竖屏（优先用后端宽高+bindloadedmetadata双重判断）

## 第二十四轮优化
- [x] 竖屏视频宽度改为80%，高度按 9:16 比例自适应
- [ ] 海报布局修复：圆圈与通过数间距太近
- [ ] 海报布局修复：底部"途正英语·AI智能分级测评"与能力评估文字重叠
- [ ] 海报和结果页按级别（0/1/2/3）展示不同色彩（级别越高越好看）

## 第二十五轮修复
- [x] 首页“发现未完成的测评”弹窗改为自定义弹窗（带X关闭按钮），替换wx.showModal原生弹窗

## 第二十六轮 - 对接"确认分级"后端接口
- [x] api.js: 新增confirmLevel接口（POST /api/v1/test/confirm-level）
- [x] api.js: 新增getUserLevelStatus接口（GET /api/v1/test/user-level-status）
- [x] result.js: 确认评级时调用confirmLevel后端接口（替代纯本地存储）
- [x] home.js: onShow时调用getUserLevelStatus，已确认分级则隐藏“开始测评”，展示已确认状态
- [x] home.wxml: 新增已确认分级状态的UI展示（级别+二维码入口）
- [x] test.js: 处理startTest返回403（已确认分级不允许再测评）的情况
- [x] history.js: 展示已确认分级标识

## 第二十七轮修复 - 接口返回码兼容
- [x] 修复getUserLevelStatus和confirmLevel接口返回码判断：兼容code=0和code=200

## 第二十八轮修复 - 首页已确认分级状态不生效
- [x] 修复home.js中getUserLevelStatus返回数据处理逻辑，确保confirmed状态正确识别（后端确认返回confirmed:false是因为未调用confirm-level接口）

## 第二十九轮 - UI微调
- [x] 首页“分级已确认”勾勾图标改为经典绿色

## 第三十轮 - 级别色彩优化
- [x] 修改levelConfig色彩：0级绿色、1级蓝色、2级紫色#8B5CF6、3级金色#F59E0B
- [x] 检查并更新所有文件中的硬编码旧颜色（rules/history/home/result/test/app.wxss等全量替换完成）

## 第三十一轮 - 对接二维码显示开关API
- [x] 查找后端二维码显示开关API接口（GET /api/v1/test/qrcode-display-setting）
- [x] api.js: 新增getQrcodeDisplaySetting接口调用方法
- [x] result.js: onLoad时调用_checkQrcodeSwitch，handleJoinGroup中检查开关，wxml中wx:if控制按钮显示
- [x] home.js: onShow时调用_checkQrcodeSwitch，handleViewConfirmedQr中检查开关，wxml中wx:if控制按钮显示
- [x] 开关关闭时：首页隐藏"查看班级群二维码"按钮，结果页隐藏"加入学习群"按钮，点击时toast提示"二维码功能暂未开放"

## 第三十二轮 - 海报布局修复 + 清理调试日志
- [x] 修复海报布局：分类圆圈与下方通过数数字间距太近
- [x] 修复海报布局：底部“途正英语.AI智能分级测评”与能力评估文字重叠
- [x] 清理所有调试日志console.log（已删除所有console.log，保留console.warn/error用于生产环境错误追踪）

## 第三十四轮 - 首页已确认用户隐藏测评示例视频
- [x] 首页home.wxml：用户确认级别后隐藏测评示例视频区域（增加!levelConfirmed条件）

## 第三十五轮 - API域名统一替换为super.tuzheng.cn
- [x] 查找所有引用tzapp-admin.figo.cn的文件并替换为super.tuzheng.cn
- [x] 检查request.js/api.js中的域名配置（已是super.tuzheng.cn）
- [x] 更新README.md、api-docs-notes.md、后端接口需求清单.md、client/src/lib/api.ts中的域名引用

## 第三十六轮 - 静音模式双保险方案
- [x] test.js: 页面onLoad时调用wx.setInnerAudioOption({ obeyMuteSwitch: false })强制忽略静音开关
- [x] test.js: 音频播放器创建时已设置obeyMuteSwitch: false（已有）
- [x] test.js/test.wxml/test.wxss: 进入测评页时显示音量提醒浮层（“请确保手机未静音”，4秒自动消失，可手动关闭）

## 第三十七轮 - 第1次测试会议修改（前端独立任务）
- [x] 前端任务4：首页文案修改（全项目统一清理“AI外教”→“外教”、“AI智能”→“智能”、去掉“3分钟”，加“口语”）
- [x] 前端任务1：去掉升级通关动画（test.js中升级逻辑注释掉，wxml中烟花弹窗UI移除）
- [x] 前端任务2：计时器改为每道题3分钟倒计时（startTimer重写为倒计时，时间到自动跳题，每题重置）
- [x] 前端任务3：录音改为“按住说话”模式（touchstart/touchend事件，按住录音松开停止）

## 第三十八轮 - 对接后端v0.1.7 API（前后端联调）
- [x] api.js: 新增getTeacherConfig接口调用方法
- [x] api.js: 新增getTestReport接口调用方法
- [x] api.js: 更新evaluate接口处理精简版响应（去掉逐题反馈字段）
- [x] api.js: 更新getUserLevelStatus接口处理新字段（levelName/gradeTier/gradeTierLabel等）
- [x] test.js: 去掉逐题AI反馈展示，答完直接进下一题
- [x] test.js: 对接teacher-config，动态获取外教头像和名字
- [x] test.wxml: 移除feedback反馈区域UI
- [x] result.js: 对接report接口获取测评报告详情（含逐题分析展示）
- [x] home.js: 更新user-level-status接口对接新字段
- [x] 全局清理"AI外教"/"AI分析"/"AI正在"等文案（替换为"外教"/"评分分析"/"正在"）

## 第三十九轮 - "途正口语X级"文字过长布局优化 + 播放按钮优化
- [x] result页面：等级徽章（hero-badge）宽度自适应，max-width:90%+字号缩小+文字截断
- [x] result页面："加入途正口语X级学习群"按钮字号缩小+内边距优化+文字截断
- [x] home页面：confirmed-level-pill添加max-width:85%+字号缩小+文字截断
- [x] history页面：level-badge-sm添加max-width:200rpx+字号缩小+文字截断
- [x] test页面：level-info-level字号缩小+flex自适应+文字截断，progress不缩
- [x] result页面：逐题分析音频播放按钮改为绿底白三角形图标（纯CSS实现，替换原来看不清的白色SVG）
- [ ] 海报绘制中等级名称文字宽度自适应（待后续处理）

## 第四十轮 - 测评页级别信息+录音交互全面优化
- [x] test.wxml: 级别信息条改为"途正口语X级"格式，去掉PRE1/学前水平
- [x] test.wxml: 录音按钮改为微信风格长条按钮（蓝底白字"按住 说话"）
- [x] test.wxml: 录音中全屏灰色遮罩+绿色录音波形动画+只显示"松开 发送"
- [x] test.wxss: 微信风格录音按钮样式+全屏遮罩样式
- [x] test.js: 完全改为纯长按录音模式（touchstart/touchend+pendingStop机制）
- [x] test.js: 录音最长1分钟，最后10秒倒计时显示，60秒自动提交
- [x] test.js: 快速点击防护（500ms最短按住时长+录音启动前松开自动取消）

## 第四十一轮 - 录音遮罩效果修复 + 音频重叠播放bug修复
- [x] 修复录音中全屏遮罩效果（移到页面最外层，fixed定位+z-index:999）
- [x] 录音中遮罩覆盖全屏，隐藏"跳过此题"等其他按钮
- [x] 修复退出再进来音频重叠播放bug（initTest/resumeTest开头destroyAudioContext+requestGeneration机制）
- [x] initTest时先停止所有正在播放的音频，再开始新测评
- [x] 添加requestGeneration请求代数机制，evaluate返回后检查代数不匹配则忽略旧回调
- [x] 按住说话时立即显示录音遮罩动画（touchstart时立即setData，不等onStart回调）
- [x] 所有异常路径（onStop/onError/权限拒绝/pendingStop）都清除录音遮罩状态

## 第四十二轮 - 极致速度优化（智能预判+异步精评+保守定级）
- [x] 后端配合文档：编写完整的后端改造技术文档（submit-lite接口规范+预判算法+异步评分+保守定级系数）
- [x] 前端api.js：新增submitLite接口 + 报告轮询接口
- [x] 首页预加载：用户登录后立即后台调用startTest预加载第一题数据，存入全局缓存
- [x] 首页预加载：测评页进入时优先读取缓存，无需等待网络请求
- [x] 测评页test.js：对接submit-lite接口，做题过程零等待
- [x] 测评页test.js：记录响应延迟（音频播放结束到开始录音的时间间隔）
- [x] 测评页test.js：去掉evaluating等待阶段，录音结束后立即出下一题
- [x] 结果页result.js：轮询等待后端异步评分完成
- [x] 结果页result.js：显示"正在生成报告"加载动画，评分完成后展示完整报告
