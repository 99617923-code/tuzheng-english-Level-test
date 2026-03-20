# 途正教育 API 文档 v1.2.0

## 认证机制
- 双层认证：X-App-Key + Bearer Token
- X-App-Key: tzk_xxxxxxxx（每次请求必带）
- Bearer Token: 通过登录接口获取，有效期30分钟

## 接口列表（共12个端点：2 GET, 8 POST, 2 PUT）

### 认证 (5个)
1. GET /api/v1/auth/captcha - 获取图形验证码
2. POST /api/v1/auth/login - 用户登录
3. POST /api/v1/auth/register - 用户注册
4. POST /api/v1/auth/refresh-token - 刷新令牌
5. POST /api/v1/auth/logout - 退出登录

### 用户 (2个)
6. GET /api/v1/auth/me - 获取当前用户信息
7. PUT /api/v1/user/profile - 更新用户资料

### 签名验证 (1个)
8. POST /api/v1/auth/login - 用户登录（含签名验证）

### 设备 (4个)
9. POST /api/v1/device/register - 注册/更新设备
10. POST /api/v1/device/heartbeat - 设备心跳
11. PUT /api/v1/device/push-token - 更新推送Token
12. POST /api/v1/device/offline - 设备下线

## 待查看详情
- 签名验证 tab
- 安全规范 tab
- 错误码 tab
- 每个接口的请求/响应详情
