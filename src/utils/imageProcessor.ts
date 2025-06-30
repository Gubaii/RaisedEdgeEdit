import { GrayscaleOptions } from '../types';

/**
 * 从文件创建图像数据
 */
export function createImageFromFile(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('无法创建Canvas上下文'));
      return;
    }

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(imageData);
    };

    img.onerror = () => reject(new Error('图像加载失败'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 提取图像轮廓
 */
export function extractContour(imageData: ImageData, threshold: number = 128): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // 二值化：大于阈值的为白色（内部），小于阈值的为黑色（外部）
    const value = gray > threshold ? 255 : 0;
    
    result.data[i] = value;     // R
    result.data[i + 1] = value; // G
    result.data[i + 2] = value; // B
    result.data[i + 3] = 255;   // A
  }
  
  return result;
}

/**
 * 生成带边缘效果的灰度图
 */
export function generateGrayscaleWithEdges(
  contourData: ImageData, 
  options: GrayscaleOptions
): ImageData {
  const { width, height, edgeType, cornerRadius, chamferAngle } = options;
  const result = new ImageData(width, height);
  
  // 创建距离场
  const distanceField = calculateDistanceField(contourData);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const distance = distanceField[y * width + x];
      
      let value = 0;
      
      if (distance > 0) {
        // 内部区域
        switch (edgeType) {
          case 'vertical':
            value = 255;
            break;
          case 'rounded':
            value = calculateRoundedEdge(distance, cornerRadius);
            break;
          case 'chamfered':
            value = calculateChamferedEdge(distance, chamferAngle);
            break;
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
 * 计算距离场（简化版本）
 */
function calculateDistanceField(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const distances = new Float32Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const pixelIndex = index * 4;
      
      // 检查当前像素是否为内部（白色）
      const isInside = data[pixelIndex] > 128;
      
      if (isInside) {
        // 计算到边缘的最短距离
        let minDistance = Infinity;
        
        // 简单的暴力搜索（可以优化为更高效的算法）
        for (let dy = -50; dy <= 50; dy++) {
          for (let dx = -50; dx <= 50; dx++) {
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
        
        distances[index] = minDistance === Infinity ? 50 : minDistance;
      } else {
        distances[index] = -1; // 外部区域
      }
    }
  }
  
  return distances;
}

/**
 * 计算圆角边缘的高度值
 */
function calculateRoundedEdge(distance: number, radius: number): number {
  if (distance >= radius) {
    return 255; // 完全高度
  }
  
  // 使用圆形函数计算高度渐变
  const normalizedDistance = distance / radius;
  const height = Math.sqrt(1 - (1 - normalizedDistance) * (1 - normalizedDistance));
  
  return Math.floor(height * 255);
}

/**
 * 计算切角边缘的高度值
 */
function calculateChamferedEdge(distance: number, angleInDegrees: number): number {
  const chamferDistance = 10; // 切角的距离范围
  
  if (distance >= chamferDistance) {
    return 255; // 完全高度
  }
  
  // 线性渐变
  const slope = Math.tan((90 - angleInDegrees) * Math.PI / 180);
  const height = distance * slope / chamferDistance;
  
  return Math.floor(Math.min(height, 1) * 255);
}

/**
 * 从SVG创建图像数据
 */
export function createImageFromSVG(svgString: string, width: number = 512, height: number = 512): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('无法创建Canvas上下文'));
      return;
    }

    canvas.width = width;
    canvas.height = height;

    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      resolve(imageData);
    };

    img.onerror = () => reject(new Error('SVG加载失败'));
    
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    img.src = URL.createObjectURL(blob);
  });
} 