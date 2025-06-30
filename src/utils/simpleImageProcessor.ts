/**
 * 简化的图像处理工具
 */

export interface ProcessedImageData {
  originalUrl: string;
  width: number;
  height: number;
  contourUrl: string;
  grayscaleUrl: string;
}

/**
 * 处理上传的图片文件
 */
export async function processImageFile(file: File): Promise<ProcessedImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('无法创建Canvas上下文'));
      return;
    }

    img.onload = () => {
      try {
        // 设置画布尺寸
        const maxSize = 512;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // 绘制原始图片
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const originalUrl = canvas.toDataURL();

        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // 生成轮廓图
        const contourImageData = extractSimpleContour(imageData);
        ctx.putImageData(contourImageData, 0, 0);
        const contourUrl = canvas.toDataURL();

        // 生成灰度图
        const grayscaleImageData = createSimpleGrayscale(contourImageData);
        ctx.putImageData(grayscaleImageData, 0, 0);
        const grayscaleUrl = canvas.toDataURL();

        resolve({
          originalUrl,
          width: canvas.width,
          height: canvas.height,
          contourUrl,
          grayscaleUrl
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('图像加载失败'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 简单的轮廓提取
 */
function extractSimpleContour(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // 计算灰度值
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // 简单阈值处理
    const threshold = 128;
    const value = gray > threshold ? 255 : 0;
    
    result.data[i] = value;     // R
    result.data[i + 1] = value; // G
    result.data[i + 2] = value; // B
    result.data[i + 3] = a;     // A (保持原透明度)
  }
  
  return result;
}

/**
 * 创建简单的灰度高度图
 */
function createSimpleGrayscale(contourData: ImageData, edgeType: string = 'vertical'): ImageData {
  const { width, height, data } = contourData;
  const result = new ImageData(width, height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const isInside = data[index] > 128; // 白色区域为内部
      
      let value = 0;
      
      if (isInside) {
        // 计算到边缘的距离（简化版本）
        const distanceToEdge = calculateSimpleDistance(x, y, width, height, data);
        
        switch (edgeType) {
          case 'vertical':
            value = 255;
            break;
          case 'rounded':
            value = Math.min(255, distanceToEdge * 20); // 简单的圆角效果
            break;
          case 'chamfered':
            value = Math.min(255, distanceToEdge * 15); // 简单的切角效果
            break;
          default:
            value = 255;
        }
      }
      
      result.data[index] = value;     // R
      result.data[index + 1] = value; // G
      result.data[index + 2] = value; // B
      result.data[index + 3] = 255;   // A
    }
  }
  
  return result;
}

/**
 * 简单的距离计算
 */
function calculateSimpleDistance(x: number, y: number, width: number, height: number, data: Uint8ClampedArray): number {
  let minDistance = 10;
  
  // 检查周围像素找到边缘
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIndex = (ny * width + nx) * 4;
        const nIsInside = data[nIndex] > 128;
        
        if (!nIsInside) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          minDistance = Math.min(minDistance, distance);
        }
      }
    }
  }
  
  return minDistance;
}

/**
 * 处理SVG文件
 */
export async function processSVGFile(file: File): Promise<ProcessedImageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const svgText = e.target?.result as string;
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('无法创建Canvas上下文'));
          return;
        }

        img.onload = () => {
          canvas.width = 512;
          canvas.height = 512;
          
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const contourImageData = extractSimpleContour(imageData);
          
          ctx.putImageData(contourImageData, 0, 0);
          const contourUrl = canvas.toDataURL();
          
          const grayscaleImageData = createSimpleGrayscale(contourImageData);
          ctx.putImageData(grayscaleImageData, 0, 0);
          const grayscaleUrl = canvas.toDataURL();

          resolve({
            originalUrl: URL.createObjectURL(file),
            width: canvas.width,
            height: canvas.height,
            contourUrl,
            grayscaleUrl
          });
        };

        img.onerror = () => reject(new Error('SVG渲染失败'));
        
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        img.src = URL.createObjectURL(blob);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
} 