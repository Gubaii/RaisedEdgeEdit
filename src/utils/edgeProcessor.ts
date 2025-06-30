/**
 * 简化的边缘处理器 - 专注于深度图生成
 */

export interface EdgeProcessorOptions {
  edgeType: 'vertical' | 'rounded' | 'chamfered';
  edgeWidth: number; // 边缘渐变的宽度（像素）
  chamferAngle?: number; // 切角角度（度）
}

/**
 * 处理图像，添加边缘效果
 */
export function processImageWithEdges(
  sourceImageData: ImageData, 
  options: EdgeProcessorOptions
): ImageData {
  const { width, height, data } = sourceImageData;
  const result = new ImageData(width, height);
  
  console.log(`开始处理图像: ${width}x${height}, 边缘类型: ${options.edgeType}, 边缘宽度: ${options.edgeWidth}`);
  
  // 根据边缘类型选择不同的处理方式
  if (options.edgeType === 'vertical') {
    // 垂直边缘：简单的透明度判断，不需要距离场
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const originalAlpha = data[index + 3];
        
        let depth = 0;
        let outputAlpha = originalAlpha;
        
        if (originalAlpha > 32) {
          // 不透明像素 = 满高度（垂直边缘）
          depth = 255;
        } else {
          // 透明像素 = 底面
          depth = 0;
          outputAlpha = 0;
        }
        
        result.data[index] = depth;         // R
        result.data[index + 1] = depth;     // G
        result.data[index + 2] = depth;     // B
        result.data[index + 3] = outputAlpha; // A
      }
    }
  } else {
    // 圆角和切角需要距离场计算
    const contour = extractSmartContour(sourceImageData);
    const distanceField = calculateDistanceFieldFast(contour, width, height, options.edgeWidth);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const distance = distanceField[y * width + x];
        const originalAlpha = data[index + 3];
        
        let depth = 0;
        let outputAlpha = originalAlpha;
        
        if (originalAlpha > 32 && distance >= 0) {
          // 内部区域且不透明
          switch (options.edgeType) {
            case 'rounded':
              depth = calculateRoundedDepth(distance, options.edgeWidth);
              break;
            case 'chamfered':
              depth = calculateChamferedDepth(distance, options.edgeWidth, options.chamferAngle || 45);
              break;
          }
        } else if (originalAlpha <= 32) {
          // 透明区域保持透明
          depth = 0;
          outputAlpha = 0;
        }
        
        result.data[index] = depth;         // R
        result.data[index + 1] = depth;     // G
        result.data[index + 2] = depth;     // B
        result.data[index + 3] = outputAlpha; // A
      }
    }
  }
  
  console.log('图像处理完成');
  return result;
}

/**
 * 智能提取轮廓（支持透明PNG，透明区域被忽略）
 */
function extractSmartContour(imageData: ImageData): boolean[] {
  const { width, height, data } = imageData;
  const contour = new Array(width * height);
  
  // 简化逻辑：只要像素不透明就认为是内部区域
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // 透明度大于阈值的像素认为是内部区域
    contour[i / 4] = a > 32; // 几乎不透明的像素才被认为是内部
  }
  
  // 统计内部像素数量
  const insidePixels = contour.filter(Boolean).length;
  console.log(`轮廓提取完成: ${insidePixels}/${contour.length} 像素为内部区域`);
  
  return contour;
}

/**
 * 快速距离场计算 - 优化性能版本，确保边缘像素距离为0
 */
