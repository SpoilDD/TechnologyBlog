---
title: "SSGI"
description: "理解屏幕空间全局光照的算法流程"
pubDate: 2025-02-02
tags: ["Sahder"]
category: shader
icon: "SSGI"
---
# SSGI

### 简介

&emsp;&emsp;SSGI是在屏幕空间中利用光线步进（Ray Marching）技术判断半球上多个方向相交点的颜色作为间接光，和HBAO逻辑有部分相似。因为光线步进计算出来有噪点，直接模糊降噪效果一般，可以用累计加模糊来降噪。因为屏幕空间无法判断物体厚度，可以再将物体背面渲染到贴图来做优化。

### 光线步进（Ray Marching）

&emsp;&emsp;光线步进需要用到深度贴图和法线贴图，在当前像素点法线方向的半球随机生成几个方向，然后按照这个方向步进一定距离，每步进一次都用当前的深度和步进后的深度做对比，当差值小于一定值时就保存下来，步进到天空时候就采样环境光作为间接光。

<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEB5e717e86a91d5dbbbbcd353d49aa50a7?method=download&shareKey=4facf7adbd81b8fa51070c4ff390fa52" height="250">
</center>

```c++
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

real3 SampleHemisphereCosine(real u1, real u2, real3 normal)
{
    real3 pointOnSphere = UniformSphereSample(u1, u2);
    return SafeNormalize(normal + pointOnSphere);
}
```

&emsp;&emsp;上面是随机生成均匀点方法，半球向量只需要将生成出来的点，当成单位向量和法线相加后归一化就是步进的方向了。

```c++
RayHit RayMarching(Ray ray, half dither, half3 viewDirectionWS)
{
    RayHit rayHit = InitializeRayHit();
    bool isFrontRay = (dot(ray.direction, viewDirectionWS) <= 0.0) ? true : false;
    half stepSize = STEP_SIZE;
    half currStepSize = SMALL_STEP_SIZE;
    half marchingThickness = MARCHING_THICKNESS;
    float3 rayPositionWS = ray.position;
    bool startBinarySearch = false;

    UNITY_LOOP
    for (int i = 1; i <= MAX_STEP; i++)
    {
        if (i > MAX_SMALL_STEP && i <= MAX_MEDIUM_STEP)
        {
            currStepSize = MEDIUM_STEP_SIZE;
            marchingThickness = MARCHING_THICKNESS;
        }
        else if (i > MAX_MEDIUM_STEP)
        {
            currStepSize = stepSize;
            marchingThickness = MARCHING_THICKNESS;
        }
        rayPositionWS += (currStepSize + currStepSize * dither) * ray.direction;
        float3 rayPositionNDC = ComputeNormalizedDeviceCoordinatesWithZ(rayPositionWS, GetWorldToHClipMatrix());

    #if (UNITY_REVERSED_Z == 0) 
        rayPositionNDC.z = rayPositionNDC.z * 0.5 + 0.5; // -1..1 to 0..1
    #endif

        bool isScreenSpace = rayPositionNDC.x > 0.0 && rayPositionNDC.y > 0.0 && rayPositionNDC.x < 1.0 && rayPositionNDC.y < 1.0 ? true : false;
        if (!isScreenSpace) break;
        float deviceDepth = SAMPLE_TEXTURE2D_X_LOD(_CameraDepthTexture, my_point_clamp_sampler, rayPositionNDC.xy, 0).r;
        float sceneDepth = ConvertLinearEyeDepth(deviceDepth);
        float hitDepth = ConvertLinearEyeDepth(rayPositionNDC.z);
        float depthDiff = sceneDepth - hitDepth;
        float sceneBackDepth = 0.0;
        half Sign =  FastSign(depthDiff);
        bool cannotBinarySearch = !startBinarySearch && (isFrontRay ? hitDepth > sceneBackDepth : hitDepth < sceneDepth);
        startBinarySearch = !cannotBinarySearch && (startBinarySearch || (Sign == -1)) ? true : false;
        if (startBinarySearch)
        {
            currStepSize *= (FastSign(currStepSize) == Sign) ? 0.5 : -0.5;
        }

        bool isSky = abs(deviceDepth - UNITY_RAW_FAR_CLIP_VALUE) < RAW_FAR_CLIP_THRESHOLD;
        bool hitSuccessful = ((depthDiff <= 0.0) && (depthDiff >= -marchingThickness) && !isSky) ? true : false;
        if (hitSuccessful)
        {
            rayHit.position = rayPositionWS;
            rayHit.distance = length(rayPositionWS - ray.position);
            rayHit.screenUV = rayPositionNDC.xy;
            break;
        }
        else if (!startBinarySearch)
        {
            currStepSize += currStepSize * 0.1;
            marchingThickness += _Thickness_Increment;
        }
    }
    return rayHit;
}
```

