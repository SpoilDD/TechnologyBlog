---
title: "快速傅里叶海洋"
description: "快速傅里叶"
pubDate: 2025-02-28
tags: ["Shader"]
category: shader
icon: "∑"
---

# 海洋公式

海洋公式我们直接学习最完整的TMA，傅里叶变换就是从频谱变换时域，而TMA计算出来的就是频谱，先看看公式：
$$
S_{TMA}(ω,h)=S_{PM}(ω)\cdot γ^{r(ω)}\cdot  Φ_K(ω,h)
$$

公式解释：

| 公式 | 名字 | 含义 |
| --- | --- | --- |
| $S_{PM}(ω)$ | Pierson-Moskowitz 基础谱 | 海浪整体的形状 |
| $γ^{r(ω)}$ | JONSWAP 峰增强因子 | 风区偶先的一些海浪 |
| $Φ_K(ω,h)$ | Kitaigorodskii 水深修正 | 控制深水区和浅水区海浪的正确性 |

## PM 基础谱（频率域）
$$
S_{PM}(\omega)=\frac{\alpha g^2}{\omega ^5}*exp[{- \frac{5}{4} (\frac{\omega _p}{\omega})^4}]
$$
公式解释：

| 公式  | 含义 |
| ---  | --- |
| $\omega$ |  角频率 |
| $\omega _p$ |频谱峰值的角频率 |
| $\alpha$ | Phillips 常数（纯数字） |
| $g$ | 重力加速度 |

## JONSWAP 峰增强因子
$$
γ^{r(ω)}, r(ω) = exp[-\frac{(ω - ω_p)^2}{2\sigma ^ 2 ω_p^2}]
$$
$$
\sigma = \begin{cases} \sigma_a = 0.07, & \omega \leq \omega_p \\ \sigma_b = 0.09, & \omega > \omega_p \end{cases}
$$

| 公式 | 含义 | 推荐 |
| --- | --- | --- |
| γ | 控制波浪能量在主波峰频率处的集中程度 | 平均 3.3（范围 1~7） |
| $\sigma$ | 波浪的宽度 | 0.07 / 0.09（实测固定） |

##  Kitaigorodskii 水深修正因子
$$
\Phi_{\mathbb{K}}(\omega, h) = \begin{cases} \dfrac{1}{2}\omega_h^2, & \omega_h \leq 1 \\[6pt] 1 - \dfrac{1}{2}(2 - \omega_h)^2, & 1 < \omega_h < 2 \\[6pt] 1, & \omega_h \geq 2 \end{cases}
$$

$$
\omega_h = \omega \sqrt{\dfrac{h}{g}}
$$

| 公式  | 含义 |
| ---  | --- |
| $h$ |  水深 (m) |
|$\omega_h$|纯数值深度频率|

## 参数解析
JONSWAP 参数与风的关系，$\alpha$和$\omega _p$是计算出来的，由风速U和风区F：
$$\tilde{F} = \frac{gF}{U^2}$$

$S_{PM}(\omega)$里面的Phillips 常数:
$$\alpha = 0.076 \tilde{F}^{-0.22}$$
频谱峰值的角频率：
$$\omega_p = 22 \frac{g}{U} \tilde{F}^{-0.33}$$

> 经验法则：风区 $F$ 越大，浪越大，$\alpha$ 减小、$\omega_p$ 减小（浪变长）。

## TMA 完整展开式
$$
S_{TMA}(ω,h)=S_{PM}(ω)\cdot γ^{r(ω)}\cdot Φ_K(ω,h)
$$
$$
S_{\text{TMA}}(\omega, h) = \underbrace{\dfrac{0.076\, \widetilde{F}^{-0.22} g^2}{\omega^5}}_{S_{\text{PM}} \text{ 振幅与衰减}} \cdot \underbrace{\exp\left[-\dfrac{5}{4}\left(\dfrac{\omega_p}{\omega}\right)^4\right]}_{\text{长波抑制}} \cdot \underbrace{\gamma^{\exp[-(\omega - \omega_p)^2 / (2\sigma^2 \omega_p^2)]}}_{\text{JONSWAP 峰增强}} \cdot \underbrace{\Phi_{\mathbb{K}}(\omega, h)}_{\text{水深修正}}
$$

