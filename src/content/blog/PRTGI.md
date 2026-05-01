---
title: "预计算辐照度全局光照(PRTGI)"
description: "保存场景信息，计算光照用SH传递，保存深度防止漏光"
pubDate: 2025-05-17
tags: ["Shader", "Pipeline"]
category: Shader
featured: true
icon: "PRTGI"
---

[toc]
# PRTGI

### 简介
&emsp;&emsp;PRTGI是全局光照中比较原始的一种技术了，核心是在场景中分布探头，每个探头捕获场景位置、法线、基础色，接着利用保存下来的信息计算出Radiance保存在球谐函数中，然后在物体着色部分采样对应位置的球谐系数还原Irradiance做插值作为环境光表现出来。

### 保存信息
&emsp;&emsp;保存信息这部分是离线操作的，首先是探头的分布，可以直接用均匀分布每个4米分布一个，这样做的话探头可能会分布在物体里面，如果最后混合的时候用法线和探头的方向去做差值的话，这种做法也是可以的，不过很难避免漏光的情况。我最后的差值是选择在每个探头的位置保存一样motion texture，就是类似深度贴图一样去判断遮挡，哪部分信息不需要插值。
&emsp;&emsp;探头分布再布置的时候会上下前后左右六个双方向发出射线检测物体碰撞，检测长度就是4米，距离物体太近的时候也会远离物体，避免保存的motion图会影响计算。
<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBc99abb6146bf0bf1ec57a9bc89cf0c6f?method=download&shareKey=bbc5745ddc7e46f74f69d1193c3d82dd" height=250> <img src="https://share.note.youdao.com/yws/api/personal/file/WEBab0684f8a38afc6deb53269410218e86?method=download&shareKey=1d98037fe98930fc9d266121474bbfd3" height=250>
</center>
&emsp;&emsp;探头位置分布好之后用Unity的camera.RenderToCubemap生成 世界坐标、法线、基础色和天空遮罩的CubeMap贴图，如果每个信息都用贴图去存储的话，内存和性能都会承受不了。所以利用compute shader去采样512份数据保存下来，因为用的是Cubemap方法生成的图，随机采样的话随机出来的点会集中在两端，需要用密度函数去生成采样点才会比较均匀，保存下来的positionWS、normalWS、albedo、skyMask总共十个float叫surfel。
<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEB5e717e86a91d5dbbbbcd353d49aa50a7?method=download&shareKey=4facf7adbd81b8fa51070c4ff390fa52" height=250>
</center>
&emsp;&emsp;直接使用UV生成会像上图左边点分布在上下两端，原因很好理解就是UV集中分布在两级，赤道分布比较分散。 使用下面函数去生成点就会右边一样比较均匀。

``` c++
float3 UniformSphereSample(float u, float v)
{
    const float C_PI = 3.14159265359f;
    float phi = (2.0 * C_PI * u);
    float cosine_theta = 1.0 - 2 * v;
    float sine_theta = sqrt(1.0 - cosine_theta * cosine_theta);
                
    float x = sine_theta * cos(phi);
    float y = sine_theta * sin(phi);
    float z = cosine_theta;

    return normalize(float3(x, y, z));
}
``` 

&emsp;&emsp;生成完随机点之后直接采样Cubemap保存，一个cubemap保存512份surfel和探头位置。还会生成一张128*128使用八面体保存的motion texture，motion texture的r通道保存物体点到探头的距离，g通道保存r通道的平方，这样的方法是利用像Variance Shadow Map中去生成软过渡，方法是使用切比**雪夫不等式**，可以将多张motion贴图保存在一张大的贴图里面采样的时候用Texture2DArray形式去采样。最后再保存整个区域的范围两个Vector3存储，这样数据就保存完了。

<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBed5a17496fb22f13508efe2966f79126?method=download&shareKey=e9a5d914b4e5ce13cd04a78b3f18a26a" height=512>
<center>
motion 2D数组贴图
</center>
</center>


### 投影辐射率(Radiance) SH

