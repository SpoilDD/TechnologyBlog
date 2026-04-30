---
title: "water"
description: "卡通渲染"
pubDate: 2025-02-28
tags: ["Houdini", "Pipeline"]
category: pipeline
icon: "▣"
---

# 水面渲染

内容基于Unity 2021.2.7f1c1，URP 12.1.2实现。

#### 渲染目录：
>* 法线
>* 颜色和边缘透明度
>* 漫反射
>* 高光
>* 天空盒反射
>* 物体反射
>* 水边浪花
>* 水边焦散
>* 水的交互
>* 折射  (下次一定)

> ![avatar](https://note.youdao.com/yws/api/personal/file/WEB7113b771118d90f83aea49dd06103284?method=download&shareKey=9fa5923817754ab49925a280d099baac)
> 整体效果

#### 1.法线
    法线的做法有很多种，可以改变顶点的位置，或者直接采样法线贴图，还可以对坐标加噪声贴图进行计算求得。
    这里选择坐标加噪声贴图去获取。
    
```cpp
inline float3 waveNormal(float2 pos, float dist)
{
    float omega[4] = {37, 17, 23, 16};
    float phi[4] = {7, 5, 3, 11};
    float2 dir[4] = {
        float2(1, 0),
        float2(1, 0.1),
        float2(1, 0.3),
        float2(1, 0.57)
    };
    float t = _Time.y * _WaveSpeed;
    float3 normal = 0;
    for(int i=0;i<4;i++)
    {
        omega[i] *= _WaveScale;
        normal += float3(
            omega[i] * dir[i].x * cos(dot(dir[i], pos) * omega[i] + t * phi[i]),
            1,
            omega[i] * dir[i].y * cos(dot(dir[i], pos) * omega[i] + t * phi[i])
        );
    }
    normal.xz = normal.xz * _WaveStrength * exp(-1 / _WaveAtten * dist);
    
    pos = pos * _NoiseScale + _WaveSpeed * _Time.y * _NoiseTex_TexelSize.xy;
    float centerHeight = SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, pos).r;
    float2 delta = float2(
        SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, pos + float2(_NoiseTex_TexelSize.x, 0)).r - centerHeight,
        SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, pos + float2(0, _NoiseTex_TexelSize.y)).r - centerHeight
    );
    delta /= _NoiseTex_TexelSize.xy;
    centerHeight *= _NoiseStrength  * exp(-1 / _WaveAtten * dist);
    normal.xz += centerHeight;
    return normalize(normal);
}
```

调用方法 float3 snormal = waveNormal(i.uv.xy, length(v.xz) / 10) ，第一个参数参入UV坐标，第二个控制波浪的起伏度传入该点与摄像机的距离，这样远处的法线比较平缓，不会出现摩尔纹。

![avatar](https://note.youdao.com/yws/api/personal/file/WEBf405df10ed4987a8d4137c0d9fdcf256?method=download&shareKey=63d8e15d9ef62d4910841cfadccaa3f6)

#### 2.颜色和边缘透明度
    水的基本颜色是越深的点颜色越重，越浅的地方接近于透明， 这里可以利用深度差的信息来类似判断水的深度。
    先将水面的渲染队列设置为透明（"Queue"="Transparent"），然后采样深度贴图并转换为视空间的Z轴位置接着与自身的在视空间的位置相减。
    
    颜色利用算出的深度差采样Ramp贴图，深度作为透明度。

```cpp
//顶点着色器
o.pos = TransformObjectToHClip(v.vertex.xyz);
o.screen = ComputeScreenPos(o.pos);

//片源着色器
float2 screenUV = i.screen.xy / i.screen.w;
float depthEye = LinearEyeDepth(SAMPLE_TEXTURE2D(_CameraDepthTexture, sampler_CameraDepthTexture, screenUV).r, _ZBufferParams);
float diffDepth = max(0, (depthEye - i.pos.w)) / _EdgeDepth; //_EdgeDepth控制边缘的范围
float4 diffColor = SAMPLE_TEXTURE2D(_WaterTex, sampler_WaterTex,float2(diffDepth, 0));
```
![avatar](https://note.youdao.com/yws/api/personal/file/WEBe472ccf3bc1ac56ffa87ae0c68ace638?method=download&shareKey=86021a2ee257285d5522b6a65745de9d)

#### 3.漫反射
    漫反射就是直接用的Lambert模型，点积光源方向和法线方向dot(lightDir, normal), 然后乘于颜色和灯光颜色;
```cpp

Light mainLight;
#if _MAIN_LIGHT_SHADOWS
     mainLight = GetMainLight(TransformWorldToShadowCoord(worldPos));
#else
     mainLight = GetMainLight();
#endif
float NDL = saturate(dot(worldNor, lightDir));
float3 diff = NDL *  mainLight.color * _Color.xyz * diffColor.rgb;
```
![avatar](https://note.youdao.com/yws/api/personal/file/WEB940966dccf8e26379ee534f87be56fc3?method=download&shareKey=619a0853fde9af853f9e2daf4150af73)

#### 4.高光
    高光模型这里用的是COOK-TORRANCE模型
> ![avatar](https://note.youdao.com/yws/api/personal/file/WEB3fe18ea42dfe92a74326bfe199277376?method=download&shareKey=7bb6d230c59f29860365c102f19ba552)
> F项用的是FresnelSchlick 近似菲涅尔
> G项用的是GeometrySmith 2013-UE4版本
> D项用的是GGX

```cpp
float DistributionGGX(float NoH, float a2)
{
	float d = ( NoH * a2 - NoH ) * NoH + 1; // 2 mad
	return a2 / ( PI*d*d );         // 4 mul, 1 rcp
}

float GeometrySchlickGGX(float NoV, float k)
{
    float nom = NoV;
    float denom = NoV * (1.0 - k) + k;
    return nom / denom;
}

float GeometrySmith(float NoV, float NoL, float k)
{
    float ggx1 = GeometrySchlickGGX(NoV, k);
    float ggx2 = GeometrySchlickGGX(NoL, k);
    return ggx1 * ggx2;
}

float FresnelSchlick(float cosTheta, float F0)
{
    return F0 + (1 - F0) * pow(1.0 - cosTheta, 5.0);
}

float D = DistributionGGX(NoH, _Roughness * _Roughness);
float G = GeometrySmith(NoV, NoL, pow(_Roughness + 1, 2) / 8);
float F = FresnelSchlick(LoH, F0);
float3 specular = D * G * F / (4 * NoV * NoL) * _SpecColor;

```

![avatar](https://note.youdao.com/yws/api/personal/file/WEB359311e2466b9cbfe2feddf7768f93d3?method=download&shareKey=4cd7daa227dfd712682c9ad9ef707b2a)

#### 4.天空盒反射
    天空盒反射直接采样unity_SpecCube0，然后normalize(reflect(-viewDir ,  worldNor)).xyz作为反射角度, _Roughness算出mipmap然后采样。
    利用F0作为反射率在漫反射和反射中守恒。

```cpp
real mip = PerceptualRoughnessToMipmapLevel(_Roughness);
float3 IndirSpecularBaseColor = SAMPLE_TEXTURECUBE_LOD(unity_SpecCube0, samplerunity_SpecCube0, normalize(reflect(-viewDir ,  worldNor)).xyz , mip).rgb ;
return float4(IndirSpecularBaseColor* (1 - F0) + diff*(F0) + specular,diffDepth);
```

![avatar](https://note.youdao.com/yws/api/personal/file/WEB8bf6fcd504c249fa8efe06eca025aabc?method=download&shareKey=eb0188bbcc486860cf9b46130223156b)

#### 5.物体反射
    物体反射的使用的是SSPR，流程大致是在Renderer Feature中设置参数调用CS代码，CS 代码计算出UV坐标然后反推世界空间坐标，
    接着判断是否高于水面，不高于水面的直接返回，高于水面的就将Y轴取反，取反完之后再将世界坐标推回UV坐标采样_CameraOpaqueTexture贴图，获取反射贴图。
    再利用CS代码将反射贴图的噪点填补掉， 填补的方法采样周围像素的，当前像素的alpha值不为0则用当前像素，为0则去周围像素找不为0的替之。

```C#
//C#脚本
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public class ScreenSpacePlannarReflection : ScriptableRendererFeature
{
    ScreenSpacePlannarReflectionPass pass;
    public ScreenSpacePlannarReflectionSetting setting = new ScreenSpacePlannarReflectionSetting();
    public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
    {


        if (renderingData.cameraData.camera.transform.eulerAngles.x > setting.MinView || renderingData.cameraData.camera.transform.eulerAngles.x < setting.MaxView)
        {
            for (int i = 0; i < setting.ReflectMats.Count; i++)
            {
                setting.ReflectMats[i].SetFloat("_ReflectToggle", 1);
            }
            renderer.EnqueuePass(pass);
        }
        else
        {
            for (int i = 0; i < setting.ReflectMats.Count; i++)
            {
                setting.ReflectMats[i].SetFloat("_ReflectToggle", 0);
            }
        }

        //renderer.EnqueuePass(pass);
    }

    public override void Create()
    {
        pass = new ScreenSpacePlannarReflectionPass(setting);
    }

}

public class ScreenSpacePlannarReflectionPass : ScriptableRenderPass
{
    ScreenSpacePlannarReflectionSetting m_Setting;
    static readonly int _SSPR_ColorRT_pid = Shader.PropertyToID("_MobileSSPR_ColorRT");
    static readonly int _SSPR_PosWSyRT_pid = Shader.PropertyToID("_MobileSSPR_PosWSyRT");
    RenderTargetIdentifier _SSPR_ColorRT_rti = new RenderTargetIdentifier(_SSPR_ColorRT_pid);
    RenderTargetIdentifier _SSPR_PosWSyRT_rti = new RenderTargetIdentifier(_SSPR_PosWSyRT_pid);
    ComputeShader cs;

    const int SHADER_NUMTHREAD_X = 8;
    const int SHADER_NUMTHREAD_Y = 8;

    int GetRTHeight()
    {
        return Mathf.CeilToInt(m_Setting.RT_height / (float)SHADER_NUMTHREAD_Y) * SHADER_NUMTHREAD_Y;
    }
    int GetRTWidth()
    {
        float aspect = (float)Screen.width / Screen.height;
        return Mathf.CeilToInt(GetRTHeight() * aspect / (float)SHADER_NUMTHREAD_X) * SHADER_NUMTHREAD_X;
    }

    public ScreenSpacePlannarReflectionPass(ScreenSpacePlannarReflectionSetting setting)
    {
        m_Setting = setting;
        cs = m_Setting.cShader;
    }

    public override void Configure(CommandBuffer cmd, RenderTextureDescriptor cameraTextureDescriptor)
    {
        renderPassEvent = RenderPassEvent.BeforeRenderingTransparents;

        base.Configure(cmd, cameraTextureDescriptor);

        RenderTextureDescriptor rtd = new RenderTextureDescriptor(GetRTWidth(), GetRTHeight(), RenderTextureFormat.Default, 0, 0);

        rtd.sRGB = false; //don't need gamma correction when sampling these RTs, it is linear data already because it will be filled by screen's linear data
        rtd.enableRandomWrite = true; //using RWTexture2D in compute shader need to turn on this

        //color RT
        rtd.colorFormat = RenderTextureFormat.ARGB32; //we need alpha! (usually LDR is enough, ignore HDR is acceptable for reflection)
        cmd.GetTemporaryRT(_SSPR_ColorRT_pid, rtd);

        rtd.colorFormat = RenderTextureFormat.RFloat;
        cmd.GetTemporaryRT(_SSPR_PosWSyRT_pid, rtd);
    }



    public override void Execute(ScriptableRenderContext context, ref RenderingData renderingData)
    {
        CommandBuffer cb = CommandBufferPool.Get("SSPR");

        int dispatchThreadGroupXCount = GetRTWidth() / SHADER_NUMTHREAD_X;
        int dispatchThreadGroupYCount = GetRTHeight() / SHADER_NUMTHREAD_Y;
        int dispatchThreadGroupZCount = 1;


        cb.SetComputeVectorParam(cs, Shader.PropertyToID("_RTSize"), new Vector2(GetRTWidth(), GetRTHeight()));
        cb.SetComputeFloatParam(cs, Shader.PropertyToID("_WaterHeight"), m_Setting.WaterHeight);

        cb.SetComputeFloatParam(cs, Shader.PropertyToID("_FadeOutScreenBorderWidthVerticle"), m_Setting.FadeOutScreenBorderWidthVerticle);
        cb.SetComputeFloatParam(cs, Shader.PropertyToID("_FadeOutScreenBorderWidthHorizontal"), m_Setting.FadeOutScreenBorderWidthHorizontal);

        Camera camera = renderingData.cameraData.camera;
        Matrix4x4 VP = GL.GetGPUProjectionMatrix(camera.projectionMatrix, true) * camera.worldToCameraMatrix;
        cb.SetComputeMatrixParam(cs, "_I_VPMatrix", VP.inverse);
        cb.SetComputeMatrixParam(cs, "_VPMatrix", VP);

        int kernel_MobilePathSinglePassColorRTDirectResolve = cs.FindKernel("ReflectOpaqueTex");
        cb.SetComputeTextureParam(cs, kernel_MobilePathSinglePassColorRTDirectResolve, "PosWSyRT", _SSPR_PosWSyRT_rti);
        cb.SetComputeTextureParam(cs, kernel_MobilePathSinglePassColorRTDirectResolve, "ColorRT", _SSPR_ColorRT_rti);
        //cb.SetComputeTextureParam(cs, kernel_MobilePathSinglePassColorRTDirectResolve, "PosWSyRT", _SSPR_PosWSyRT_rti);
        cb.SetComputeTextureParam(cs, kernel_MobilePathSinglePassColorRTDirectResolve, "_CameraOpaqueTexture", new RenderTargetIdentifier("_CameraOpaqueTexture"));
        cb.SetComputeTextureParam(cs, kernel_MobilePathSinglePassColorRTDirectResolve, "_CameraDepthTexture", new RenderTargetIdentifier("_CameraDepthTexture"));
        cb.DispatchCompute(cs, kernel_MobilePathSinglePassColorRTDirectResolve, dispatchThreadGroupXCount, dispatchThreadGroupYCount, dispatchThreadGroupZCount);

        cb.EnableShaderKeyword("_MobileSSPR");

        int kernel_FillHoles = cs.FindKernel("FillHoles");
        cb.SetComputeTextureParam(cs, kernel_FillHoles, "ColorRT", _SSPR_ColorRT_rti);
        cb.DispatchCompute(cs, kernel_FillHoles, Mathf.CeilToInt(dispatchThreadGroupXCount / 2f), Mathf.CeilToInt(dispatchThreadGroupYCount / 2f), dispatchThreadGroupZCount);


        cb.SetGlobalTexture(_SSPR_ColorRT_pid, _SSPR_ColorRT_rti);

        context.ExecuteCommandBuffer(cb);
        CommandBufferPool.Release(cb);  
    }
    public override void FrameCleanup(CommandBuffer cmd)
    {
        //cmd.ReleaseTemporaryRT(_SSPR_ColorRT_pid);
        //cmd.ReleaseTemporaryRT(_SSPR_PosWSyRT_pid);
    }
}

[System.Serializable]
public class ScreenSpacePlannarReflectionSetting
{
    [Header("Settings")]
    public float WaterHeight = 0.01f; //default higher than ground a bit, to avoid ZFighting if user placed a ground plane at y=0
    [Range(0.01f, 1f)]
    public float FadeOutScreenBorderWidthVerticle = 0.25f;
    [Range(0.01f, 1f)]
    public float FadeOutScreenBorderWidthHorizontal = 0.35f;

    [Header("Performance Settings")]
    [Range(128, 1024)]
    [Tooltip("set to 512 or below for better performance, if visual quality lost is acceptable")]
    public int RT_height = 512;

    public ComputeShader cShader;

    public List<Material> ReflectMats = new List<Material>();

    public float MinView;

    public float MaxView;
}

```
```cpp
// CS脚本
// Each #kernel tells which function to compile; you can have many kernels

#define NUMTHREAD_X 8
#define NUMTHREAD_Y 8
// Create a RenderTexture with enableRandomWrite flag and set it
// with cs.SetTexture
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

RWTexture2D<float> PosWSyRT;
RWTexture2D<half4> ColorRT;
Texture2D<half4> _CameraOpaqueTexture;
Texture2D<float> _CameraDepthTexture;

SamplerState PointClampSampler;
SamplerState LinearClampSampler;

float _WaterHeight;
float2 _RTSize;
float _ScreenLRStretchIntensity;
float _ScreenLRStretchThreshold;
float _FadeOutScreenBorderWidthVerticle;
float _FadeOutScreenBorderWidthHorizontal; 
float3 _CameraDirection;

float4x4 _VPMatrix; 
float4x4 _I_VPMatrix; 

float4 ConvertScreenIDToPosWS(uint2 id)
{
	float2 screenUV = float2(id.x / (_RTSize.x), id.y / (_RTSize.y));
	
	float inputPixelRawDepth = _CameraDepthTexture.SampleLevel(PointClampSampler, screenUV, 0);

	float4 posCS = float4(screenUV * 2.0 - 1.0, inputPixelRawDepth, 1.0);
#if UNITY_UV_STARTS_AT_TOP
    posCS.y = -posCS.y;
#endif
	float4 posHWS = mul(UNITY_MATRIX_I_VP, posCS);
	float3 posWS = posHWS.xyz / posHWS.w;

#if UNITY_REVERSED_Z
	return float4(posWS, inputPixelRawDepth <= 0.000001 ? 1 : 0);
#else
	return float4(posWS, inputPixelRawDepth >= 0.999999 ? 1 : 0);
#endif
	
// #if UNITY_REVERSED_Z
// 		float deviceDepth = _CameraDepthTexture.SampleLevel(PointClampSampler, screenUV, 0).r;
// #else
// 		float deviceDepth = _CameraDepthTexture.SampleLevel(PointClampSampler, screenUV, 0).r;
// 		deviceDepth = deviceDepth * 2.0 - 1.0;
// #endif
// 	return  ComputeWorldSpacePosition(screenUV, deviceDepth, unity_MatrixInvVP);
}

float3 MirrorPosWS(float3 inputPosWS)
{
	float3 reflectedPosWS = inputPosWS;
	// reflectedPosWS.y -= _WaterHeight;
	reflectedPosWS.y *= -1;//actual reflect action
	// reflectedPosWS.y += _WaterHeight;

	return reflectedPosWS;
}

float2 ConvertReflectedPosWSToScreenUV(float3 reflectedPosWS)
{
	float4 reflectedPosCS = mul(_VPMatrix, float4(reflectedPosWS, 1));
	float2 reflectedPosNDCxy = reflectedPosCS.xy / reflectedPosCS.w;

	float2 reflectedScreenUV = reflectedPosNDCxy * 0.5 + 0.5;

	float Threshold = _ScreenLRStretchThreshold;
	float Intensity = _ScreenLRStretchIntensity;

	float HeightStretch = (abs(reflectedPosWS.y - _WaterHeight));
	float AngleStretch = (-_CameraDirection.y);
	float ScreenStretch = saturate(abs(reflectedScreenUV.x * 2 - 1) - Threshold);

	reflectedScreenUV.x = reflectedScreenUV.x * 2 - 1;
	reflectedScreenUV.x *= 1 + HeightStretch * AngleStretch * ScreenStretch * Intensity;
	reflectedScreenUV.x = saturate(reflectedScreenUV.x * 0.5 + 0.5);
	
#if UNITY_UV_STARTS_AT_TOP
	reflectedScreenUV.y = 1.0 - reflectedScreenUV.y;
#endif

	return reflectedScreenUV;
}

half ConvertOpaqueColorRTScreenUVToFadeAlphaParam(float2 screenUV, float reflectedPosWSy)
{
	half fadeoutAlpha = smoothstep(1, 1-_FadeOutScreenBorderWidthVerticle, screenUV.y);
	fadeoutAlpha *= smoothstep(1, 1 - _FadeOutScreenBorderWidthHorizontal * -reflectedPosWSy, abs(screenUV.x * 2 - 1));
	return fadeoutAlpha;
}

#pragma kernel ReflectOpaqueTex

[numthreads(NUMTHREAD_X,NUMTHREAD_Y,1)]
void ReflectOpaqueTex(uint3 id : SV_DispatchThreadID)
{
    PosWSyRT[uint2(id.xy)] = 9999999;
    ColorRT[uint2(id.xy)] = half4(0,0,0,0);
    
	float4 posWST = ConvertScreenIDToPosWS(id);
	float3 posWS = posWST.xyz;

	if(posWS.y <= _WaterHeight || posWST.w == 1)
		return;

	float3 reflectedPosWS = MirrorPosWS(posWS);

	float2 reflectedScreenUV = ConvertReflectedPosWSToScreenUV(reflectedPosWS);

	float2 earlyExitTest = abs(reflectedScreenUV - 0.5);
	if (earlyExitTest.x >= 0.5 || earlyExitTest.y >= 0.5) 
		return;
	uint2 reflectedScreenID = reflectedScreenUV * _RTSize;
	// reflectedScreenID = id.xy;
	// reflectedScreenID.y = _RTSize.y-reflectedScreenID.y;


	if(posWS.y < PosWSyRT[reflectedScreenID])
	{
		float2 screenUV = id.xy / _RTSize;
		half3 inputPixelSceneColor = _CameraOpaqueTexture.SampleLevel(LinearClampSampler, screenUV, 0).rgb;
		half qwe = _CameraDepthTexture.SampleLevel(LinearClampSampler, screenUV, 0).r;

		half fadeoutAlpha = ConvertOpaqueColorRTScreenUVToFadeAlphaParam(screenUV, reflectedPosWS.y);

		half4 color = half4(inputPixelSceneColor,fadeoutAlpha);
		color.a = saturate(color.a);
		// qwe = mul(UNITY_MATRIX_I_VP, _VPMatrix)._m00;
		ColorRT[reflectedScreenID] = color;
		PosWSyRT[reflectedScreenID] = posWS.y;
		
	}
}

#pragma kernel FillHoles

[numthreads(NUMTHREAD_X, NUMTHREAD_Y, 1)]
void FillHoles(uint3 id : SV_DispatchThreadID)
{
	//fill holes inside each 2*2
	id.xy *= 2;

	//cache read
	half4 center = ColorRT[id.xy + uint2(0, 0)];
	half4 right = ColorRT[id.xy + uint2(0, 1)];
	half4 bottom = ColorRT[id.xy + uint2(1, 0)];
	half4 bottomRight = ColorRT[id.xy + uint2(1, 1)];

	half4 left = ColorRT[id.xy + uint2(0, -1)];
	half4 up = ColorRT[id.xy + uint2(-1, 0)];
	half4 bottomLeft = ColorRT[id.xy + uint2(-1, -1)];

	float temp = 0.1;
	//find best inside 2*2
	half4 best = center;
	best = right.a > best.a + temp ? right : best;
	best = bottom.a > best.a + temp ? bottom : best;
	best = bottomRight.a > best.a + temp ? bottomRight : best;
	
	best = left.a > best.a + temp ? left : best;
	best = up.a > best.a + temp ? up : best;
	best = bottomLeft.a > best.a + temp ? bottomLeft : best;

	//write better rgba
	ColorRT[id.xy + uint2(0, 0)] = best.a > center.a + temp ? best : center;
	ColorRT[id.xy + uint2(0, 1)] = best.a > right.a + temp ? best : right;
	ColorRT[id.xy + uint2(1, 0)] = best.a > bottom.a + temp ? best : bottom;
	ColorRT[id.xy + uint2(1, 1)] = best.a > bottomRight.a + temp ? best : bottomRight;

	ColorRT[id.xy + uint2(0, -1)] = best.a > left.a + temp ? best : left;
	ColorRT[id.xy + uint2(-1, 0)] = best.a > up.a + temp ? best : up;
	ColorRT[id.xy + uint2(-1, -1)] = best.a > bottomLeft.a + temp ? best : bottomLeft;
}

```

    Shader 代码中使用屏幕UV采样刚刚CS生成的反射贴图，直接用屏幕坐标采样的反射贴图不会动，则再加上法线的变化。

```cpp

float2 reflectUv = screenUV + worldNor.xz * (0.1) ; // 0.1是让波动不那么大
float4 reflectTex = SAMPLE_TEXTURE2D(_MobileSSPR_ColorRT, sampler_point_clamp_MobileSSPR_ColorRT, reflectUv) * diffDepth * _ReflectToggle;
```

![avatar](https://note.youdao.com/yws/api/personal/file/WEBfda6fe20af843141a9c95ace45119e7e?method=download&shareKey=f9db181c54a4a608f0acf9df1f6a7b1d)

#### 6.岸边浪花
    想让浪花不连续，需要worldPos.xz的方向性然后乘UV坐标，sin函数则可以让浪花动起来以及控制浪花密集度。
    大致算法如下：

```cpp
float foamTex = SAMPLE_TEXTURE2D(_WaveTex, sampler_WaveTex, worldPos.xz * i.noiseUV.zw);
float sinT = saturate(sin((diffDepth1  - _Time.y * _FoamSpeed) * 2 * 3.14));
float foam = (1 -  step( sinT * (1.0 - diffDepth1) + 0.01, foamTex) * _FoamToggle);
```
![avatar](https://note.youdao.com/yws/api/personal/file/WEB6f9f8de74fe87d3673d5e0c4c3d28eb5?method=download&shareKey=17782838c912a213880ad20809e5d2fe)

#### 7.焦散
    采样Caustic贴图两次，一个是UV的x轴移动，一个是XY轴都移动。
    减去diffDepth * _CausticScale是用来控制焦散的密集度，看来越深的地方焦散越长。
    然后获取两个贴图最小值作为焦散，用lerp函数越深处焦散越淡，有浪花的地方就不显示焦散了。

```cpp
float4 caustic1 = SAMPLE_TEXTURE2D(_CausticTex, sampler_CausticTex, float2(i.uv.x + _Time.x * 0.1, i.uv.y) - diffDepth * _CausticScale);
float4 caustic2 = SAMPLE_TEXTURE2D(_CausticTex, sampler_CausticTex, i.uv.xy - _Time.xx * 0.2 - diffDepth * _CausticScale);
float4 causticTemp = min(caustic1.rrrr, caustic2.rrrr);
float4 c = foam == 1 ? float4(0,0,0,0) : lerp(causticTemp.rgba, float4(0,0,0,0), diffDepth1);
```

![avatar](https://note.youdao.com/yws/api/personal/file/WEBe1b09a760c15a5238e0eb3b5cf045dce?method=download&shareKey=22ed15076a09e3971bbc6c1ac119fef4)

#### 8.交互
    交互可以制作粒子特效，粒子特效包涵法线和移动生成粒子，再拿一个摄像机照它生成RT，最后再水面的shader里面采样他再做混合和效果。
    这里做了比较简单的处理，用粒子特效代替，不用RT了。
    
![avatar](https://note.youdao.com/yws/api/personal/file/WEB4a428f2a91eccd1745f8d4f944bcc765?method=download&shareKey=c1aad0eb7a0c4f40193b6fc7a4205de8)

#### 引用
参考的太多了把主要和还记得的写进来
1. <https://zhuanlan.zhihu.com/p/95917609> 
2. <https://zhuanlan.zhihu.com/p/179249031> 
3. <https://github.com/ColinLeung-NiloCat/UnityURP-MobileScreenSpacePlanarReflection> --SSPR反射
4. <https://halisavakis.com/my-take-on-shaders-stylized-water-shader/> -- 浪花
5. <https://zhuanlan.zhihu.com/p/434253483> --焦散