# 方向谱

上述公式是一维度的，海平面需要二维度的，所以需要一个方向扩散函数$D(\omega, \theta)$:
$$
S_{2d}(\omega, \theta) = S_{TMA}(ω,h)\cdot D(\omega, \theta)
$$
$$D(\theta) = |\hat{\mathbf{k}} \cdot \hat{\mathbf{w}}|^s$$

| 公式  | 含义 |
| ---  | --- |
| $\hat{\mathbf{w}}$ | 风的单位向量 |
| $\hat{\mathbf{k}} \cdot \hat{\mathbf{w}}$  | 波的方向与风的方向夹角余弦值 $cos(\theta)$ |
| $s$ | 方向的集中度 |

# k-空间形式（FFT 实现要用）

真实的物理空间是（x,y,z）去表示海浪的位置形状等等，K-空间则是我们说的生成频谱所需要的数值，k的值是复指数空间的向量值$e^{i(k_xx + k_yy)}$。

水深公式：
$$
\omega^2 = gk \tanh(kh)
$$
求导得出：
$$\frac{d\omega}{dk} = \frac{g}{2\omega} [\tanh(kh) + kh \cdot \text{sech}^2(kh)]$$
当水深大于10米的时候， $\tanh(x) \approx 1$,  $\text{sech}(x) \approx 0$， 得出深水公式：

$$
\frac{d\omega}{dk} = 0.5 \sqrt{\frac{g}{k}}
$$

| 公式  | 含义 |
| ---  | --- |
| $\omega$ | 角频率 |
| $h$  | 水深 |
| $g$  | 重力加速度 |
| $\tanh$ | 双曲正切函数 |
| $\text{sech}$ | 双曲正割函数 |

# 最后转换
仔细看就会发现目前都不是在笛卡尔坐标系在的，因为测量海洋的时候就是在频率和极坐标空间下的，所以需要转换到笛卡尔坐标系也就是直角坐标系下，$\omega(k)$,因为$\omega$是由k值计算出来的。
$$S_{2D}(\mathbf{k}) = S(\omega(k), \theta) \cdot \frac{d\omega}{dk} \cdot \frac{1}{k}$$

``` C++
    int nx = int(id.x) - int(_N) / 2;
    int ny = int(id.y) - int(_N) / 2;

    float dk  = 2.0 * PI / _L;
    float2 k  = float2(nx, ny) * dk;
    float  kMag = length(k);
    float kh    = min(kMag * _Depth, 20.0);
    float omega = (kMag > 0.0) ? sqrt(G * kMag * tanh(kh)) : 0.0;
```
科学家测量出来的的$S_{2D}(\mathbf{k})$是能量（统计学叫方差）来的，而我们是要计算复振幅$h_0(\mathbf{k})$给IFFT使用：
$$h_0(\mathbf{k}) = \sqrt{S_{2D}(\mathbf{k})} * k$$

# 代码展示

$$
S_{TMA}(ω,h)=S_{PM}(ω)\cdot γ^{r(ω)}\cdot Φ_K(ω,h)
$$

先计算JONSWAP参数,得到$\alpha$ 和 $\omega _p$
``` C++
void GetJONSWAPParams(out float alpha, out float omegaP)
{
    float U = max(_WindSpeed, 0.1);
    float F = max(_Fetch, 1.0);
    float Ftilde = _Gravity * F / (U * U);
    alpha  = 0.076 * pow(Ftilde, -0.22);
    omegaP = 22.0 * (_Gravity / U) * pow(Ftilde, -0.33);
}
```
$$
S_{PM}(\omega)=\frac{\alpha g^2}{\omega ^5}*exp[{- \frac{5}{4} (\frac{\omega _p}{\omega})^4}]
$$

