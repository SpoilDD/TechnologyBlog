—
title: ”1傅里叶公式的推导“
description: ”从傅里叶级数到傅里叶变换，一步步推导系数与积分形式。“
pubDate: 2023-02-28
tags: [”Math“]
category: math
icon: ”∑“
—

# 水面的交互

水面的交互主要的原理就是利用NS方程去做计算，但是NS方程计算的比较复杂，则推算出浅水方程。 浅水方程分成两部分去计算，动量方程和连续方程。

动量方程主要目的就是计算水平运动， 计算的部分u：
$$\frac{\partial u}{\partial t} + \left(u \frac{\partial }{\partial x} + v \frac{\partial }{\partial y}\right)u= -g \frac{\partial \eta}{\partial x}$$

动量方程 计算的部分v：
$$\frac{\partial v}{\partial t} + \left(u \frac{\partial }{\partial x} + v \frac{\partial }{\partial y}\right)v= -g \frac{\partial \eta}{\partial x}$$

- $\partial$：符号就是偏导的意思，可以理解成用差。
- $x$：就是用左边的值减去右边的值。
- $y$：就是用上边的值减去下边的值。
- $\eta$：高度异常值，就是连续方程计算出来的值。
- $u,v$：就是上帧用这个方程计算出来的值。
- $\partial u,\partial v$：就是用这个方程求出来的值。
- $g$：重力。
- $t$：时间差。


连续方程主要是计算高度：
$$
\frac{\partial \eta}{\partial t} = -\frac{\partial(d \cdot u)}{\partial x} - \frac{\partial(d \cdot v)}{\partial y}
$$
- $u,v,t,x,y$：跟上面的一样。
- $d$：水面的基础高度加上水面运动的高度。
- $\partial \eta$：这个公式求出来的高度差。

# 代码
动量方程经过变换可以得出：
$$
u^{n+1} = u^n - \Delta t \left( u \frac{\partial u}{\partial x} + v \frac{\partial u}{\partial y} + g \frac{\partial \eta}{\partial x} \right)
$$


