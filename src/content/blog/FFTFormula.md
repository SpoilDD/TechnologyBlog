---
title: "傅里叶公式的推导"
description: "从傅里叶级数到傅里叶变换，一步步推导系数与积分形式。"
pubDate: 2023-02-28
tags: ["Math"]
category: math
icon: "∑"
---

理论 任何函数都可以用 $\cos$ 和 $\sin$ 来表示。

# 傅里叶级数

$$
f(x) = \sum_{n=0}^\infty a_n \cos nx + \sum_{n=0}^\infty b_n \sin nx
$$

将 $x = 0$ 的时候 $\sin 0 = 0$，$\cos 0 = 1$

$$
f(x) = \sum_{n=0}^\infty a_n \cos nx + \sum_{n=0}^\infty b_n \sin nx =
$$
$$
a_0 + \sum_{n=1}^\infty a_n \cos nx + \sum_{n=1}^\infty b_n \sin nx
$$

关键部分是求出 $a_n$ 和 $b_n$，所以将 $a_n$ 和 $b_n$ 提取出来，两边积分：

$$
\int_{-\pi}^{\pi} f(x)dx = \int_{-\pi}^{\pi} a_0 dx + \int_{-\pi}^{\pi} \sum_{n=1}^\infty a_n \cos nxdx + \int_{-\pi}^{\pi} \sum_{n=1}^\infty b_n \sin nxdx
$$

先求 $a_n$，两边乘上 $\cos mx$，为什么常数变成了 $a_0 / 2$，等会再说：

$$
\int_{-\pi}^{\pi} f(x)\cos mxdx =
$$
$$
\int_{-\pi}^{\pi} \frac{a_0}{2} \cos mxdx + \int_{-\pi}^{\pi} \sum_{n=1}^\infty a_n \cos nx \cos mxdx + \int_{-\pi}^{\pi} \sum_{n=1}^\infty b_n \sin nx \cos mxdx
$$

第一项和第三项积分都是0，当 $m = n$ 时候第二项才不是0

$$
\int_{-\pi}^{\pi} f(x)\cos nxdx = \int_{-\pi}^{\pi} a_n \cos nx \cos nxdx = a_n \int_{-\pi}^{\pi} \cos^2 nxdx
$$

$\cos$ 平方积分是周期除于2，所以是 $\pi$，得出：

$$
a_n = \frac{1}{\pi} \int_{-\pi}^{\pi} f(x) \cos nxdx
$$

常数 $a_0$ 在 $-\pi$ 和 $\pi$ 之间的积分等于：

$$
\int_{-\pi}^{\pi} f(x)dx = a_0 \int_{-\pi}^{\pi} dx = a_0 x \Big|_{-\pi}^{\pi} = 2\pi a_0
$$

$$
a_0 = \frac{1}{2\pi} \int_{-\pi}^{\pi} f(x)dx
$$

然后把 $n=0$ 带入刚刚求出的 $a_n$ 公式中得到：

$$
a_0 = \frac{1}{\pi} \int_{-\pi}^{\pi} f(x)dx
$$

所以为了规律，$a_0$ 需要除于2。

得出：

$$
f(x) = \frac{a_0}{2} + \sum_{n=1}^\infty (a_n \cos nx + b_n \sin nx)
$$

其中

$$
a_n = \frac{1}{\pi} \int_{-\pi}^{\pi} f(x) \cos nxdx
$$
$$
b_n = \frac{1}{\pi} \int_{-\pi}^{\pi} f(x) \sin nxdx
$$

---

# 傅里叶级数复数形式

因为公式有三个不统一，所以引出傅里叶级数复数形式，利用欧拉公式

$$
e^{i\theta} = \cos \theta + i \sin \theta
$$

做一下变换，其中 $\cos \theta = \cos(-\theta)$

$$
e^{-i\theta} = \cos(-\theta) + i \sin(-\theta)
$$

$$
e^{-i\theta} = \cos \theta - i \sin \theta
$$

$$
(e^{i\theta}) + (e^{-i\theta}) = (\cos \theta + i \sin \theta) + (\cos \theta - i \sin \theta)
$$

$$
e^{i\theta} + e^{-i\theta} = 2\cos \theta
$$

$$
\cos \theta = \frac{e^{i\theta} + e^{-i\theta}}{2}
$$

同理可得：

$$
\sin \theta = \frac{e^{i\theta} - e^{-i\theta}}{2i}
$$

将上面两个公式带入傅里叶级数：

$$
f(t) = \frac{a_0}{2} + \sum_{n=1}^\infty \left[ \frac{1}{2}a_n \left( e^{in\omega t} + e^{-in\omega t} \right) - \frac{1}{2}ib_n \left( e^{in\omega t} - e^{-in\omega t} \right) \right]
$$
$$
= \frac{a_0}{2} + \sum_{n=1}^\infty \left[ \frac{a_n - ib_n}{2} e^{in\omega t} + \frac{a_n + ib_n}{2} e^{-in\omega t} \right]
$$
$$
= \sum_{n=0}^0 \frac{a_0}{2} e^{in\omega t} + \sum_{n=1}^\infty \frac{a_n - ib_n}{2} e^{in\omega t} + \sum_{n=-\infty}^{-1} \frac{a_{-n} + ib_{-n}}{2} e^{in\omega t}
$$

