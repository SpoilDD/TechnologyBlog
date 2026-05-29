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

# k-空间形式

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

```hlsl
    int nx = int(id.x) - int(_N) / 2;
    int ny = int(id.y) - int(_N) / 2;

    float dk  = 2.0 * PI / _L;
    float2 k  = float2(nx, ny) * dk;
    float  kMag = length(k);
    float kh    = min(kMag * _Depth, 20.0);
    float omega = (kMag > 0.0) ? sqrt(G * kMag * tanh(kh)) : 0.0;
```
科学家测量出来的的$S_{2D}(\mathbf{k})$是能量（统计学叫方差）来的，而我们是要计算复振幅$h_0(\mathbf{k})$给IFFT使用：
$$|h_0(\mathbf{k})| = \sqrt{S_{2D}(\mathbf{k})} * dk$$

模糊做相位偏移,$u_1,u_2$是随机数:

$$
\begin{aligned}
h_0(k) &= \frac{1}{\sqrt{2}}(ξ_r + iξ_i)\sqrt{S_{2D}(k)} \\
ξ_r    &= \sqrt{-2\ln u_1}\cdot\cos(2\pi u_2) \\
ξ_i    &= \sqrt{-2\ln u_1}\cdot\sin(2\pi u_2)
\end{aligned}
$$

# TMA初始频谱

$$
S_{TMA}(ω,h)=S_{PM}(ω)\cdot γ^{r(ω)}\cdot Φ_K(ω,h)
$$

先计算JONSWAP参数,得到$\alpha$ 和 $\omega _p$
```hlsl
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
```hlsl
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

```cpp
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

```hlsl
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

```hlsl
    float omega = (kMag > 0.0) ? sqrt(G * kMag * tanh(kh)) : 0.0;
    float kh    = min(kMag * _Depth, 20.0);
    //((1.0 - th * th)) = sech * sech
    float dwdk = G * (th + kh * (1.0 - th * th)) / max(2.0 * omega, 1e-6);
```

方向谱

$$D(\theta) = |\hat{\mathbf{k}} \cdot \hat{\mathbf{w}}|^s$$
```hlsl
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

```hlsl

     if (id.x >= _N || id.y >= _N) return;

    int nx = int(id.x) - int(_N) / 2;
    int ny = int(id.y) - int(_N) / 2;

    float dk  = 2.0 * PI / _L;
    float2 k  = float2(nx, ny) * dk;
    float  kMag = length(k);

    // Finite-depth dispersion: omega^2 = g k tanh(k h)
    float kh    = min(kMag * _Depth, 20.0);
    float omega = (kMag > 0.0) ? sqrt(G * kMag * tanh(kh)) : 0.0;
    _OmegaK[id.xy] = omega;

    // P_h(k) = S_TMA(omega) * D(theta) * (d omega / d k) / k
    float p_pos = 0.0;
    float p_neg = 0.0;

    float th   = tanh(kh);
    float dwdk = G * (th + kh * (1.0 - th * th)) / max(2.0 * omega, 1e-6);
    float S    = SpectrumTMA(omega, _Depth, _PeakOmega, _Alpha);

    float2 kHat = k / kMag;

    float Ddir = DirectionalSpreading_dotAbsPow(kHat);

    float dirP = Ddir;
    float dirN = Ddir;

    // suppression of tiny waves (numerical stability)
    float damp = exp(-(kMag * _Suppression) * (kMag * _Suppression));

    p_pos = S * dirP * dwdk / kMag * damp;
    p_neg = S * dirN * dwdk / kMag * damp;

    float ampP = sqrt(max(p_pos, 0.0)) * dk;
    float ampN = sqrt(max(p_neg, 0.0)) * dk;

    float2 r1 = gaussian(id.xy, 0u);
    float2 r2 = gaussian(uint2((_N - id.x) % _N, (_N - id.y) % _N), 1u);

    float2 h0p = r1 * ampP * 0.70710678; // 1/sqrt(2)
    float2 h0n = r2 * ampN * 0.70710678;
    float2 h0nConj = float2(h0n.x, -h0n.y);

    _H0K[id.xy] = float4(h0p, h0nConj);
