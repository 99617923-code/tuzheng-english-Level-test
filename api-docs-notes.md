# 途正教育 API 文档完整笔记

## 基本信息
- 基础URL: https://super.tuzheng.cn
- 认证方式: Bearer Token (biz_token)
- Token有效期: 30分钟，过期后用refresh_token刷新
- 所有接口需携带 X-App-Key 请求头

## 接口详情

### 1. GET /api/v1/auth/captcha - 获取图形验证码
- 无需认证
- 返回SVG格式图形验证码，5分钟有效，一次性消费
- 响应: { code: 200, data: { captchaId: "abc123", svg: "<svg>...</svg>" } }

### 2. POST /api/v1/auth/login - 用户登录
- 无需认证
- 请求参数:
  - phone (string, 必填) - 手机号
  - password (string, 必填) - 密码（至少6位）
  - captchaId (string, 可选) - 验证码ID
  - captchaCode (string, 可选) - 验证码
  - deviceInfo (string, 可选) - 设备信息
- 响应: { code: 200, data: { user_info: { user_id, nickname, avatar }, biz_token, refresh_token, im_auth: { app_key, accid, im_token } } }

### 3. POST /api/v1/auth/register - 用户注册
- 无需认证
- 请求参数:
  - phone (string, 必填) - 手机号
  - password (string, 必填) - 密码（至少6位）
  - nickname (string, 可选) - 昵称
  - role (string, 可选) - 角色：student/teacher/parent
- 响应: { code: 200, data: { user_id: "10002" } }

### 4. POST /api/v1/auth/refresh-token - 刷新Token
- 无需认证
- 请求参数: refresh_token (string, 必填)
- 响应: { code: 200, data: { biz_token, refresh_token, im_auth } }
- 旧refresh_token失效（轮换机制）

### 5. POST /api/v1/auth/logout - 退出登录
- （详情未展开，应需Bearer Token）

### 6. GET /api/v1/auth/me - 获取当前用户信息
- 需Bearer Token认证
- 响应: { code: 200, data: { user_info: { user_id, nickname, avatar, phone, role, status }, im_auth: { app_key, accid, im_token } } }

### 7. PUT /api/v1/user/profile - 更新用户资料
- 需Bearer Token认证
- （详情未展开）

## 关键发现
1. 目前API只有认证和用户管理，**没有测评相关的API**
2. 测评逻辑（AI对话、语音识别、评分）需要前端模拟，后续由客户后端补充
3. 认证体系完整：captcha → login → biz_token + refresh_token
4. 需要 X-App-Key 请求头（需要向客户确认具体值）
