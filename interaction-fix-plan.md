# 交互优化方案

## 需求1：重新录音交互优化
**现状**：用户在confirm阶段点击"重新录音"→ 回到answering阶段（只有按住说话按钮）
**问题**：用户在confirm阶段点击语音条重听后，播放完回到confirm阶段，用户需要点击"重新录音"再点击"按住说话"，多了一步。
**优化**：用户点击"重新录音"后，应该自动播放题目音频，播放完后进入answering阶段（按住说话）。
**修改**：handleConfirmRerecord() 中不直接设phase='answering'，而是先播放题目音频，播放完后自动进入answering。

## 需求2：跳过此题/结束测评按钮左右并排
**现状**：两个按钮上下排列
**优化**：改为同一行左右排列，一个靠左一个靠右
**修改**：wxml中skip-row改为flex-direction:row + justify-content:space-between