<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEB9d999e04348cd6dadbe6e68fba63fbf0?method=download&shareKey=531f34e69db1ba5cd1221a1825b09405" height="250">
</center>

&emsp;&emsp;每步按固定的距离增加然后采样效率没那么高，[指数增加](https://blog.voxagon.se/2018/01/03/screen-space-path-tracing-diffuse.html)可以优化一定的效率，将采样距离分成三部分，第一部分按小距离增加，第二部分按中距离增加，第三部分按大距离增加这样去采样。

### 降噪
#### 混合上一帧和填充
&emsp;&emsp; 可以看到噪声很严重，直接填充模糊降噪效果不好。可以将生成半球方向的随机函数加入帧数相关的种子，然后将当前帧保存下来，再添加一个pass将上帧的间接光混合加模糊混合起来。

<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEB47aaff9404fd2144221c63fce66b7560?method=download&shareKey=12669c4e8177aa9aeb501fbc93528f8c" height="250">
</center>

&emsp;&emsp; 混合部分（Temporal Reprojection Pass） 用的方法是在RayMarching部分将有间接光的位置用Alpha通道保存下来，每次步进有相交或者能反射环境光Alpha通道就加上 1/步进次数。 然后在Temporal Reprojection Pass里面判断RayMarching保存的Alpha通道数值大于某个值或者值不等于0，就和上一帧的间接光相混合。还可以保存混合帧数的累计，给Poisson Disk Recurrent Denoise Pass用。

``` C++
half2 velocity = SAMPLE_TEXTURE2D_X_LOD(_MotionVectorTexture, sampler_LinearClamp, screenUV, 0).xy;
float2 prevUV = screenUV - velocity;
half historySample = SAMPLE_TEXTURE2D_X_LOD(_SSGIHistorySampleTexture, my_point_clamp_sampler, prevUV, 0).r;
half4 currentColor = SAMPLE_TEXTURE2D_X_LOD(_BlitTexture, sampler_LinearClamp, screenUV, 0).rgba;

// accumulationFactor 外部传进来
if (FastSign(currentColor.a) == 1.0)
{
    color = (currentColor.rgb * (1.0 - accumulationFactor) + prevColor.rgb * accumulationFactor);
}
```
&emsp;&emsp; 要是Alpha通道值为0说明当前帧的该像素是没有间接光的，需要采样上下左右的像素和上一帧像素来判断填充的颜色, 上下左右像素可以限制上一帧颜色不会太跳变。

``` C++
void AdjustColorBox(inout half3 boxMin, inout half3 boxMax, float2 uv, half currX, half currY)
{
    half3 color = SampleColorPoint(uv, float2(currX, currY));
    boxMin = min(color, boxMin);
    boxMax = max(color, boxMax);
}


if (FastSign(currentColor.a) == 1.0)
{

}else
{
    half3 boxMax = currentColor.rgb;
    half3 boxMin = currentColor.rgb;
    
    AdjustColorBox(boxMin, boxMax, screenUV, 0.0, -1.0);
    AdjustColorBox(boxMin, boxMax, screenUV, -1.0, 0.0);
    AdjustColorBox(boxMin, boxMax, screenUV, 1.0, 0.0);
    AdjustColorBox(boxMin, boxMax, screenUV, 0.0, 1.0);
    
    currentColor.rgb = clamp(prevColor, boxMin, boxMax);
    currentColor.rgb = (currentColor.rgb * (1.0 - accumulationFactor) + prevColor.rgb * accumulationFactor);
}
```
#### 模糊
&emsp;&emsp; 高斯模糊需要采样次数可以通过用泊松采样来减少。

<center>
<img src="https://imagebed-aery.oss-cn-hangzhou.aliyuncs.com/202208260919690.png" height="250">
</center>

&emsp;&emsp; Poisson Disk Recurrent Denoise Pass降噪的方法是通过 [Fast Denoising with Self Stabilizing Recurrent Blurs](https://developer.download.nvidia.cn/video/gputechconf/gtc/2020/presentations/s22699-fast-denoising-with-self-stabilizing-recurrent-blurs.pdf?t=eyJscyI6ImdzZW8iLCJsc2QiOiJodHRwczpcL1wvd3d3Lmdvb2dsZS5jb20uaGtcLyJ9) 来实现的，这PPT里面会根据Roughness来判断采样的空间，因为间接光部分都是比较平滑的，所以Roughness=1来计算采样的空间了。然后模糊的半径也是根据Roughness和累计的帧数来计算的，目的都是为了不想失去高频信息。间接漫反射的光就是比较平滑的，所以半径就用固定的来计算。

``` C++
half2x3 GetKernelBasis(half3 N)
{
    half3x3 basis = GetLocalFrame(N);
    half3 T = basis[0];
    half3 B = basis[1];
    return half2x3(T, B);
}

float2 GetKernelSampleCoordinates(half3 offset, float3 X, half3 T, half3 B, half4 rotator)
{
    offset.xy = offset.x * rotator.xz + offset.y * rotator.yw;
    float3 wsPos = X + T * offset.x + B * offset.y;
    float4 hClip = TransformWorldToHClip(wsPos);
    hClip.xyz /= hClip.w;
    float2 nDC = hClip.xy * 0.5 + 0.5;
    
#if UNITY_UV_STARTS_AT_TOP
    nDC.y = 1.0 - nDC.y;
#endif
    return nDC;
}

------------------frag----------------------

half2x3 TvBv = GetKernelBasis(normalWS);
TvBv[0] *= _ReBlurDenoiserRadius;
TvBv[1] *= _ReBlurDenoiserRadius;

for (int sampleIndex = 0; sampleIndex < POISSON_SAMPLE_COUNT; ++sampleIndex)
{
    half3 offset = k_PoissonDiskSamples[sampleIndex];
    float2 uv = GetKernelSampleCoordinates(offset, positionWS, TvBv[0], TvBv[1], _ReBlurBlurRotator);
    
    float4 tapSignal = SAMPLE_TEXTURE2D_X_LOD(_BlitTexture, my_point_clamp_sampler, uv, 0);
    
    half w = k_GaussianWeight[sampleIndex];
    signalSum += tapSignal * w;
    sumWeight += w;
}

signalSum = sumWeight != 0.0 ? signalSum / sumWeight : centerSignal;
return max(signalSum, 0);
```


<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEBc6a057fb12f4e56244cf7aaa055b5149?method=download&shareKey=dc1584d806eb454fa3af1e3e6b10af27" height="250">
<img src="https://share.note.youdao.com/yws/api/personal/file/WEB15895bd3008ca3a4e5e13f9f6e54f094?method=download&shareKey=5d164d718ab6ff06e8dbd604e0dc5c17" height="250">
</center>

&emsp;&emsp; 左图是直接模糊的，可以看到红色球体和绿色方体边边都有一层白色的部分，因为和背景模糊后将亮度提升了。右图是判断了深度差和法线的点积值来判断模糊的权重。

### 缺陷
&emsp;&emsp; 因为是在屏幕空间里做的算法，所以屏幕空间外的物体不能提供环境光。

<center>
<img src="https://share.note.youdao.com/yws/api/personal/file/WEB7b6ea4fc3b39af610b9664010de6ced1?method=download&shareKey=58533fc260427aa37716991bef51a39f" height="250">
</center>


[代码仓库](https://github.com/jiaozi158/UnitySSGIURP)