直接将这三项整合起来得到

$$
f(t) = \sum_{-\infty}^\infty c_n e^{in\omega t}
$$

其中：

$$
c_n = \begin{cases} 
\frac{a_0}{2}, & n = 0 \\ 
\frac{a_n - ib_n}{2}, & n = 1, 2, 3, 4 \cdots \\ 
\frac{a_{-n} + ib_{-n}}{2} & n = -1, -2, -3, -4 \cdots 
\end{cases}
$$

把在傅里叶级数求出的 $a_n$ 和 $b_n$ 带入进去，现代入到第二项：

$$
c_n = \frac{a_n - ib_n}{2} = \frac{1}{2} \left( \frac{2}{T} \int_0^T f(t) \cos n\omega t dt - i \frac{2}{T} \int_0^T f(t) \sin n\omega t dt \right)
$$
$$
= \frac{1}{T} \int_0^T f(t)(\cos n\omega t - i \sin n\omega t)dt
$$

其中欧拉公式

$$
e^{-i\theta} = \cos \theta - i \sin \theta
$$

最后得出复数形式：（第三项得出来的结果也是一样的）

$$
c_n = \frac{1}{T} \int_0^T f(t)e^{-in\omega t} dt
$$

所有傅里叶级数的复数形式就是，在周期 T 中：

1. $c_n = \frac{1}{T} \int_0^T f(t)e^{-in\omega t} dt\ , \ w_0 = \frac{2\pi}{T}$
2. $f(t) = \sum_{-\infty}^\infty c_n e^{in\omega t}$

---

# 傅里叶变换

傅里叶级数是周期性的，但是并不是所有的函数都是周期性的。所以将周期 T 设置成无穷：

基频 $w_0 = \frac{2\pi}{T}$ 相当于周期函数的傅里叶级数中两个相邻频率的差值 $(n+1)w_0 - nw_0$ ，当周期 T 无穷大时，我们可以把它记作 $dw$ 或 $\Delta w$，这样就得到了针对非周期函数的频谱函数：

$$
c_n = \frac{\Delta \omega}{2\pi} \int_{-\infty}^{+\infty} f(t)e^{-i\omega t} dt
$$

将 $C_n$ 带入到傅里叶级数复数形式的第二个等式中：

$$
f(t) = \sum_{n=-\infty}^{+\infty} \left( \frac{\Delta \omega}{2\pi} \int_{-\infty}^{+\infty} f(t)e^{-i\omega t} dt \right) e^{in\omega t} = \frac{1}{2\pi} \int_{-\infty}^{+\infty} \left( \int_{-\infty}^{+\infty} f(t)e^{-i\omega t} dt \right) e^{i\omega t} d\omega
$$

其中傅里叶变换就是：

$$
F(\omega) = \int_{-\infty}^{\infty} f(t)e^{-i\omega t} dt
$$

---

# 离散傅里叶变换

因为计算机不会积分，所以需要将傅里叶级数改成离散形式的，就是将下面的 $C_n$ 改成离散的：

1. $c_n = \frac{1}{T} \int_0^T f(t)e^{-in\omega t} dt\ , \ w_0 = \frac{2\pi}{T}$
2. $f(t) = \sum_{-\infty}^{\infty} c_n e^{in\omega t}$

采样间隔是 $T_s$，采样 N 次，采样周期 $T_0 = N * T_s$，然后积分替换成求和 $\sum$，$C_n$ 变成 $X(\omega)$ 函数形式：

$$
X(\omega) = \frac{1}{T_0} \sum_{n=0}^{N-1} f(nT_s)e^{-i\omega nT_s}
$$

然后 $T_0 = N * T_s$，$w_0 = 2\pi / T_0$，带入到上面函数：

$$
X(\omega) = \frac{1}{NT_s} \sum_{n=0}^{N-1} f(nT_s)e^{-i\frac{2\pi}{N}n}
$$

同样的原理将傅里叶变换的 $F(\omega)$ 替换成 $x[k]$，积分替换成求和 $\sum$，$f(t)$ 替换成 $x[n]$，$w = 2\pi / N*T_s$，$t = nT_s$，

$$
F(\omega) = \int_{-\infty}^{+\infty} f(t)e^{-i\omega t} dt
$$

替换进去，$k$ 是频率的索引

$$
X[k] = \sum_{n=0}^{N-1} x[n]e^{-i\frac{2\pi}{N}kn} , \quad k(0 \le k < N)
$$

---

# 快速傅里叶变换
计算离散的计算量爆炸，所以想出了FFT，计算量从$O(n^2)$变成了$O(Nlog^2(N))$。首先奇偶分离，周期变成$N/2$，得到$E[k] O[k]$,且用 $W_{N}^{nk} = e^{-i\frac{2\pi}{N}nk}$，由于优化的遍历数所以求和公式变成了$\sum_{n=0}^{N/2-1}$，但是目的还是求N次遍历，所以$W_{N}^{nk}$还是$W_{N}^{nk}$：

