—--
title: “FFT交互和水下效果”
description: “浅水方程和水下后处理实现”
叶级数到傅里叶变---
title: ”1傅里叶公式的推导“
description: ”从傅里叶级数到傅里叶变换，一步步推导系数与积分形式。“
浅水icon: “FFT”
---

水面的交互主要的原理就是利用NS方程去做计算，但是NS方程计算的比较复杂，则推算出浅水方程。 
$$ \left(u \frac{\partial }{\partial x} + v \frac{\partial }{\partial y}\right)u= -g \frac{\partial \eta}{\partial x}$$

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
~~~hlsl
    int2 src = int2(id.xy) + _RippleScroll;

    // 读取当前网格(c)和 上下左右(U,D,L,R) 相邻网格的状态
    float3 c  = ReadState(src);
    float3 sL = ReadState(src + int2(-1, 0));
    float3 sR = ReadState(src + int2( 1, 0));
    float3 sD = ReadState(src + int2( 0,-1));
    float3 sU = ReadState(src + int2( 0, 1));

    float eta = c.x, u = c.y, v = c.z;
    float dx = max(_Dx, 1e-4);
    float inv2dx = 1.0 / (2.0 * dx);
    
    //  ∂x和∂y
    float detax = (sR.x - sL.x) * inv2dx;
    float detay = (sU.x - sD.x) * inv2dx;
    
    // ∂u/∂x 
    float dudx = (u > 0.0) ? (u - sL.y) / dx : (sR.y - u) / dx;
    // ∂u/∂y
    float dudy = (v > 0.0) ? (u - sD.y) / dx : (sU.y - u) / dx;
    // ∂v/∂x
    float dvdx = (u > 0.0) ? (v - sL.z) / dx : (sR.z - v) / dx;
    // ∂v/∂y
    float dvdy = (v > 0.0) ? (v - sD.z) / dx : (sU.z - v) / dx;
    
    // 计算出新的u和v
    float uNew = u - _Dt * (u * dudx + v * dudy + _Gravity * detax);
    float vNew = v - _Dt * (u * dvdx + v * dvdy + _Gravity * detay);
~~~


~~~hlsl
    uNew += _Viscosity * (sL.y + sR.y + sD.y + sU.y - 4.0 * u);
    vNew += _Viscosity * (sL.z + sR.z + sD.z + sU.z - 4.0 * v);

    uNew *= _RippleDamping;
    vNew *= _RippleDamping;

    // Keep flow subcritical for stability (|vel| < c).
    float c2 = sqrt(_Gravity * max(_RestDepth, 1e-3)) * 0.95;
    float spd = length(float2(uNew, vNew));
    if (spd > c2) { float s = c2 / spd; uNew *= s; vNew *= s; }

~~~


- Viscosity (粘性)： 公式实际上是离散化的拉普拉斯算子（∇2v）。它模拟了水的粘滞力，能平滑掉相邻像素之间速度差异过大引起的“马赛克/棋盘格”震荡瑕疵。
- Damping (阻尼)：模拟水流在传播过程中的能量衰减（摩擦力），防止水波永远荡漾下去。
- Subcritical Clamp (亚临界钳制)： 在浅水中，重力波的传播速度上限是 $c=\sqrt {g⋅H0​}$（弗劳德数相关的物理限制）。在显式数值计算中，如果流速超过这个速度（即超临界流），计算会立刻崩溃（NaN）。这段代码强行将水流速度限制在极限波速的 95% 以内，保证游戏不会因为一次极端的物理碰撞而导致水面渲染崩溃。

连续方程的计算：
$$
{\eta}^{n+1} =\eta^n -(\frac{\partial(d \cdot u)}{\partial x} - \frac{\partial(d \cdot v)}{\partial y})*\partial t
$$
~~~hlsl
    float dL = max(_RestDepth + sL.x, 1e-3);
    float dR = max(_RestDepth + sR.x, 1e-3);
    float dD = max(_RestDepth + sD.x, 1e-3);
    float dU = max(_RestDepth + sU.x, 1e-3);

    float fluxX = (dR * sR.y - dL * sL.y) * inv2dx;
    float fluxY = (dU * sU.z - dD * sD.z) * inv2dx;
    float etaNew = eta - _Dt * (fluxX + fluxY);
~~~

# 水下的效果

实现水下效果就是判断坐标在水面下面就用后处理处理效果，比如添加焦散、雾效、水上折射等等。判断水下逻辑就是用一个正交摄像机类似拍影子一样去拍水面的深度，将近裁剪面的四个顶点传入到后处理的shader里面，再将坐标转换到正交摄像机的空间下去对比深度。<<<<<<<+main
—
title: “FFT交互和水下效果”
description: “浅水方程和水下后处理实现”
叶级数到傅里叶变---
title: ”1傅里叶公式的推导“
description: ”从傅里叶级数到傅里叶变换，一步步推导系数与积分形式。“
>>>>>>>-origin/main
水面的交互