&emsp;&emsp; 计算辐射率公式，每份surfel的信息计算出物体的辐射率，然后直接加上SkyColor*SkyMask计算出来的天空颜色。这次计算是第一次辐射再阴影处和背光处的物体是提供不了管线反射的。

<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBd9a5ae440f2a7fb98ce3e04ed735389b?method=download&shareKey=89dfed8c91ceb711e28bee487a316441">
</center>
&emsp;&emsp; 计算是在compute shader里面完成，将计算的结果用球谐函数存储，保存4个或者9个float3的球谐系数，球谐系数可以用一维数组或者Texture3D存储，一维数组要自己插值用Texture3D可以利用插值采样直接着色显示结果，但是利用插值采样会有漏光的问题。我用的方法是7张Texture3D存储9个球谐系数，然后自己插值。<br><br>

&emsp;&emsp;说到球谐系数理解起来可以很简单也可以很复杂，简单理解就是将球面的图像用低频的方法存储起来，存储的结果是取决于你用几阶的球谐函数，用两阶就会存储4个float3数值、用三阶就会存储9个float3数值，最后利用球谐函数将存储的系数还原图像就行。就像JSON一样不用去理解Encode和Decode怎么实现的会用就行，只不是球谐函数很难很精确的Encode图片，Decode出来的图片有点模糊低频，这就和环境光很匹配。<br>

复杂理解就是得理解球谐函数怎么来的，拉普拉斯(Laplace)方程在球坐标下等于0的解，也就是梯度的散度在球坐标下等于0的解，利用**分离变量法**将**半径**和**仰角、方位角**分离出来，分离出来的**仰角、方位角**部分就是球谐函数，这部分里面带有**伴随勒让德多项式**就是球谐函数里面的L和M项控制的几阶。光理解这句话就需要大量的数学知识，所以就先这么理解吧。（0.0）

<center class="half">
    <img src="https://share.note.youdao.com/yws/api/personal/file/WEBe402ad13fa90fc6a02e848414d5a651e?method=download&shareKey=71d130d8e6b3a3b12a0f1523f95e642a" height=500>
</center>

&emsp;&emsp;球谐函数的表达形式有很多种，我用的是直角坐标系的表达式，s是单位方向。

``` C++
float SHProject(in int l, in int m, in float3 s) 
{ 
    #define k01 0.2820947918    // sqrt(  1/PI)/2
    #define k02 0.4886025119    // sqrt(  3/PI)/2
    #define k03 1.0925484306    // sqrt( 15/PI)/2
    #define k04 0.3153915652    // sqrt(  5/PI)/4
    #define k05 0.5462742153    // sqrt( 15/PI)/4

    float x = s.x;
    float y = s.y;
    float z = s.z;
	
	
    if( l==0 )          return  k01;
    
	if( l==1 && m==-1 ) return  k02*y;
    if( l==1 && m== 0 ) return  k02*z;
    if( l==1 && m== 1 ) return  k02*x;
    
	if( l==2 && m==-2 ) return  k03*x*y;
    if( l==2 && m==-1 ) return  k03*y*z;
    if( l==2 && m== 0 ) return  k04*(2.0*z*z-x*x-y*y);
    if( l==2 && m== 1 ) return  k03*x*z;
    if( l==2 && m== 2 ) return  k05*(x*x-y*y);

	return 0.0;
}
```
&emsp;&emsp;将每个512分surfel投影到球谐函数中,radiance就是一份的辐射度，4 * PI 因为每份样本都是在球面上采样的，pdf就是1/(4 * pi)，PROBE_SAMPLER_NUM 是512份。

``` C++
c[0] += SHProject(0, 0, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[1] += SHProject(1, -1, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[2] += SHProject(1,  0, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[3] += SHProject(1,  1, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[4] += SHProject(2, -2, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[5] += SHProject(2, -1, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[6] += SHProject(2,  0, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[7] += SHProject(2,  1, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
c[8] += SHProject(2,  2, dir) * radiance * 4.0 * PI / PROBE_SAMPLER_NUM;
```

