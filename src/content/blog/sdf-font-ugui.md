---
title: "SDF 字体渲染在 Unity UGUI 中的落地实践"
description: "从 SDF 原理出发，记录一次为项目替换默认字体方案的完整过程。"
pubDate: 2024-12-05
tags: ["UI", "Shader"]
category: shader
icon: "𝕊"
---

## 为什么用 SDF 字体

UGUI 自带的 Dynamic Font 在缩放时会糊，多语言字体集换皮也很麻烦。SDF (Signed Distance Field) 字体的好处：

- 任意缩放保持锐利
- 支持描边、阴影、外发光等效果
- 一张贴图存储几千个字符

## 工作原理简述

每个像素存储的不是颜色，而是"到字体边缘的有符号距离"。在 shader 里通过比较距离值和阈值来决定该像素属于字体内部还是外部。

```hlsl
half alpha = smoothstep(0.5 - smoothing, 0.5 + smoothing, distance);
```

## TextMeshPro 是首选

Unity 的 TMP 已经把这套都做好了。但要注意：

1. 中文字体要自己生成 SDF 图集，常用字 3000 个起步
2. 图集分辨率影响显示质量，1024x1024 通常够用
3. Padding 至少 5px，太小会出现描边断裂

## 自定义 Shader 加效果

TMP 默认 shader 不支持太多自定义。我们做了一个支持渐变 + 描边的版本：

```hlsl
// 主体颜色渐变
half3 mainColor = lerp(_TopColor, _BottomColor, IN.uv.y);

// 描边
half outlineAlpha = smoothstep(0.5 - _OutlineWidth - smoothing,
                                0.5 - _OutlineWidth + smoothing,
                                distance);
half3 finalColor = lerp(_OutlineColor, mainColor, mainAlpha);
```

## 多语言适配的坑

俄语和阿拉伯语字符比中文多很多变体（连字、上下文相关字形），Padding 要更大。我们最后给阿拉伯语单独配了一张图集。

> 字符表整理建议用 `freetype-py` 脚本扫游戏所有 LocalizationKey，自动收集需要的字符。

## 结果

包体增加约 8MB（中英俄三语），运行时内存增加 24MB。但视觉一致性和缩放质量提升明显，从美术到 QA 都没意见。