水面的交互主要的原理就是利用NS方程去做计算，但是NS方程计算的比较复杂，则推算出浅水方程。 浅水icon: “FFT”
—
>>>>>>>+main
计算水平运动， icon: ”∑“
---
>>>>>>>-origin/main
+ \left(u \frac{\partial }{\partial x} + v \frac{\partial }{\partial y}\right)u= -g \frac{\partial \eta}{\partial x}$$

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
~~~hlsl
    int2 src = int2(id.xy) + _RippleScroll;

    // 读取当前网格(c)和 上下左右(U,D,L,R) 相邻网格的状态
    float3 c  = ReadState(src);
    float3 sL = ReadState(src + int2(-1, 0));
    float3 sR = ReadState(src + int2( 1, 0));
    float3 sD = ReadState(src + int2( 0,-1));
    float3 sU = ReadState(src + int2( 0, 1));

    float eta = c.x, u = c.y, v = c.z;
    float dx = max(_Dx, 1e-4);
    float inv2dx = 1.0 / (2.0 * dx);
    
    //  ∂x和∂y
    float detax = (sR.x - sL.x) * inv2dx;
    float detay = (sU.x - sD.x) * inv2dx;
    
    // ∂u/∂x 
    float dudx = (u > 0.0) ? (u - sL.y) / dx : (sR.y - u) / dx;
    // ∂u/∂y
    float dudy = (v > 0.0) ? (u - sD.y) / dx : (sU.y - u) / dx;
    // ∂v/∂x
    float dvdx = (u > 0.0) ? (v - sL.z) / dx : (sR.z - v) / dx;
    // ∂v/∂y
    float dvdy = (v > 0.0) ? (v - sD.z) / dx : (sU.z - v) / dx;
    
    // 计算出新的u和v
    float uNew = u - _Dt * (u * dudx + v * dudy + _Gravity * detax);
    float vNew = v - _Dt * (u * dvdx + v * dvdy + _Gravity * detay);
~~~


~~~hlsl
    uNew += _Viscosity * (sL.y + sR.y + sD.y + sU.y - 4.0 * u);
    vNew += _Viscosity * (sL.z + sR.z + sD.z + sU.z - 4.0 * v);

    uNew *= _RippleDamping;
    vNew *= _RippleDamping;

    // Keep flow subcritical for stability (|vel| < c).
    float c2 = sqrt(_Gravity * max(_RestDepth, 1e-3)) * 0.95;
    float spd = length(float2(uNew, vNew));
    if (spd > c2) { float s = c2 / spd; uNew *= s; vNew *= s; }

~~~


- Viscosity (粘性)： 公式实际上是离散化的拉普拉斯算子（∇2v）。它模拟了水的粘滞力，能平滑掉相邻像素之间速度差异过大引起的“马赛克/棋盘格”震荡瑕疵。
- Damping (阻尼)：模拟水流在传播过程中的能量衰减（摩擦力），防止水波永远荡漾下去。
- Subcritical Clamp (亚临界钳制)： 在浅水中，重力波的传播速度上限是 $c=\sqrt {g⋅H0​}$（弗劳德数相关的物理限制）。在显式数值计算中，如果流速超过这个速度（即超临界流），计算会立刻崩溃（NaN）。这段代码强行将水流速度限制在极限波速的 95% 以内，保证游戏不会因为一次极端的物理碰撞而导致水面渲染崩溃。

连续方程的计算：
$$
{\eta}^{n+1} =\eta^n -(\frac{\partial(d \cdot u)}{\partial x} - \frac{\partial(d \cdot v)}{\partial y})*\partial t
$$
~~~hlsl
    float dL = max(_RestDepth + sL.x, 1e-3);
    float dR = max(_RestDepth + sR.x, 1e-3);
    float dD = max(_RestDepth + sD.x, 1e-3);
    float dU = max(_RestDepth + sU.x, 1e-3);

    float fluxX = (dR * sR.y - dL * sL.y) * inv2dx;
    float fluxY = (dU * sU.z - dD * sD.z) * inv2dx;
    float etaNew = eta - _Dt * (fluxX + fluxY);
~~~

# 水下的效果

实现水下效果就是判断坐标在水面下面就用后处理处理效果，比如添加焦散、雾效、水上折射等等。判断水下逻辑就是用一个正交摄像机类似拍影子一样去拍水面的深度，将近裁剪面的四个顶点传入到后处理的shader里面，再将坐标转换到正交摄像机的空间下去对比深度。
