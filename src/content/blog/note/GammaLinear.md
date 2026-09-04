---
title: "Gamma空间下计算正确的物理结果"
description: "了解Gamma和linear空间下数值的区别"
pubDate: 2023-02-28
tags: ["Math"]
category: note
cover: contrast.png
---

# 如果想在Gamma空间下计算物理结正确，需要做什么？
正确的计算流程应该是：所有数值包括基础色、粗糙度、物理贴图等等 都是要在linear空间下的值计算才对，这里在linear空间下计算 不是指将贴图设置成线性空间。那么linear空间下Unity会对什么数据做处理呢。
第一种就是贴图 勾选了sRGB的，这种贴图会转成linear。对颜色的输入也会转成linear的。举个例子： 
gamma空间下 Albedo -> 直接采样 -> 使用
linear空间下 Albedo -> 采样会Pow(Albedo,2.2)转到linear -> 使用

第二种就是将shader的结果做一个gamma校正，也就是Pow(color, 0.45)对输出的颜色值校正。
![](contrast.png)

所以想要在gamma空间下计算正确的物理效果，需要将颜色贴图和颜色值做一个Pow(Albedo,2.2)，和在最终结果做一个Pow(color, 0.45)就可以了。