### 重建辐照度（Irradiance）
按公式计算出来的是Radiance，但是我们需要的是Irradiance。图片上怎么理解Radiance和Irradiacne呢，就是下面这张图的关系, 左边是Radiance, 右边是Irrdiance。
<center>
    <img src="https://learnopengl-cn.github.io/img/07/03/01/ibl_irradiance.png" height=250>
</center>

``` C++
float3 irradiance = float3(0.0f, 0.0f, 0.0f);
float delta = 0.25f / 8.0f;
float sampleCount = 0.0f; 
for (float phi = 0.0f; phi < 2.0 * PI; phi += delta)
{
    for (float theta = 0.0f; theta < 0.5f * PI; theta += delta)
    {
        const float3 tangentSpaceNormal = float3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
        const float3 worldNormal = tangentSpaceNormal.x * tangent + tangentSpaceNormal.y * biTangent + tangentSpaceNormal.z * normal;
        const float3 color = _RadianceMapCube.SampleLevel(_PointClamp, worldNormal, 0).rgb * cos(theta) * sin(theta);

        irradiance += color;
        sampleCount++;
    }
}

float weight = PI * PI / sampleCount;
irradiance *= weight;
```
&emsp;&emsp;上面的代码就是用Radiance生成的Irrdiance，可以看出转换的过程相当于成了一个卷积，但是在计算的过程中实时转换的话速度太慢了，需要利用Radiance SH 和Irrdiance SH的关系和带谐函数算出卷积的代替方法，这个推导需要比较深刻的理解球谐函数，最后结果很简单，就是每个阶的球谐函数乘对应的常数就行了。c[9]数组就是保存的9个sh系数，A0、A1、A2就是代替卷积的常数。

``` C++
float3 IrradianceSH9(in float3 c[9], in float3 dir)
{
    #define A0 3.1415
    #define A1 2.0943
    #define A2 0.7853

    float3 irradiance = float3(0, 0, 0);
    irradiance += SHProject(0,  0, dir) * c[0] * A0;
    irradiance += SHProject(1, -1, dir) * c[1] * A1;
    irradiance += SHProject(1,  0, dir) * c[2] * A1;
    irradiance += SHProject(1,  1, dir) * c[3] * A1;
    irradiance += SHProject(2, -2, dir) * c[4] * A2;
    irradiance += SHProject(2, -1, dir) * c[5] * A2;
    irradiance += SHProject(2,  0, dir) * c[6] * A2;
    irradiance += SHProject(2,  1, dir) * c[7] * A2;
    irradiance += SHProject(2,  2, dir) * c[8] * A2;
    irradiance = max(float3(0, 0, 0), irradiance);

    return irradiance;
}
```



<center class="half">
    <img src="https://share.note.youdao.com/yws/api/personal/file/WEBc9a1f53ca9913c5a6700a4e995c564fd?method=download&shareKey=9fa262f5ae2735bde5d1a87d501786f9" height=250>
    <img src="https://share.note.youdao.com/yws/api/personal/file/WEBfc00c181579b096bb7acb98ae05d71ee?method=download&shareKey=4c32f755b7c5e8363a8c187f5a4713ad" height=250>
</center>

&emsp;&emsp;上面是没有环境光照和环境光照只反射一次的结果，可以看到在白色物体中有点其他区域反射过来的颜色，也能看到有漏光的现象，因为当前插值是直接三线性插值的结果。三线性插值判断当前着色点附近8个，根据着色点位置和探头位置的比例做混合。利用motion贴图解决漏光的话，rate不用smoothstep做平滑的话，靠近探头附近的着色点会比较亮。

``` C++
float3 ShowInterpolationFloat3(in float3 value[8], float3 rate)
{
    float3 a = lerp(value[0], value[4], smoothstep(0, 1, rate.x));    // 000, 100
    float3 b = lerp(value[2], value[6], smoothstep(0, 1, rate.x));    // 010, 110
    float3 c = lerp(value[1], value[5], smoothstep(0, 1, rate.x));    // 001, 101
    float3 d = lerp(value[3], value[7], smoothstep(0, 1, rate.x));    // 011, 111
    float3 e = lerp(a, b, smoothstep(0, 1, rate.y));
    float3 f = lerp(c, d, smoothstep(0, 1, rate.y));    
    float3 g = lerp(e, f, smoothstep(0, 1, rate.z)); 
    return g;
}
```