```

| 外部传参  | 含义 |
| ---  | --- |
| _WindSpeed | 风的速度 |
| _Fetch  | 风区 |
| _Gravity  | 重力加速度 9.8 |
| _PeakOmega  | $w_p$ CPU计算传进来， 控制基础的浪 一般比较大|
| _Alpha   | $\alpha$ CPU计算传进来, 再比较大的浪上控制比较小的浪|

# 预处理IFFT索引
[傅里叶公式推导](/blog/fftformula)得出计算规则：
* $X(k) = G(k) + W_N^k H(k) , \quad 0 \le k < \frac{N}{2}$
* $X(k) = G(k - \frac{N}{2}) - W_N^{k - \frac{N}{2}} H(k - \frac{N}{2}) , \quad \frac{N}{2} \le k < N$
  
FFT的原理是利用奇偶和类似递归来快速计算，所以需要一个函数先把采样的K的值保存下来，然后在做IFFT的时候就可以直接读取当前像素的K值然后计算，用8x8来举例。W就是$e^{i2\pi k}$ 会在IFFT的时候用于动态海洋的变换。

|   |y0| y1 |y2 |y3 |y4 |y5 |y6 |y7  |
| ---  | --- |--- |--- |--- |--- |--- |--- |--- |
| x0  | 0,4 |0,4 |2,6 |2,6 | 1,5 |1,5 |3,7 |3,7 |
| x1  | 0,2 |1,3 |0,2 |1,3 | 4,6 |5,7 |4,6 |5,7 |
| x2  | 0,4 |1,5 |2,6 |3,7 | 0,4 |1,5 |2,6 |3,7 |


```hlsl
[numthreads(1, 64, 1)]
void CSPrecomputeTwiddle(uint3 id : SV_DispatchThreadID)
{
    uint stage = id.x;
    uint x     = id.y;
    if (stage >= _LogN || x >= _N) return;

    uint m              = 1u << (stage + 1u);
    uint butterflyIndex = x % m;

    // IFFT direction: W = exp(+i * 2*PI * butterflyIndex / m)
    float angle = 2.0 * PI * float(butterflyIndex) / float(m);
    float2 W    = float2(cos(angle), sin(angle));

    uint k1, k2;
    if (butterflyIndex < m / 2u) { k1 = x;            k2 = x + m / 2u; }
    else                          { k1 = x - m / 2u;   k2 = x;          }

    if (stage == 0u)
    {
        k1 = reverseBits(k1, _LogN);
        k2 = reverseBits(k2, _LogN);
    }

    _Twiddle[uint2(stage, x)] = float4(W, float(k1), float(k2));
}
```

# 动态海洋
$$
\hat{h} (\hat{k},t)=\hat{h}_0(+\hat{k})e^{iωt}+\hat{h}_0^*(−\hat{k})e^{-iωt}
$$

在上面计算时候讲$w$和$\hat{h}$存储下来，然后加上时间$t$计算，h也是个复数然后乘法直接乘
$$
(a+bi)(c+si)=\underbrace{ac+bsi^2}_{\text{实部}} + \underbrace{(as+bc)i}_{\text{虚部}}
$$

```hlsl
    int nx = int(id.x) - int(_N) / 2;
    int ny = int(id.y) - int(_N) / 2;

    float dk   = 2.0 * PI / _L;
    float2 k   = float2(nx, ny) * dk;
    float  kMag = length(k);

    float4 h0    = _H0K[id.xy];
    float  omega = _OmegaK[id.xy];

    // exp(iwt) = cos(wt) + i sin(wt)
    float c = cos(omega * _Time);
    float s = sin(omega * _Time);
    
    // exp(+ i omega t) = c + i s
    float2 hp = float2(h0.x * c - h0.y * s, h0.x * s + h0.y * c);
    // exp(- i omega t) applied to h0(-k)*  (h0.zw)
    float2 hn = float2(h0.z * c - h0.w * (-s), h0.z * (-s) + h0.w * c);
```

这么做顶点只会上下移动，所以还需要添加一个方向的：

$$\tilde{D}_x(\mathbf{k}, t) = -i \frac{k_x}{|\mathbf{k}|} \tilde{h}(\mathbf{k}, t), \quad \tilde{D}_z(\mathbf{k}, t) = -i \frac{k_z}{|\mathbf{k}|} \tilde{h}(\mathbf{k}, t)$$

```hlsl
    float2 kHat = (kMag > 1e-6) ? k / kMag : float2(0.0, 0.0);
    float2 i_hkt = float2(-hkt.y, hkt.x);    // i * hkt

    float2 dx = kHat.x * i_hkt;
    float2 dz = kHat.y * i_hkt;

    // pack Dx + i Dz so a single IFFT gives (Re=Dx, Im=Dz)
    float2 dxdz = float2(dx.x - dz.y, dx.y + dz.x);

    _SpectrumA[id.xy] = float4(hkt, dxdz);
```

# IFFT垂直和水平
这里_Twiddle保存的K值和$w = e^{-i2\pi k}$用来逆傅里叶变换，因为一张贴图不能同时写入和读取，所以用了两张贴图来回存储和读取，复指数的相乘用的都是欧拉公式代替的。

```hlsl
[numthreads(8, 8, 1)]
void CSFFTHorizontal(uint3 id : SV_DispatchThreadID)
{
    if (id.x >= _N || id.y >= _N) return;

    float4 bt = _Twiddle[uint2(_Stage, id.x)];
    float2 W  = bt.xy;
    uint   k1 = (uint)bt.z;
    uint   k2 = (uint)bt.w;

    float4 p = readSpectrum(uint2(k1, id.y), _PingPong);
    float4 q = readSpectrum(uint2(k2, id.y), _PingPong);

    float2 qrg = float2(W.x * q.x - W.y * q.y, W.x * q.y + W.y * q.x);
    float2 qba = float2(W.x * q.z - W.y * q.w, W.x * q.w + W.y * q.z);

    writeSpectrum(id.xy, _PingPong, float4(p.xy + qrg, p.zw + qba));
}

[numthreads(8, 8, 1)]
void CSFFTVertical(uint3 id : SV_DispatchThreadID)
{
    if (id.x >= _N || id.y >= _N) return;

    float4 bt = _Twiddle[uint2(_Stage, id.y)];
    float2 W  = bt.xy;
    uint   k1 = (uint)bt.z;
    uint   k2 = (uint)bt.w;

    float4 p = readSpectrum(uint2(id.x, k1), _PingPong);
    float4 q = readSpectrum(uint2(id.x, k2), _PingPong);

    float2 qrg = float2(W.x * q.x - W.y * q.y, W.x * q.y + W.y * q.x);
    float2 qba = float2(W.x * q.z - W.y * q.w, W.x * q.w + W.y * q.z);

    writeSpectrum(id.xy, _PingPong, float4(p.xy + qrg, p.zw + qba));
}

```