$S_{PM}(ω)$代码：
``` C++
float SpectrumPiersonMoskowitz(float omega, float omega_p)
{
    if (omega <= 0.0 || omega_p <= 0.0) return 0.0;

    const float betaPm = 1.25; // 5/4
    float omegaPow5 = omega * omega;
    omegaPow5 *= omegaPow5 * omega;

    return (_Alpha * G * G / omegaPow5) * exp(-betaPm * pow(omega_p / omega, 4.0));
}
```

$$
γ^{r(ω)}, r(ω) = exp[-\frac{(ω - ω_p)^2}{2\sigma ^ 2 ω_p^2}]
$$
$$
\sigma = \begin{cases} \sigma_a = 0.07, & \omega \leq \omega_p \\ \sigma_b = 0.09, & \omega > \omega_p \end{cases}
$$

_Gamma是$γ$外部传参, JONSWAP 峰增强因子代码：

``` C++
float PeakEnhancementJonswap(float omega, float omega_p)
{
    if (omega <= 0.0 || omega_p <= 0.0) return 1.0;

    float sigma = (omega <= omega_p) ? 0.07 : 0.09;
    float dOm = omega - omega_p;
    float r = exp(-(dOm * dOm) / (2.0 * sigma * sigma * omega_p * omega_p));

    float gm = max(_Gamma, 1.0);
    return pow(gm, r);
}
```

$$
\Phi_{\mathbb{K}}(\omega, h) = \begin{cases} \dfrac{1}{2}\omega_h^2, & \omega_h \leq 1 \\[6pt] 1 - \dfrac{1}{2}(2 - \omega_h)^2, & 1 < \omega_h < 2 \\[6pt] 1, & \omega_h \geq 2 \end{cases}
$$

$$
\omega_h = \omega \sqrt{\dfrac{h}{g}}
$$

Kitaigorodskii 水深修正因子

``` C++
float PhiKitaigorodskii(float omega, float depth)
{
    if (omega <= 0.0 || depth <= 0.0) return 0.0;

    float omegaH = omega * sqrt(depth / G);
    if (omegaH < 1.0)       return 0.5 * omegaH * omegaH;
    else if (omegaH < 2.0)  return 1.0 - 0.5 * (2.0 - omegaH) * (2.0 - omegaH);
    else                    return 1.0;
}
```

k-空间形式

$$
\frac{d\omega}{dk} = \begin{cases}
\frac{g}{2\omega} [\tanh(kh) + kh \cdot \text{sech}^2(kh)] &h<=10 \\
 0.5 \sqrt{\frac{g}{k}}&h>10
\end{cases}
$$

``` C++
    float omega = (kMag > 0.0) ? sqrt(G * kMag * tanh(kh)) : 0.0;
    float kh    = min(kMag * _Depth, 20.0);
    //((1.0 - th * th)) = sech * sech
    float dwdk = G * (th + kh * (1.0 - th * th)) / max(2.0 * omega, 1e-6);
```

方向谱

$$D(\theta) = |\hat{\mathbf{k}} \cdot \hat{\mathbf{w}}|^s$$
```C++
    float kh    = min(kMag * _Depth, 20.0);
    float2 kHat = k / kMag;
float DirectionalSpreading_dotAbsPow(float2 kHat)
{
    float lenW = length(_WindDir);
    float2 wHat = lenW > 1e-8 ? (_WindDir / lenW) : float2(1.0, 0.0);
    float mu = abs(dot(kHat, wHat));
    mu = max(mu, 1e-6);
    float sExp = max(_DirectionalExponent, 0.01);
    return pow(mu, sExp);
}
```

| 外部传参  | 含义 |
| ---  | --- |
| _WindSpeed | 风的速度 |
| _Fetch  | 风区 |
| _Gravity  | 重力加速度 |
| _PeakOmega  | $w_p$ CPU计算传进来|
| _PeakOmega  | $w_p$ CPU计算传进来|

[傅里叶公式推导](./FFTFormula.md)