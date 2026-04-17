# 自我介绍分析400错误分析

## 错误现象
POST https://super.tuzheng.cn/api/v1/test/self-intro-estimate 返回 400
错误信息："会话已结束"

## 分析
1. initTest() 调用 startTest() 创建新会话，获得 sessionId
2. AI智能模式下进入 selfIntro 阶段
3. 用户录音后调用 selfIntroEstimate(sessionId, audioUrl)
4. 后端返回400"会话已结束"

## 可能原因
1. 后端会话有超时机制，用户录音时间过长导致会话过期
2. 后端在startTest时创建了会话，但selfIntroEstimate需要的会话状态不匹配
3. 后端可能需要先调用某个接口确认进入自我介绍阶段
4. 前端可能在录音过程中触发了其他请求导致会话被终止

## 从日志看
- 第一次录音5秒，POST self-intro-estimate 返回400
- 第二次录音3秒，POST self-intro-estimate 返回400
- 跳过自我介绍 POST skip-intro 也返回400"会话已结束"
- 说明会话在startTest之后就已经被标记为结束了

## 结论
这是后端问题。startTest返回的会话可能在某个环节被提前终止。
前端代码逻辑正确：startTest → selfIntroEstimate/skipIntro 使用同一个sessionId。
需要后端排查为什么会话被提前标记为结束。
