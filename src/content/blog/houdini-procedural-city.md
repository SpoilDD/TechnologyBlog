---
title: "Houdini 程序化生成城市街区 — 从参数到引擎的完整 Pipeline"
description: "分享一套从 Houdini Procedural 节点出发，到 Unity URP 实时渲染的城市街区生成流程。"
pubDate: 2025-02-28
tags: ["Houdini", "Pipeline"]
category: pipeline
icon: "▣"
---

## 为什么要程序化

之前手工拼一个中等规模的街区要花美术 2-3 周，现在调几个参数 5 分钟出图。这套 pipeline 在最近的项目里跑了大半年，沉淀下来一些经验。

## 整体流程

```
Houdini HDA  →  批量导出 FBX  →  Unity 自动入库  →  烘焙合并材质
```

## HDA 设计原则

做了几个版本之后总结的几个原则：

1. **参数分组要克制** — 暴露给美术的参数 ≤ 10 个，多了反而不知道调什么
2. **种子参数必须有** — 同一组参数能换几十种结果
3. **预览要快** — 用低密度模式让美术能实时看到大致效果

## 关键节点

核心是 Curve + Polyextrude + Boolean 的组合：

- `Curve` 定义街区轮廓
- `Polyextrude` 拉出建筑体块
- `For-Each Primitive` 给每个体块随机选窗户图案
- `UV Layout` 自动 UV 展开
- `Attribute Wrangle` 给每栋楼分配语义标签 (residential / office / shop)

## 导出与入库

用 Python 脚本批量调用 Houdini 的 `hou.hipFile.save()` 和 `RopFBX`：

```python
import hou
for seed in range(10):
    hou.parm('/obj/citygen/seed').set(seed)
    rop = hou.node('/out/fbx_export')
    rop.parm('sopoutput').set(f'$HIP/exports/city_{seed:03d}.fbx')
    rop.render()
```

Unity 端用 AssetPostprocessor 监听导入事件，自动设置压缩、生成 LOD、挂材质。

## 性能与坑

- HDA 节点超过 50 个之后预览会卡，记得启用 Cache 节点
- FBX 导出 Tangent 默认不带，需要在 ROP 里手动勾选
- Unity 8.x 之前的 LightProbe 烘焙对程序化场景非常不友好

> 完整的 HDA 文件和 Unity 工程已经放在 GitHub，链接在文末。

下一篇会讲怎么用同一套流程做地下管网系统。
