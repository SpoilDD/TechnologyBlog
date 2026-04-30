---
title: "URP 自定义 RenderPass 实现屏幕空间描边的三种方案对比"
description: "从 Sobel、Roberts Cross 到基于法线深度的混合方案，深入比较三种屏幕空间描边的实现细节、性能开销与视觉表现。"
pubDate: 2025-04-20
tags: ["URP", "Shader", "HLSL"]
category: shader
featured: true
icon: "◈"
---

## 前言

在做卡通渲染项目时，描边几乎是绕不开的一道坎。本文比较了我在三个项目中分别使用过的三种屏幕空间描边方案，从原理到性能给个完整的横评。

> 所有测试基于 Unity 2022.3 LTS + URP 14.0，目标平台为 PC 和移动端。

## 三种方案概览

1. **Sobel 算子** — 经典边缘检测，对深度纹理做卷积
2. **Roberts Cross** — 更轻量的 2x2 算子，适合移动端
3. **法线深度混合** — 同时采样深度和法线缓冲，效果最好但开销也最大

## 方案 1：Sobel

```hlsl
half4 SobelOutline(float2 uv) {
    float kernelX[9] = { -1, 0, 1, -2, 0, 2, -1, 0, 1 };
    float kernelY[9] = { -1, -2, -1, 0, 0, 0, 1, 2, 1 };

    float gx = 0, gy = 0;
    for (int i = 0; i < 9; i++) {
        float2 offset = _Offsets[i] * _OutlineWidth;
        float depth = SampleSceneDepth(uv + offset);
        gx += depth * kernelX[i];
        gy += depth * kernelY[i];
    }

    float edge = sqrt(gx * gx + gy * gy);
    return edge > _Threshold ? _OutlineColor : 0;
}
```

Sobel 的视觉效果是最"圆润"的，但 9 次纹理采样在低端机上比较吃紧。

## 方案 2：Roberts Cross

只需要 4 次采样就能搞定，实测在 Adreno 530 上性能提升约 **2.3x**：

```hlsl
half RobertsEdge(float2 uv) {
    float d1 = SampleSceneDepth(uv);
    float d2 = SampleSceneDepth(uv + float2( 1, 1) * _Offset);
    float d3 = SampleSceneDepth(uv + float2( 1, 0) * _Offset);
    float d4 = SampleSceneDepth(uv + float2( 0, 1) * _Offset);
    return abs(d1 - d2) + abs(d3 - d4);
}
```

代价是只能检测对角线方向的边缘，水平/垂直边缘会有断裂。

## 方案 3：法线深度混合

最终在主项目里用的方案。同时检测深度突变和法线突变，两者求 `max`：

```hlsl
half DepthNormalEdge(float2 uv) {
    half depthEdge = RobertsEdge(uv);
    half3 n0 = SampleSceneNormal(uv);
    half3 n1 = SampleSceneNormal(uv + _Offset);
    half normalEdge = 1 - dot(n0, n1);
    return max(depthEdge * _DepthSensitivity, normalEdge * _NormalSensitivity);
}
```

这个方案能正确检测到"同深度但朝向不同"的边（比如平面上的折角），是前两者做不到的。

## 性能对比

| 方案             | GPU 时间 (ms) | 采样次数 | 视觉表现 |
|------------------|--------------|---------|---------|
| Sobel            | 0.42         | 9       | ★★★★    |
| Roberts Cross    | 0.18         | 4       | ★★★     |
| 法线深度混合     | 0.51         | 8       | ★★★★★  |

> 在 1080p 全屏 Pass，测试设备：iPhone 12。

## 结论

- 移动端低配设备：用 Roberts Cross，配合厚一点的描边宽度掩盖断裂感
- 中高端：法线深度混合是最稳的选择
- 不要忽视 `_OutlineWidth` 应该跟分辨率挂钩，否则在不同设备上会差很多

下一篇会讲怎么把这套方案集成到 URP 的 RenderFeature 里，并支持每物体描边强度控制。