<center class="half">
    <img src="https://share.note.youdao.com/yws/api/personal/file/WEBcc10c1cec9c775828dd40bb5593b5f61?method=download&shareKey=a83477c57964191ee4b5fb7401507e1b" height=250>
    <img src="https://share.note.youdao.com/yws/api/personal/file/WEBf4b3ae084a56c464ed74020ea68baa20?method=download&shareKey=ad35b8443705bd7a534700fc0adcf55a" height=250>
</center>
&emsp;&emsp;左边贴图没有做漏光处理，右边利用motion贴图防漏光处理，要是值利用motion贴图的R通道做距离比较的话会有硬边问题，所以利用了切比雪夫不等式去做过渡处理。也可以用法线跟着色点到探头方向的点积做混合，这种做法大物体跟探头平行做不了防漏光和探头离物体太近会出现十字高亮，所以没有选择这种做法。


<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBb872dd1f347eff8d8bbd74d5e8774f62?method=download&shareKey=9a92171f615a4bd66a3b5669e6517440">
</center>

- σ的平方：就是用贴图中G通道减去贴图中R通道的平方。
- t：着色点到探头的距离。
- u：就是贴图R通道。

 &emsp;&emsp;motion贴图要设置 clamp 和 bilinear，因为精度问题也会出现和影子一样需要用ShadowBias去控制着色点位置的偏移。

<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBa1075941acb8a28664a8c5b273d7bc02?method=download&shareKey=9902409393e956da3ec198bea337dbbb" height=250>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEB96ada9a79cac876f029f434a3a038a1f?method=download&shareKey=3767ad64bf4b92368493bbf786f50866" height=250>
</center>

&emsp;&emsp;左图是采样motion贴图的R通道然后跟着色点到探头的距离比大小，右图是用了不等式max(hardShadow, softShadow)， hardShadow是左图算出来的结果，softShadow是不等式算出来的结果然后取做最大值就会有软过渡了。
&emsp;&emsp;可以看出阴影部分是波浪形，因为精度不够本来是锯齿来的，因为将贴图设置了bilinear缩成了波浪形，然后阴影不是从物体的边边开始，也是因为精度不够的问题，利用了ShadowBias去控制便宜导致的。有阴影是因为混合了无用的探头，无用的探头贡献为黑色，也可以直接不混合，但是环境光就没那么丰富了。

### 二次反射
&emsp;&emsp;二次反射可以保存上一帧的RadianceSH，上一帧的Radiance SH理论上是第一次光照反射提供亮度，第一次计算因为乘上了NDL和阴影贴图，所以只有被光照到的物体才会提供反射，然后二次反射计算是利用上一帧的保存的RadianceSH 当光源去计算Radiance，再叠加上去行程二次反射。 因为要保存上一帧的Radiance，所以要额外存储多9张Texture3D，贴图数量直接爆炸，这边就默认第一次提供亮度全是1，其实就是直接将颜色叠加上去模拟二次反射。
<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBd3cf93262c087f03527eaea7f45b14fe?method=download&shareKey=8c099eaeba77d76605b14ad357e6fc2f" height=250>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBb074e3c2b8050e466f617cd305dc6439?method=download&shareKey=7cd60d52e616b8f3c9b70e8c74661e34" height=250>
</center>

### 最后的效果
<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBb664d3727e741da636cb7101432ab78c?method=download&shareKey=ad06bb81ecb2dfddbf5395ca61ce29ce" height=500>
</center>

### 引用
[PRTGI的理论比较好理解](https://zhuanlan.zhihu.com/p/4641631944)
[参考工程代码](https://zhuanlan.zhihu.com/p/571673961)
[球谐函数深入理解](https://zhuanlan.zhihu.com/p/49436452)