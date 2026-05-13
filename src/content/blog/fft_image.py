"""
2D 傅里叶变换图像可视化 + 低通滤波还原
1. 原图 -> FFT -> 频谱
2. 抹去高频（低通滤波）
3. IFFT 还原 -> 模糊后的图像
"""
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
import sys


def fft_with_lowpass(image_path, cutoff_ratio=0.1, save_path=None):
    """
    对图像做 FFT、低通滤波、IFFT 还原，并显示完整流程。
    
    参数:
        image_path:    输入图像路径
        cutoff_ratio:  低通截止半径占图像短边的比例（0~1）
                       值越小越模糊，0.1 表示只保留中心 10% 半径内的频率
        save_path:     输出图像保存路径（可选）
    """
    # 1. 读取图像并转灰度
    img = Image.open(image_path).convert('L')
    img_array = np.array(img, dtype=np.float64)
    H, W = img_array.shape
    
    # 2. 二维 FFT 并将零频移到中心
    f = np.fft.fft2(img_array)
    fshift = np.fft.fftshift(f)
    
    # 3. 原始幅度谱（对数压缩）
    magnitude = np.log(np.abs(fshift) + 1)
    
    # 4. 构造圆形低通掩膜：中心为 1，外围为 0
    cy, cx = H // 2, W // 2                       # 频谱中心坐标
    radius = int(min(H, W) * cutoff_ratio / 2)    # 截止半径
    
    y, x = np.ogrid[:H, :W]
    mask = ((x - cx) ** 2 + (y - cy) ** 2) <= radius ** 2
    mask = mask.astype(np.float64)
    
    # 5. 应用掩膜：抹掉高频
    fshift_filtered = fshift * mask
    
    # 6. 滤波后的幅度谱
    magnitude_filtered = np.log(np.abs(fshift_filtered) + 1)
    
    # 7. IFFT 还原：先 ifftshift 把零频移回左上角，再做反变换
    f_ishift = np.fft.ifftshift(fshift_filtered)
    img_back = np.fft.ifft2(f_ishift)
    img_back = np.abs(img_back)                   # 取实部模值
    
    # 8. 四宫格显示（按原图宽高比设置 figsize，保证 4 个子图比例一致）
    aspect = W / H
    fig, axes = plt.subplots(2, 2, figsize=(7 * aspect, 7))
    
    axes[0, 0].imshow(img_array, cmap='gray', aspect='auto')
    axes[0, 0].set_title('1. origin')
    axes[0, 0].axis('off')
    
    axes[0, 1].imshow(magnitude, cmap='gray', aspect='auto')
    axes[0, 1].set_title('2. Fourier (full spectrum)')
    axes[0, 1].axis('off')
    
    axes[1, 0].imshow(magnitude_filtered, cmap='gray', aspect='auto')
    axes[1, 0].set_title(f'3. Low-pass filtered (r={cutoff_ratio})')
    axes[1, 0].axis('off')
    
    axes[1, 1].imshow(img_back, cmap='gray', aspect='auto')
    axes[1, 1].set_title('4. Reconstructed (blurred)')
    axes[1, 1].axis('off')
    
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path, dpi=120, bbox_inches='tight')
        print(f'已保存到: {save_path}')
    
    plt.show()
    return img_back


if __name__ == '__main__':
    # 用法: python fft_lowpass.py <输入图像> [输出图像] [cutoff_ratio]
    if len(sys.argv) < 2:
        print('用法: python fft_lowpass.py <输入图像> [输出图像] [cutoff_ratio]')
        print('  cutoff_ratio: 0~1，值越小越模糊，默认 0.1')
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'fft_lowpass_result.png'
    cutoff = float(sys.argv[3]) if len(sys.argv) > 3 else 0.1
    
    fft_with_lowpass(input_path, cutoff_ratio=cutoff, save_path=output_path)