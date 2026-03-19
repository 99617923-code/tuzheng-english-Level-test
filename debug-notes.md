# Debug Notes - @theme inline问题

## 关键发现
Tailwind CSS 4文档说明：@theme inline用于引用其他CSS变量的场景。
但问题是：我们的index.css中使用了 `@theme inline { ... }` 来定义自定义颜色变量。

在Tailwind CSS 4中，`@theme inline` 的变量值会被解析为引用（不会生成CSS变量声明），
而 `@theme` 则会生成实际的CSS变量。

但这不影响gray-800等默认颜色，因为它们来自tailwindcss的默认theme.css。

## 实际问题
截图中文字不可见，但HTML结构存在（markdown提取到了文字内容）。
这意味着文字颜色可能是透明的或与背景色相同。

## 可能的真正原因
1. index.css中的 `--color-foreground: var(--foreground)` 和 `:root { --foreground: oklch(0.25 0.02 50) }` 
   这个foreground颜色是深色的，应该可见
2. 但 `text-gray-800` 使用的是 Tailwind默认的 `--color-gray-800`
3. 问题可能是 `@theme inline` 中定义了 `--color-foreground` 等，但没有定义 `--color-gray-*`
4. 而 `@theme inline` 可能会清除默认的color命名空间！

## 验证方案
直接用 style={{ color: '#1f2937' }} 测试，或者在@theme中添加gray颜色