function calculateDistanceFieldFast(contour: boolean[], width: number, height: number, maxDistance: number): number[] {
  const distances = new Array(width * height).fill(-1);
  const queue: Array<{x: number, y: number, dist: number}> = [];
  let edgePixelCount = 0;
  
  // 首先找到所有边缘像素，作为距离计算的起点
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      
      if (contour[index]) { // 不透明像素
        // 检查是否为边缘像素（不透明像素且邻接透明像素或图像边界）
        let isEdge = false;
        
        // 检查8个邻居
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIndex = ny * width + nx;
              if (!contour[nIndex]) { // 邻接透明像素
                isEdge = true;
                break;
              }
            } else {
              // 图像边界也算边缘
              isEdge = true;
              break;
            }
          }
          if (isEdge) break;
        }
        
        if (isEdge) {
          distances[index] = 0; // 边缘像素距离确实为0
          queue.push({x, y, dist: 0});
          edgePixelCount++;
        } else {
          distances[index] = maxDistance; // 内部非边缘像素先设为最大距离
        }
      }
      // 透明像素保持 -1（不处理）
    }
  }
  
  console.log(`找到 ${edgePixelCount} 个边缘像素，开始距离场计算`);
  
  // 使用广度优先搜索计算距离场
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const {x, y, dist} = queue[queueIndex++];
    
    if (dist >= maxDistance) continue;
    
    // 检查8个邻居
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIndex = ny * width + nx;
          
          if (contour[nIndex]) { // 只处理不透明像素
            // 计算距离（使用欧几里得距离）
            const newDist = dist + Math.sqrt(dx * dx + dy * dy);
            
            if (newDist < distances[nIndex] && newDist <= maxDistance) {
              distances[nIndex] = newDist;
              queue.push({x: nx, y: ny, dist: newDist});
            }
          }
        }
      }
    }
  }
  
  console.log(`距离场计算完成，处理了 ${queue.length} 个像素`);
  return distances;
}

/**
 * 计算圆角深度值 - 修复版本，真正的向内凹圆角
 */
function calculateRoundedDepth(distance: number, edgeWidth: number): number {
  if (distance >= edgeWidth) {
    return 255; // 完全高度
  }
  
  // 使用真正的圆形函数创建向内凹的圆角
  const t = distance / edgeWidth; // 0到1的归一化距离
  
  // 圆角公式：对于半径为1的四分之一圆
  // 在距离边缘t处，圆的高度为：h = 1 - sqrt(1 - t²)
  // 但我们要的是向内凹的圆角，所以使用：h = sqrt(1 - (1-t)²)
  const circularT = Math.sqrt(1 - (1 - t) * (1 - t));
  
  const depth = Math.floor(circularT * 255);
  return Math.max(0, Math.min(255, depth));
}

/**
 * 计算切角深度值 - 正确的基于垂直面的切角算法
 * 切角是从垂直边缘的顶部按照指定角度向内倾斜
 */
function calculateChamferedDepth(distance: number, edgeWidth: number, angle: number): number {
  if (distance >= edgeWidth) {
    return 255; // 完全高度 - 超出切角范围的内部区域保持垂直
  }
  
  // 切角计算：从边缘开始，按照角度从顶部向下切
  // distance=0 是外边缘，应该是底面高度(0)
  // distance=edgeWidth 是切角内边界，应该达到全高度(255)
  
  // 根据切角角度计算斜面
  const angleRad = (angle * Math.PI) / 180;
  
  // 计算在当前距离处的高度
  // 使用正切函数：height = distance * tan(angle)
  // 但需要标准化到合适的比例
  const maxHeight = edgeWidth * Math.tan(angleRad);
  const currentHeight = distance * Math.tan(angleRad);
  
  // 将高度标准化到0-255范围
  // 如果计算出的最大高度超过了我们想要的高度，就进行缩放
  let normalizedHeight;
  if (maxHeight > edgeWidth) {
    // 角度较大，需要缩放以适应edgeWidth
    normalizedHeight = (currentHeight / maxHeight) * 255;
  } else {
    // 角度较小，直接按比例计算
    normalizedHeight = (currentHeight / edgeWidth) * 255;
  }
  
  // 确保高度在合理范围内
  const depth = Math.floor(Math.max(0, Math.min(255, normalizedHeight)));
  
  return depth;
}

/**
 * 从图像数据创建Canvas的DataURL
 */
export function imageDataToDataURL(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('无法创建Canvas上下文');
  }
  
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL();
} 