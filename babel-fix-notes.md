# @babel/runtime 问题解决方案

## 根因
project.config.json 中 `enhance: true` 和 `es6: true` 启用了增强编译。
增强编译会将ES6+语法转为ES5，但需要 `@babel/runtime` 提供helper函数。
项目没有安装 `@babel/runtime`，所以所有需要helper的语法都会报错。

## 触发toPropertyKey的语法
- 计算属性名（computed property keys）：`{ [variable]: value }`
- 模板字符串作为对象key：`{ [`string${var}`]: value }`

## 解决方案选择
### 方案A：安装@babel/runtime（推荐）
在miniprogram目录下：
```
npm install @babel/runtime
```
然后在微信开发者工具中"构建npm"。
这样所有ES6+语法都能正常使用。

### 方案B：关闭enhance
在project.config.json中设置 `"enhance": false`
但这会影响其他ES6+特性的编译。

### 方案C：手动替换所有ES6+语法为ES5
工作量大，容易遗漏，不推荐。

## 结论
方案A最佳。安装@babel/runtime是微信小程序增强编译的标准做法。
