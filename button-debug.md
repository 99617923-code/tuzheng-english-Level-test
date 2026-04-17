# 按钮问题分析

绿色按钮右边的灰色块可能是 bottom-bar 的背景渐变 `rgba(240,244,248,0.95)` 在按钮右侧透出。
也可能是 wechat-record-btn 的 width:100% 在 flex 容器中没有完全撑满。

action-area 设置了 align-items: center，这可能导致子元素不会自动撑满宽度。
需要给 wechat-record-btn 添加 align-self: stretch 或确保宽度为100%。
