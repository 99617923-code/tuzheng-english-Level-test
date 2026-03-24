# 途正英语AI分级测评 - 微信小程序

## 项目概述

途正英语AI分级测评小程序，基于微信原生开发，完全复刻H5版本体验。

## 技术栈

- 微信小程序原生开发
- 微信同声传译插件（实时语音识别）
- 后端API：`https://tzapp-admin.figo.cn`

## 目录结构

```
miniprogram/
├── app.js                  # 全局入口
├── app.json                # 全局配置
├── app.wxss                # 全局样式（品牌色、毛玻璃、动画）
├── project.config.json     # 项目配置
├── sitemap.json            # 站点地图
├── assets/
│   └── icons/              # SVG图标
├── utils/
│   ├── request.js          # 网络请求封装（Token管理、自动刷新）
│   ├── api.js              # API接口封装
│   └── util.js             # 工具函数
└── pages/
    ├── home/               # 欢迎页（品牌展示+视频+入口）
    ├── login/              # 登录页（手机号+短信验证码）
    ├── rules/              # 测评说明页（流程+权限）
    ├── test/               # 测评主页面（核心交互）
    ├── result/             # 结果页（等级+得分+群二维码）
    └── history/            # 历史记录页
```

## 开发准备

1. 在 `project.config.json` 中填入小程序 AppID
2. 在微信公众平台添加同声传译插件（AppID: `wx069ba97219f66d99`）
3. 配置服务器域名白名单：`https://tzapp-admin.figo.cn`
4. 使用微信开发者工具打开 `miniprogram` 目录

## 页面说明

| 页面 | 路径 | 功能 |
|------|------|------|
| 欢迎页 | `/pages/home/home` | 品牌展示、示例视频、开始测评入口 |
| 登录页 | `/pages/login/login` | 手机号+短信验证码登录 |
| 测评说明 | `/pages/rules/rules` | 流程说明、录音权限授权 |
| 测评页 | `/pages/test/test` | 听题→录音→AI评分→下一题 |
| 结果页 | `/pages/result/result` | 等级展示、分项得分、群二维码 |
| 历史记录 | `/pages/history/history` | 测评记录列表 |

## 设计风格

- 品牌蓝：`#1B3F91`
- 品牌绿：`#83BA12`
- 毛玻璃卡片 + 渐变背景
- 自定义导航栏（全页面）
- Nunito 字体

## 后端API

所有接口对接 `https://tzapp-admin.figo.cn`，认证方式为 `Bearer Token + X-App-Key`。

详细接口文档见：`【内部】途正AI测评-后端开发技术文档.pdf`
