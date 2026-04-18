# Bug分析：第6题90%进度卡住 + 弹窗叠加

## 问题场景
1. 用户第3题故意做0分（跳过），第6题到达后还没做题
2. 后端skip-question在第6题返回finished（连续放弃规则触发）
3. 但question为null → 前端_autoNextQuestion走到"出题异常"弹窗

## 问题1：90%进度卡住
**根因**：submitAnswer中调用了_startAnalysisProgress()启动进度条，当evaluate 3次重试都失败后：
- 弹出"网络异常→重新提交/跳过此题"弹窗
- 但此时showAnalysisProgress仍为true，进度条卡在90%
- 用户点"重新提交"→ 再次调用submitAnswer → 又启动新的_startAnalysisProgress
- 如果再次失败 → 进度条和弹窗叠加，UI完全卡死

**修复**：
1. evaluate重试全部失败后，弹窗前先关闭进度条 `showAnalysisProgress: false`
2. 用户点"跳过此题"时也要关闭进度条
3. 用户点"重新提交"前先关闭旧进度条

## 问题2：弹窗叠加
**根因**：wx.showModal的"网络异常"弹窗和"出题异常"弹窗可能同时出现
- _showingModal互斥锁在某些路径下被重置为false后，新弹窗又弹出
- 特别是"重新提交"后再次失败的场景

**修复**：
1. 所有错误恢复路径都确保关闭showAnalysisProgress
2. 增加进度条超时保护（30秒后自动关闭）
3. _autoNextQuestion中question为null时，先关闭进度条再弹窗

## 需要修改的位置
1. submitAnswer中evaluate失败弹窗前（约1549行）→ 关闭进度条
2. submitAnswer中catch块（约1653行）→ 关闭进度条
3. _autoNextQuestion中question为null弹窗前（约1868行）→ 关闭进度条
4. _startAnalysisProgress中 → 增加30秒超时保护
5. handleSkip中跳过失败时 → 确保进度条关闭
