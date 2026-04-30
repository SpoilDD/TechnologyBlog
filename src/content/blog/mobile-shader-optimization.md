---
title: "移动端 Shader 性能优化：ALU、带宽与 Overdraw 的取舍实战"
description: "用真实项目里 30+ 帧到 60 帧的优化案例，拆解移动 GPU 上影响渲染性能的三大要素。"
pubDate: 2025-01-10
tags: ["Mobile", "Optimize", "Shader"]
category: optimize
icon: "⚡"
---

## 背景

某项目上线测试机时发现，骁龙 720G 上场景帧率只有 32 fps，目标是 60 fps 稳定。本文记录这次优化的诊断过程。

## 三大瓶颈

移动 GPU 的渲染瓶颈通常是这三类之一：

- **ALU 限制**：复杂计算导致 shader 跑不动
- **带宽限制**：纹理采样过多 / 分辨率过高
- **Overdraw**：同一像素被绘制多次

诊断顺序：先用 Snapdragon Profiler 看 GPU 占用类型。

## 这次的真凶：带宽

打开抓帧后发现：

| 指标 | 数值 |
|------|------|
| GPU 占用 | 92% |
| Texture Read | 4.1 GB/s |
| ALU/Texture 比 | 0.3 |

ALU/Texture 比 < 1 基本就是带宽瓶颈了。

## 优化措施

### 1. 合并贴图通道

把 Metallic / Roughness / AO 三张单通道贴图打包成一张 RGB 贴图，采样次数从 3 降到 1。

```hlsl
// Before
half metallic = SAMPLE_TEXTURE2D(_MetallicTex, sampler_MetallicTex, uv).r;
half roughness = SAMPLE_TEXTURE2D(_RoughTex, sampler_RoughTex, uv).r;
half ao = SAMPLE_TEXTURE2D(_AOTex, sampler_AOTex, uv).r;

// After
half3 mra = SAMPLE_TEXTURE2D(_MRATex, sampler_MRATex, uv).rgb;
```

### 2. 关闭不必要的精度

移动端用 `half` 而不是 `float`，对 PBR 计算几乎无影响：

```hlsl
half3 lightDir = normalize(_MainLightPosition.xyz);
half NdotL = saturate(dot(N, lightDir));
```

### 3. 降低非主角材质的贴图分辨率

远景建筑的法线贴图从 1024 降到 512，场景里这种物体有 200+ 个，省下来的带宽很可观。

## 结果

| 阶段 | FPS | GPU ms |
|------|-----|--------|
| 优化前 | 32 | 31 |
| 通道合并后 | 47 | 21 |
| half 化后 | 53 | 19 |
| 贴图压缩后 | 61 | 16 |

## 经验教训

- 不要先猜瓶颈，**先抓帧再优化**
- ALU 在现代移动 GPU 上几乎不是瓶颈，带宽才是
- Overdraw 经常被低估，UI 和半透明粒子是重灾区
- 不同芯片表现差异很大，一定要在多设备上验证