$$
E[k] = \sum_{n=0}^{N/2-1} x[2n] W_{N}^{2nk}, \quad O[k] = \sum_{n=0}^{N/2-1} x[2n+1] W_{N}^{(2n+1)k}
$$

然后整合到公式里面去：
$$
X[k] = E[k] + O[k] = \sum_{n=0}^{N/2-1} x[2n] W_{N}^{2nk} + \sum_{n=0}^{N/2-1} x[2n+1] W_{N}^{(2n + 1)k}
$$
并且因为：
$$W_N^{2nk} = e^{-i2\pi \cdot 2nk/N} = e^{-i2\pi \cdot nk/(N/2)} = W_{N/2}^{nk} $$
得出：
$$
X[k] = \sum_{n=0}^{N/2-1} x[2n] W_{N/2}^{nk} + \sum_{n=0}^{N/2-1} x[2n+1] W_{N/2}^{nk}* W_{N}^k=G(k) + W_{N}^k * H(k)
$$
到此为止，一个采样 N 次的 DFT，就可以拆成两个采样 N/2 次的 DFT，分别为偶数点采样 G(k)，和奇数点采样 H(k)

---
将K+N/2,可以得出$G\left(k + \frac{N}{2}\right) =  G(k)$，同理得出$H\left(k + \frac{N}{2}\right) = H(k)$
$$
G\left(k + \frac{N}{2}\right) = \sum_{r=0}^{\frac{N}{2}-1} x(2r) W_{\frac{N}{2}}^{r\left(k+\frac{N}{2}\right)} = \sum_{r=0}^{\frac{N}{2}-1} x(2r) W_{\frac{N}{2}}^{rk} W_{\frac{N}{2}}^{\frac{N}{2}} = G(k)
$$
把$W_{\frac{N}{2}}^{\frac{N}{2}}$带入$e^{-i\frac{2\pi}{N}nk}$ 和$e^{i\theta} = \cos \theta + i \sin \theta$得出：
$$
W_{\frac{N}{2}}^{\frac{N}{2}}=e^{-i\frac{2\pi}{N/2}(N/2)} = e^{-i2\pi}=\cos 2\pi + i \sin 2\pi = 1 - i0=1
$$
最后$W_N^{k + N/2}$得出
$$
W_N^{k + N/2} = W_N^k * W_N^{N/2}
$$
$$
 W_N^{N/2} = e^{-i\frac{2\pi}{N}(N/2)} = e^{-i\pi}=\cos\pi + i\sin\pi=-1-i0=-1
$$

$$
W_N^{k + N/2} = -W_N^k = W_N^{k - N/2}
$$

计算量直接减少了一半，最后得出FFT公式：
* $X(k) = G(k) + W_N^k H(k) , \quad 0 \le k < \frac{N}{2}$
* $X(k) = G(k - \frac{N}{2}) - W_N^{k - \frac{N}{2}} H(k - \frac{N}{2}) , \quad \frac{N}{2} \le k < N$

根据这个思路，去计算$N=16$的时候，分成两组$G = {0,2,4,6,8,10,12,14}$和$H = {1,3,5,7,9,11,13,15}$，那么G和H的部分长度就会变成N=8，并且可以利用FFT的特性在缩减一半分成四组$G_1 = {0,4,8,12}$和$G_2 = {2,6,10,14}$，$H_1 ={1,5,9,13}$和$H_2 ={3,7,11,15}$，以此类推去计算至N的长度等1的时候返回本身。这个就是FFT的蝴蝶预算。
蝴蝶图（从左到右依次为第 1、2、3 层运算）：

```
x[0] ----o-------------o-------------o----> X[0]
         |             |             |
x[4] ----o-------------o-------------o----> X[1]
                       |             |
x[2] ----o-------------o-------------o----> X[2]
         |             |             |
x[6] ----o-------------o-------------o----> X[3]
                                     |
x[1] ----o-------------o-------------o----> X[4]
         |             |             |
x[5] ----o-------------o-------------o----> X[5]
                       |             |
x[3] ----o-------------o-------------o----> X[6]
         |             |             |
x[7] ----o-------------o-------------o----> X[7]
```

伪代码
```
function FFT(x):
    N = length(x)
    
    if N == 1:
        return x                          
    
   
    even = x[0], x[2], x[4], ..., x[N-2]  
    odd  = x[1], x[3], x[5], ..., x[N-1] 
    
   
    E = FFT(even)                         // E[k]，k = 0..N/2−1
    O = FFT(odd)                          // O[k]，k = 0..N/2−1
    
   
    X = array of size N
    for k = 0 to N/2 − 1:
        t = W_N^k * O[k]                  
        X[k]       = E[k] + t            
        X[k + N/2] = E[k] − t             
    
    return X
```