---
title: "从零搭建 Unity 资产管线自动化工具链"
description: "用 C# + Python 为美术团队搭建资产入库前的自动检查工具，覆盖命名规范、贴图压缩、LOD 校验等场景。"
pubDate: 2024-11-20
tags: ["Tools", "CI/CD", "Python"]
category: tools
icon: "⚙"
---

## 为什么要自动化

某次例行检查，发现项目里：

- 32% 的贴图忘了开压缩，导致包体多了 800MB
- 17% 的模型没生成 LOD
- 命名不规范的资产 600+ 个

人工检查根本来不及。这套工具就是为了把这些"机械活"自动化。

## 架构

```
[美术上传到 Perforce]
        ↓
[Jenkins 触发]
        ↓
[Python 预检查] ─── 命名规范 / 文件大小
        ↓
[Unity 命令行批处理] ─── AssetPostprocessor 校验
        ↓
[报告 → 钉钉机器人]
```

## 核心检查项

### 1. 命名规范

用 regex 验证：

```python
import re
RULES = {
    'tex_': r'^tex_[a-z0-9_]+_(d|n|m|r)$',
    'mod_': r'^mod_[a-z0-9_]+$',
    'fx_':  r'^fx_[a-z0-9_]+$',
}
```

### 2. 贴图导入设置

通过 `AssetPostprocessor.OnPreprocessTexture` 强制执行：

```csharp
public class TextureChecker : AssetPostprocessor {
    void OnPreprocessTexture() {
        var importer = (TextureImporter)assetImporter;
        if (importer.maxTextureSize > 2048) {
            Debug.LogError($"贴图 {assetPath} 超过 2048");
        }
        if (!importer.crunchedCompression) {
            importer.crunchedCompression = true;
        }
    }
}
```

### 3. LOD 校验

模型必须包含 `_LOD0`, `_LOD1`, `_LOD2` 子物体，否则报错。

## 钉钉报告

用 Webhook 发卡片消息：

```python
import requests
def send_report(stats):
    msg = {
        "msgtype": "markdown",
        "markdown": {
            "title": "资产检查报告",
            "text": f"### 今日资产检查\n\n"
                    f"- 总计: {stats['total']}\n"
                    f"- 通过: {stats['pass']}\n"
                    f"- 警告: {stats['warn']}\n"
                    f"- 失败: {stats['fail']}\n"
        }
    }
    requests.post(WEBHOOK_URL, json=msg)
```

## 落地效果

跑了三个月之后：

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 资产入库错误率 | 23% | 2% |
| 美术返工次数/周 | 18 | 3 |
| 包体增长速率 | 失控 | 可控 |

## 经验

- **不要一次上太多规则** —— 美术会反弹。先从最严重的 3 条开始
- **报告要友好** —— 直接告诉美术"这张图哪里不对，怎么改"
- **留逃生通道** —— 加一个 `// IGNORE_CHECK` 注释支持，紧急情况能跳过
