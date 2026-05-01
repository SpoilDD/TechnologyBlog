---
title: "草的渲染"
description: "用GPUInstancing去实例化模型草，相机制作RT做交互"
pubDate: 2023-02-28
tags: ["Shader", "Pipeline"]
category: shader
icon: "α"
---
[toc]
# 思路
这篇想制作的是NPR的草，大致的思路是选用分块保存草的信息、 四叉树和ComputerShader剔除、 GPUInstancing加LOD解决渲染数量的问题、渲染选择模型草 + 草尖高光 + 采样地图颜色 + 整体高光、交互信息用ComputerShader存在贴图里面再去Shader里面采样。
# 1.草的信息
## 1.1四叉树
&emsp;&emsp;空间管理比较好的选择就是四叉树，比如场景里面有很多个草，想要对某个草进行操作的话，直接遍历怕是一个不好的选择。所以要是用四叉树管理的话，操作对象起来会比较节省时间。
&emsp;&emsp;四叉树管理场景的大致就是讲空间分块，一块下面又划分四块，类似下图这样。
![avatar](https://note.youdao.com/yws/api/personal/file/WEBf63fdd8923241fa387bb70e6d16c0d5d?method=download&shareKey=a0e55cfd13bc2d78d4bba912baeacc82)
接着需要定义最小的树，这边定义长度小于等于32就不继续划分了，然后每个树里面用列表存储需要管理的信息。[四叉树详细逻辑](https://zhuanlan.zhihu.com/p/415126612)
## 1.2信息保存
&emsp;&emsp;信息的存储用的方法是分块，将空间分成128大小的正方形，然后将该区域的草按四叉树进行管理，接着遍历四叉树里面存的草的信息（世界坐标）生成两个list，一个list是该区域的所有草，这个list是几万的长度，另一个list是记录每个四叉树在第一个list索引范围。
&emsp;&emsp;打个比方：某个区域有1000个草，平均每个树存着25个草的坐标，先将这个1000个草按四叉树划分，然后遍历这个四叉树，遍历第一个的四叉树添加到第一个list里面，此时list的范围为0-24，而第二个list索引1存储min 0, max 24。遍历第二个的四叉树添加到第一个list里面，此时list的范围为0-49，而第二个list索引2存储min 25, max 49,以此类推。然后使用Unity自带的ScriptableObject存储，可视化比较就用了这个。
```c#
public class MinMaxIndex
{
    public int max;
    public int min;
}
public List<Vector4> pos = new List<Vector4>();
public List<MinMaxIndex> range = new List<MinMaxIndex>();
```

## 1.3草刷
&emsp;&emsp;草的生成可以才用密度图去生成，不过这边采用的手动刷草的方法。草刷功能有刷草范围，控制草的高度，除草。
![avatar](https://note.youdao.com/yws/api/personal/file/WEBeb17b7cb2d76e84f1f7c1dca6ddca862?method=download&shareKey=36422f919de215328544416e2f4b2a01)
&emsp;&emsp;画刷半径是正方形的边，草的预设是正方形的所以草刷也是方形的。LayerMask是对应的层才可以在上面刷草，刷草的时候生成草的位置是基于画刷生成的，然后加了一点随机的偏移，让草看起来不那么整齐，然后保存的是世界坐标Vector3，再加一个维度控制草的高度，所以就用了Vector4存储了，草的高度也做了一点随机偏移。控制高度就是可以修改草的高度，保存在Vector4的最后一个分量里面。场景信息会显示 当前修改的是哪个区域。
&emsp;&emsp;刷草时会基于scene摄像机的位置去加载周围9个区域的草，利用GPUInstancing直接显示没有做剔除，这样做在电脑上消耗也不算大。草的管理是用四叉树，操作起来会比较方便。草刷的实现整体比较简单。这边草是选择了模型草，没有选择面片草。
![avator](https://note.youdao.com/yws/api/personal/file/WEB7e452bc4283c48c594dd86e0d64569b6?method=download&shareKey=793cf69acc09508e1fcee4436cc8efb9)
# 2.草的剔除
## 2.1加载
&emsp;&emsp;刚刚说了草的是按 块/区域 存储的，加载的时候会根据传进来的相机位置加载周围的9个区域，每个加载进来之后生成对应的四叉树，因为存储的时候就是遍历四叉树存储的，所以加载四叉树的时候可以判断第二个list里面的min位置，直接将其范围的都存储到对应的树中。
![avator](https://note.youdao.com/yws/api/personal/file/WEB15cda997cf630acce133f697b1e4c367?method=download&shareKey=004cf6464a6fa20a765c73f77deeaa4b)
&emsp;&emsp;上图的是草存储方式 MapInfo + X + _ + Z，例如MapInfo-1_-1的意思是坐标（-126，Y，-126）到（0，Y，0）这个区域的信息。然后加载周围九个的时候会存储中的区域的索引，如下图存的是0,0那么下次获取的还是0,0就不需要去更新周围的MapInfo了。整个加载和处理数据的过程开一个线程去处理，会更快一些。
![avatar](https://note.youdao.com/yws/api/personal/file/WEBbb00e14aba2a4439825640cbafd6558b?method=download&shareKey=192ec0c3aaefad6585dc77151b66b2f2)
## 2.2剔除（四叉树与ComputeShader）
&emsp;&emsp;四叉树里面会存着minRange和maxRange都是vector3，用来判断每个树的范围，好做剔除。剔除的方法主要用的是Unity自带的GeometryUtility.CalculateFrustumPlanes获取视锥范围和Bounds设置四叉树范围，然后用GeometryUtility.TestPlanesAABB来判断是否在摄像机内。判断完会将所有的草合成一个instanceList，这里的四叉树会频繁清理和创建，需要用对象池配合处理。
```C#
Plane[] planes = new Plane[6];//保存视锥范围
float tempFar = camera.farClipPlane;
camera.farClipPlane = MaxCamreaDisatance;//设置摄像机的正向最远距离
GeometryUtility.CalculateFrustumPlanes(camera, planes);
camera.farClipPlane = tempFar;

private Bounds tempBounds = new Bounds();//设置四叉树范围
tempBounds.min = qt.minRange;
tempBounds.max = qt.maxRange;
if (GeometryUtility.TestPlanesAABB(planes, tempBounds))//判断情况
{
    instanceList.Add(pos)// 添加的到渲染list里面
}
```
MaxCamreaDisatance 是设置草在摄像机前向的距离，因为摄像机默认都看的比较远，而草考虑不需要那么远的距离。
整体剔除完如下：
![avatar](https://note.youdao.com/yws/api/personal/file/WEB70ab0fd8f7991f3688b8ee445358bd34?method=download&shareKey=2d3767fac04d281239b689ec21087b3a)

&emsp;&emsp;还需要用ComputeShader做进一步的剔除，主要把摄像机外的顶点都剔除了，减少渲染压力。主要是将刚刚四叉树剔除完的instanceList放进 ComputerShader中，然后将坐标变换到裁剪空间中，我这边只判断了X和Z两轴的范围，然后将索引存进列表中。[ComputerShder基本了解](https://zhuanlan.zhihu.com/p/368307575)
```C
#pragma kernel CullGrass

float4x4 _VPMatrix;
float _MaxDrawDistance;
StructuredBuffer<float4> _AllGrassPos;
AppendStructuredBuffer<uint> _VisibleGrassPos;
uint _MaxCount;

[numthreads(64,1,1)]
void CullGrass (uint3 id : SV_DispatchThreadID)
{
    if (id.x * 1024 + id.y > _MaxCount) return;
    float4 absPosCS = abs(mul(_VPMatrix,float4(_AllGrassPos[id.x * 1024 + id.y].xyz,1.0)));
    
    // if (absPosCS.z <= absPosCS.w && absPosCS.y <= absPosCS.w && absPosCS.x <= absPosCS.w *1.5 && absPosCS.w <= _MaxDrawDistance)
    if (absPosCS.z <= absPosCS.w && absPosCS.x <= absPosCS.w *1.2 && absPosCS.w <= _MaxDrawDistance)
    {
        _VisibleGrassPos.Append(id.x * 1024 + id.y);
    }
}
```
&emsp;&emsp;这里用W的分量去判断是因为变换完之后W分量存储的是视空间下的Z分量，透视除法（就是用裁剪空间的W分量去除XYZ）之后XYZ在[-1,1]的立方体，不在这个范围内的都不渲染，所以直接W去判断就行了。W分量还乘了一个倍数，因为传进去的坐标是一个模型草的世界坐标，草也有范围。id的X分量乘1024因为开了X维度1024个线程去跑。_MaxCount是_AllGrassPos的长度
```


ComputeBuffer positionBuffer = new ComputeBuffer(instanceList.Count, sizeof(float) * 4);
positionBuffer.SetData(instanceList);
cullGrassCS.SetBuffer(cullGrassKernel, "_AllGrassPos", positionBuffer);
cullGrassCS.SetBuffer(cullGrassKernel, "_VisibleGrassPos", visibleBuffer);
cullGrassCS.SetMatrix("_VPMatrix", camera.projectionMatrix * camera.worldToCameraMatrix);
cullGrassCS.SetFloat("_MaxDrawDistance", MaxCamreaDisatance);
cullGrassCS.Dispatch(cullGrassKernel, Mathf.CeilToInt(1024 / 64f), 1024, 1);
cullGrassCS.SetInt("_MaxCount", instanceList.Count);
```
&emsp;&emsp;C#代码就是常规的设置参数，这里开了（1024，1024,1）的数量是为了下面的草的交互信息信息贴图。shader代码需要把全部草的instanceList和存着剔除完的list设置进去，然后shader里面利用SV_InstanceID发送进来的ID去读取剔除完的list，拿到值后再去读取存着全部草的listinstanceList就能拿到草的世界坐标了。
![avatar](https://note.youdao.com/yws/api/personal/file/WEB7c1a75eeaa8b7c53996eb2667a2ecb0c?method=download&shareKey=bdc521c25547739f317878d30883eec7)

最后还可以用[Hi-Z](https://zhuanlan.zhihu.com/p/278793984)继续剔除，有机会再补上。
## 2.3LOD
&emsp;&emsp;Lod我没有找到特别好的办法，就是利用几段距离去在Computer里面判断，然后添加在几个list里面。举个例子：距离摄像机正前方10米的草添加到ListLod1中，10米到20米距离添加到ListLod2中。然后再用两个材质和两个网格去利用Graphics.DrawMeshInstancedIndirect渲染它。
```
#pragma kernel CullGrass

float4x4 _VPMatrix;
float _MaxDrawDistance;
float _Lod0Distance;
StructuredBuffer<float4> _AllGrassPos;
AppendStructuredBuffer<uint> _VisibleGrassPos;
AppendStructuredBuffer<uint> _VisibleGrassLodPos;
uint _MaxCount;


[numthreads(64,1,1)]
void CullGrass (uint3 id : SV_DispatchThreadID)
{
    if (id.x * 1024 + id.y > _MaxCount) return;

	float4 absPosCS = abs(mul(_VPMatrix,float4(_AllGrassPos[id.x * 1024 + id.y].xyz,1.0)));
    
    // if (absPosCS.z <= absPosCS.w && absPosCS.y <= absPosCS.w && absPosCS.x <= absPosCS.w *1.5 && absPosCS.w <= _MaxDrawDistance)
    if (absPosCS.z <= absPosCS.w && absPosCS.x <= absPosCS.w *1.2 && absPosCS.w <= _MaxDrawDistance)
    {
        if (_Lod0Distance > absPosCS.w)
		    _VisibleGrassPos.Append(id.x * 1024 + id.y);
        else
		    _VisibleGrassLodPos.Append(id.x * 1024 + id.y);
    }
}

```
&emsp;&emsp;C#处理就是准备两份Material和两份存储索引的List和两份DrawMeshInstancedIndirect的参数。
```c#
visibleBuffer.SetCounterValue(0);//设置ComputeBuffer里面的计数器为0
lod0Buffer.SetCounterValue(0);//设置ComputeBuffer里面的计数器为0
cullGrassCS.SetBuffer(cullGrassKernel, "_AllGrassPos", positionBuffer);//设置所有草list的ComputerBuffer
cullGrassCS.SetBuffer(cullGrassKernel, "_VisibleGrassPos", visibleBuffer);//设置存储lod0的Buffer
cullGrassCS.SetBuffer(cullGrassKernel, "_VisibleGrassLodPos", lod0Buffer);//设置存储lod1的Buffer
mat.SetBuffer("_AllPos", positionBuffer);//将所有草的Buffer设置进shader里面
mat.SetBuffer("_VisiblePos", visibleBuffer);//将草的要渲染的lod0设置进shader里面
ComputeBuffer.CopyCount(visibleBuffer, argsBuffer, 4);//将visibleBuffer这个里面的数据长度相当于list.count设置进argsBuffer里面。
Graphics.DrawMeshInstancedIndirect(mesh, 0, mat, bounds, argsBuffer);//渲染网格1
//下方类似
lod0ArgsBuffer.SetData(lod0Args);
mat0.SetBuffer("_AllPos", positionBuffer);
mat0.SetBuffer("_VisiblePos", lod0Buffer);
ComputeBuffer.CopyCount(lod0Buffer, lod0ArgsBuffer, 4);
Graphics.DrawMeshInstancedIndirect(mesh0, 0, mat0, bounds, lod0ArgsBuffer);//渲染网格2
```
# 3.草的渲染
## 3.1CPU Instancing
&emsp;&emsp;CPU Instancing通常用于渲染同一个网格很多次，比如一个正方体要渲染1万次，要是直接生成1万个网格会drawcall很多次，但是使用CPU Instancing可以一次完成。原理是传递一个网格和材质，然后制定绘制次数Unity就会在GPU的constant buffer申请内存，然后一个渲染多次。Unity提供的方式我了解到的有两种：
1.直接写在shader中，添加对应的shader代码然后再场景中生成GameOject使用该shader。 
2.代码中使用[Graphics.DrawMeshInstancedIndirect](https://docs.unity3d.com/ScriptReference/Graphics.DrawMeshInstancedIndirect.html)和[Graphics.DrawMeshInstanced](https://docs.unity3d.com/ScriptReference/Graphics.DrawMeshInstanced.html)
&emsp;&emsp;这边使用的是Graphics.DrawMeshInstancedIndirect方法渲染。渲染的材质里面需要有个数组（_AllPos）存储所有的世界坐标，和要显示的数组（_VisiblePos）坐标，C#传进shader再做处理。
## 3.2基本光照
&emsp;&emsp;首先需要构建草的模型，随便拉几个面片然后组合在一起就好了。高的lod就把相对矮的面片去掉。整体的范围在1平方米内，高度0.5米左右。
![avatar](https://note.youdao.com/yws/api/personal/file/WEB99505b138d42da6d3486445a94799b5a?method=download&shareKey=e873c66a9248afc5b24b36211c5f28d4)
&emsp;&emsp;基本的颜色采样地形的图片，做到每个面片都是纯色的，所以一个面片所有的顶点都要采样同一个像素才行，这样就要把一个面片的坐标都存在顶点色然后在顶点着色器采样。这里大部分光照都是在顶点着色器处理，更省一些。将每个面片都存同一个坐标的做法是利用MaxScript去刷的，执行下面代码可以处理。
```AppleScript
fn UniteVecPosOnColor = --定义函数
(--边和边缘不是一个概念
    if (Filters.Is_EditPoly()) do --判断是不是可编辑网格
    (
    
        local theNode = selection[1]--获取当前选择的物体
        local theEditObj = modPanel.getCurrentObject()--获取当前物体的组件
    
        if ((classof theEditObj) != UndefinedClass) then -- 不等于null就继续
        (
            local Verts = polyOp.getNumVerts theEditObj--获取网格的顶点数量
            local Faces = polyOp.getNumFaces theEditObj--获取网格的面数
            local Edges = polyOp.getNumEdges theEditObj--获取网格的边
            local isOverEdge = #()--保存处理过的边
            
            for edge = 1 to Edges do--遍历每条边
            (
                local borders = polyOp.getBorderFromEdge theEditObj Edge --获取边缘连接的所有边
                local bordersArray = borders as Array--转化成数组
            
                if bordersArray[1] != undefined and isOverEdge[bordersArray[1]] == undefined then
                (
                    join isOverEdge bordersArray--处理过的边进入数组
                  
                    local VertsByEdges = polyOp.getVertsUsingEdge theEditObj borders--获取边缘使用的所有的顶点
                    local minYPos = [0,0,999]--获取Z轴最低的点作为统一的位置
        
                    for vert in VertsByEdges do --遍历边缘所有的边
                    (
                        local vPos = polyOp.getVert theNode vert--获取顶点位置
                        if minYPos.z > vPos.z then--判断Z轴最低的点
                            minYPos = vPos
                    )
        
                    minYPos.x *= -1 --取反是因为Unity的空间和Max的空间不一样
                    minYPos.y *= -1
                    local vColor = minYPos + [128,128,128] as color --类似法线一样处理下，不存负值
                    polyop.setVertColor theNode 0 VertsByEdges vColor --将值设置进去
                )
            )
        )
    )
    return "over"
)
UniteVecPosOnColor()--调用函数
```
shader里面顶点着色器获取然后转换：
```C

struct appdata
{
    float4 vertex : POSITION;
    float2 uv : TEXCOORD0;
    float3 normal : NORMAL;
    float4 color : COLOR;
};

CBUFFER_START(UnityPerMaterial)
    StructuredBuffer<float4> _AllPos;
    StructuredBuffer<uint> _VisiblePos;
    float _IsCSCull;//是否剔除
CBUFFER_END

v2f vert (appdata v, uint instanceID : SV_InstanceID)
{
    float3 localPos = v.vertex.xyz;
    float4 data = _IsCSCull == 1 ? _AllPos[_VisiblePos[instanceID]] : _AllPos[instanceID];//保存的世界坐标
    float3 unitPos = (float3(v.color.r, v.vertex.y, v.color.g) * 255 - 128) / 100; 
    float3 unitPosWorld = unitPos + data.xyz;//统一之后的世界坐标
}
```
接着采样基本色，这里使用的场景是1024*1024所以采样的时候分别做了变换。接着计算间接光和漫反射，这里间接光直接采样SH0阶再乘基本色，漫反射则是利用法向都向上去计算然后乘光照颜色和基本色。
```C
    float2 uv = TRANSFORM_TEX((unitPosWorld.xz + float2(512, 512)) / float2(1024, 1024), _MapTex);
    float4 mapColor = tex2Dlod(_MapTex, float4(uv,0,0));
    
    Light mainLight;
#if _MAIN_LIGHT_SHADOWS
    mainLight = GetMainLight(TransformWorldToShadowCoord(unitPosWorld));
#else
    mainLight = GetMainLight();
#endif
    float ndl = dot(float3(0,1,0), mainLight.direction); 
    //间接光加漫反射
    half3 lightingResult = mapColor.rgb * SampleSH(2) + mainLight.color * mapColor.rgb * mainLight.shadowAttenuation * ndl;
```
然后利用统一后的世界坐标制作噪声来让草做点明暗的变化。
```
float whiteNoise(float2 uv,int seed)
{
    float r = frac(sin(dot(uv,float2(seed + 12.9898,seed + 78.233)))*43758.5453);
    return r;
}

v2f vert (appdata v, uint instanceID : SV_InstanceID)
{
    float noise = whiteNoise(unitPosWorld.xz, 0);
    o.color.rgb = lightingResult * (noise / 10 + 0.9);
}
```
最后输出的颜色和地面非常像：
![avatar](https://note.youdao.com/yws/api/personal/file/WEBfd62273c0c4cbf1edd766a565266f84f?method=download&shareKey=6ffc8b50664be2bf6d3d2db8a77f0618)
## 3.3整体高光
&emsp;&emsp;整体高光是草尖高光加blinn-phong高光，草尖的高光放在了像素着色器里面执行，这样效果比较柔和。blinn-phong高光将法线变成向上的去计算，然后根据模型坐标下Y轴去混合。需要摆下UV，直接将顶点放置0-1之间。
![avatar](https://note.youdao.com/yws/api/personal/file/WEBfb8327c5c657a5172f3d25231ce42456?method=download&shareKey=1d1d8db249855248032bf8ebcd1a89b6)
```C
half3 DirectLight(Light light, half3 N, half3 V, half3 albedo, half positionOSY)
{
    half3 H = normalize(light.direction + V);
    
    float directSpecular = saturate(dot(N,H));
    directSpecular *= directSpecular;
    directSpecular *= directSpecular;
    directSpecular *= directSpecular;
    directSpecular *=  _GlossValue * positionOSY * light.shadowAttenuation;

    return half3(directSpecular,directSpecular,directSpecular); 
}

// 高光
lightingResult += lightingResult * DirectLight(mainLight, float3(0,1,0), viewDir, o.color.rgb, v.uv.y) * _DiffuseToggle;
```
把高光在顶点着色相加，在像素着色器直接输出，效果如下：
![avatar](https://note.youdao.com/yws/api/personal/file/WEBaf4b179dff6772440ea44a5bc14b8754?method=download&shareKey=1728b32326d81fbeec738e9bc725b203)
草尖的高光是利用UV的Y方向去算的，然后利用噪声把部分草的高光去掉
```C
float4 frag (v2f i) : SV_Target
{
    float hightLight = i.uv.y * i.uv.y;

    hightLight *= hightLight;   
    hightLight *= hightLight;
    hightLight *= i.color.w;
    return i.color + i.color * hightLight;
}
```

![avatar](https://note.youdao.com/yws/api/personal/file/WEB43b97b1b08d20b0ff715a2358380aea0?method=download&shareKey=3f95577fb6c22abb311ec668d5bcb59a)
最后再混合下地面的颜色，混合系数是模型空间下Y轴坐标,这样就完成比较简洁的光照渲染。
```C

float4 frag (v2f i) : SV_Target
{
    i.color.rgb = lerp(i.mapColor.rgb, i.color.rgb, t);
    return i.color + i.color * hightLight;
}
```
![avatar](https://note.youdao.com/yws/api/personal/file/WEBcd46ee477d0d4ea68a89af7f52d4a407?method=download&shareKey=8cffa61a3eac30f78052f5c39dc58e2a)
# 4.草的交互
## 4.1人物交互
&emsp;&emsp;与人交互没有用RT，用了比较简单的判断位置，然后做出顶点的位置变换,这里要用修改后统一的位置，不然因为顶点位置不用会导致草片发生形变。
```C
float dis = distance(_RolePos.xyz,unitPosWorld);//选出与人的距离
float circle = saturate((1 - dis + _InteractiveRadius) * _InteractiveStren * objectY);--变换至离人物越近circle越大，Y轴越低circle越小
float2 interDir = normalize(unitPosWorld.xz - _RolePos.xz);算出影响的方向

v.vertex.xz += interDir * circle;
v.vertex.y -= circle;
```
![avatar](https://note.youdao.com/yws/api/personal/file/WEB32bfe4ee7cbdb0075875491470ed6ab5?method=download&shareKey=d8947695637c88070a67594a5ced5beb)
## 4.2燃烧
&emsp;&emsp; 烧草比较难处理的是判断烧了那块区域和在哪里生成火焰粒子。烧了那块区域用的是RT去存储，在ComputeShader里面将对应的世界坐标映射到纹理坐标里面，然后判断影响的范围后记录值到RT里面。粒子的位置也是在ComputeShader计算然后用ComputeBuffer存储，然后再C#代码里获取生成。
```C

[numthreads(64,1,1)]
void CullGrass (uint3 id : SV_DispatchThreadID)
{ 
    uint2 uv = ceil(_FirePos.xz + uint2(512, 512));//火的位置映射到纹理
    if (uv.x > 1024 || uv.x < 0 || uv.y > 1024 || uv.y < 0) return;//超过纹理范围就返回

    float dis = distance(uv , id.xy);//计算纹理和火位置
    _GrassInfoRT[id.xy] = ((_GrassInfoRT[id.xy].x < 1 && _GrassInfoRT[id.xy].x > 0) ? _GrassInfoRT[id.xy] + float4(0.001,0,0,0) : _GrassInfoRT[id.xy]);//要是纹理在0-1范围里就说明此纹理在渐变中，模拟草慢慢被烧黑

    if (id.x * 1024 + id.y <= _MaxCount) //纹理UV数量大于所有草的数量就不处理
    {
        float4 absPosCS = abs(mul(_VPMatrix,float4(_AllGrassPos[id.x * 1024 + id.y].xyz,1.0)));//计算草的裁剪坐标

        dis = distance(ceil(_AllGrassPos[id.x * 1024 + id.y].xz) , ceil(_FirePos.xz));//计算火和草的距离在世界坐标下
        if(_IsInFire && dis < 2 && _GrassInfoRT[id.xy].r == 0)//圆形处理，判断范围小于两米就被烧了
        {
            _FireList.Append(id.x * 1024 + id.y);//记录被烧草的索引
        }
        
        if (absPosCS.z <= absPosCS.w && absPosCS.y <= absPosCS.w * 3 && absPosCS.x <= absPosCS.w *2 && absPosCS.w <= _MaxDrawDistance)//剔除视锥外的草
        {
            if (_Lod0Distance > absPosCS.w)
                _VisibleGrassPos.Append(id.x * 1024 + id.y);
            else
                _VisibleGrassLodPos.Append(id.x * 1024 + id.y);
        }
    }
    
    if (_IsInFire)//触发烧草
        _GrassInfoRT[id.xy] = (dis < 2 && _GrassInfoRT[id.xy].x == 0) ? float4(0.1,0,0,1) : _GrassInfoRT[id.xy];//标记烧草的位置
    
}
```
&emsp;&emsp;因为纹理都是像素的，要是直接用每个顶点坐标去采样的话，计算取来的被烧的区域会非常规则，所以改用一个整颗草的位置去采样，这样会比较不规则。
```C
float4 grassInfoTex = tex2Dlod(_GrassInfoTex, float4(ceil(data.xz + float2(512, 512)) / 1024,0,0));//对用ComputeShader里面的处理，这样能采样对应的像素
mapColor.rgb = lerp(mapColor.rgb, _BurnColor.rgb, grassInfoTex.r);  //将此颜色作为纯色放进去算间接光和漫反射
```
整体效果如下：
![avatar](https://note.youdao.com/yws/api/personal/file/WEBd6b4e7f8411fd834e2b4958ab84f27c7?method=download&shareKey=eba26013726c9593f9f3ab1c7c719204)
## 4.3风场
&emsp;&emsp;风场的制作是利用空间坐标的XZ加上Time拉了一个Sin函数，在每个参数上加上了变量控制模拟风场,然后乘了Y轴坐标保证了约靠近地面的位置摆动越小，把算出的Wind加载射界坐标的XZ上。
```C

float Wind(float3 vertex)
{
    float wind = 0;
    wind += (sin(_Time.y * _WindFrequency + vertex.x * _WindTiling.x + vertex.z * _WindTiling.y)*_WindWrap.x+_WindWrap.y) * _WindIntensity; //windA
    wind *= vertex.y;
    return wind;
}
```
![avatar](https://note.youdao.com/yws/api/personal/file/WEB101408e89503b5e173d00f9e3c0a158e?method=download&shareKey=bc57abd07b293f4859ae9149a2145f26)
# 5.需完善
&emsp;&emsp;多层地形：这里只用了XZ去存储草的位置，要是在地形山洞这些很多层的地形要加上Y中去存储和加载处理。
&emsp;&emsp;多个人物：这里用的是点进去判断，一个人还好处理，要是多个人每增加一个每个顶点就需要多处理一次这样的逻辑，最好要用RT去处理，记录每个人行走的位置，然后用类似"画刷"的方法将法线的偏移记录上去，然后在Shader里面采样做处理。
&emsp;&emsp;花的点缀：一眼看过去全是草看起来非常单调，需要加点花这样的点缀，处理的方法跟草也比较类似，但是花的位置要比草高一些，不然容易穿模且非常明显。
&emsp;&emsp;地面：这个里面没有对地面做很多处理，直接用了贴图加Blinn-Phong模型去制作，看起来和地面非常近似，地面的渲染最好和草的渲染模型一样，这样看起来会更适合不突兀，加上地面也不是纯色的，有点坑坑洼洼的颜色会比较真实点，最后在加上AO效果会更好吧。


引用:
主要是参考这两篇[crazii](https://www.cnblogs.com/crazii/p/7337143.html)和[Colin](https://github.com/ColinLeung-NiloCat/UnityURP-MobileDrawMeshInstancedIndirectExample)文章和仓库。
https://zhuanlan.zhihu.com/p/394530773
https://zhuanlan.zhihu.com/p/443279414
http://walkingfat.com/%e8%bf%98%e5%8e%9f%e3%80%8a%e5%a1%9e%e5%b0%94%e8%be%be%e3%80%8b%e7%9a%84%e8%8d%89%e5%9c%b0/