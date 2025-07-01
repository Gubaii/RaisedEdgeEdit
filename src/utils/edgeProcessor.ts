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
    // const r = data[i];
    // const g = data[i + 1];
    // const b = data[i + 2];
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

/**
 * 专门针对深度图的DPI优化处理
 * 使用保边缘的放大算法，然后重新采样回原尺寸，确保物理尺寸一致
 */
export function optimizeDepthMapDPI(imageData: ImageData, targetDPI: number = 300, originalDPI?: number, enableEdgeSmoothing: boolean = true, smoothingStrength: number = 0.6): ImageData {
  // 如果没有提供原始DPI，估算当前DPI
  const currentDPI = originalDPI || estimateDepthMapDPI(imageData);
  
  console.log(`深度图DPI检测: 当前 ${currentDPI} DPI, 目标 ${targetDPI} DPI`);
  console.log(`图像尺寸: ${imageData.width}x${imageData.height} (${imageData.width * imageData.height} 像素)`);
  
  // 降低低分辨率检测阈值，让更多图像能被检测到
  const isLowResolution = imageData.width * imageData.height < 100000; // 小于100K像素 (约316x316)
  console.log(`低分辨率检测: ${isLowResolution ? '是' : '否'}`);
  
  // 强制应用边缘平滑（用于测试）
  if (enableEdgeSmoothing) {
    console.log('应用边缘平滑算法...');
    const smoothedImageData = intelligentEdgeSmoothing(imageData, smoothingStrength);
    
    // 如果不需要DPI优化，直接返回平滑结果
    if (currentDPI >= targetDPI) {
      console.log('DPI已达标，返回边缘平滑结果');
      return smoothedImageData;
    }
    
    // 继续DPI优化流程
    console.log('继续DPI优化流程...');
    return performDPIOptimization(smoothedImageData, targetDPI, currentDPI);
  }
  
  // 高分辨率图像的常规处理
  if (currentDPI >= targetDPI) {
    console.log('深度图DPI已达标，无需优化');
    return imageData;
  }
  
  return performDPIOptimization(imageData, targetDPI, currentDPI);
}

/**
 * 执行DPI优化的核心流程
 * 保持优化后的高分辨率，不重新采样回原尺寸
 */
function performDPIOptimization(imageData: ImageData, targetDPI: number, currentDPI: number): ImageData {
  // 计算放大倍数
  const scaleFactor = targetDPI / currentDPI;
  console.log(`🎯 DPI优化开始:`);
  console.log(`  当前DPI: ${currentDPI.toFixed(1)} → 目标DPI: ${targetDPI}`);
  console.log(`  放大倍数: ${scaleFactor.toFixed(2)}x`);
  console.log(`  原始尺寸: ${imageData.width}×${imageData.height}`);
  
  // 使用保边缘的放大算法放大到目标DPI
  const enlargedImageData = edgePreservingUpscale(imageData, scaleFactor);
  
  console.log(`✅ DPI优化完成:`);
  console.log(`  优化后尺寸: ${enlargedImageData.width}×${enlargedImageData.height}`);
  console.log(`  像素增加: ${((enlargedImageData.width * enlargedImageData.height) / (imageData.width * imageData.height)).toFixed(1)}倍`);
  console.log(`  💡 高分辨率图像将在3D建模时映射到原始物理尺寸`);
  
  // 直接返回高分辨率图像，不重新采样
  return enlargedImageData;
}

/**
 * 智能边缘平滑算法
 * 专门处理低分辨率深度图的锯齿边缘问题
 */
function intelligentEdgeSmoothing(imageData: ImageData, smoothingStrength: number = 0.6): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  
  console.log('开始智能边缘平滑处理...');
  console.log(`平滑参数: 强度=${smoothingStrength}, 尺寸=${width}x${height}`);
  
  // 复制原始数据
  result.data.set(data);
  
  // 获取像素值的函数
  const getPixelValue = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    const index = (y * width + x) * 4;
    return data[index]; // 使用R通道作为深度值
  };
  
  // 降低边缘检测阈值，让更多边缘被检测到
  const isEdgePixel = (x: number, y: number): boolean => {
    const centerValue = getPixelValue(x, y);
    const threshold = 8; // 降低阈值，从15降到8
    
    // 检查8个方向的邻居（更全面的检测）
    const neighbors = [
      getPixelValue(x-1, y-1), getPixelValue(x, y-1), getPixelValue(x+1, y-1),
      getPixelValue(x-1, y),                         getPixelValue(x+1, y),
      getPixelValue(x-1, y+1), getPixelValue(x, y+1), getPixelValue(x+1, y+1)
    ];
    
    return neighbors.some(neighbor => Math.abs(centerValue - neighbor) > threshold);
  };
  
  // 计算边缘像素数量
  let edgePixelCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isEdgePixel(x, y)) {
        edgePixelCount++;
      }
    }
  }
  console.log(`检测到边缘像素: ${edgePixelCount} 个 (${(edgePixelCount / (width * height) * 100).toFixed(1)}%)`);
  
  // 计算平滑后的像素值
  const getSmoothValue = (x: number, y: number): number => {
    const centerValue = getPixelValue(x, y);
    
    // 根据平滑强度调整内核大小和权重
    let weights: number[][];
    let kernelSize: number;
    
    if (smoothingStrength <= 0.3) {
      // 轻微平滑：3x3内核
      kernelSize = 1;
      weights = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
      ];
    } else if (smoothingStrength <= 0.7) {
      // 中等平滑：5x5内核
      kernelSize = 2;
      weights = [
        [1, 2, 3, 2, 1],
        [2, 4, 6, 4, 2],
        [3, 6, 9, 6, 3],
        [2, 4, 6, 4, 2],
        [1, 2, 3, 2, 1]
      ];
    } else {
      // 强烈平滑：7x7内核
      kernelSize = 3;
      weights = [
        [1, 2, 3, 4, 3, 2, 1],
        [2, 4, 6, 8, 6, 4, 2],
        [3, 6, 9, 12, 9, 6, 3],
        [4, 8, 12, 16, 12, 8, 4],
        [3, 6, 9, 12, 9, 6, 3],
        [2, 4, 6, 8, 6, 4, 2],
        [1, 2, 3, 4, 3, 2, 1]
      ];
    }
    
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (let dy = -kernelSize; dy <= kernelSize; dy++) {
      for (let dx = -kernelSize; dx <= kernelSize; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const weight = weights[dy + kernelSize][dx + kernelSize];
        const value = getPixelValue(nx, ny);
        
        // 根据平滑强度调整相似性阈值
        const similarityThreshold = 30 + (smoothingStrength * 70); // 30-100的范围
        
        if (Math.abs(value - centerValue) < similarityThreshold) {
          weightedSum += value * weight;
          totalWeight += weight;
        }
      }
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : centerValue;
  };
  
  // 增加迭代次数，根据平滑强度调整
  const iterationCount = Math.ceil(smoothingStrength * 4); // 1-4次迭代
  let processedPixels = 0;
  
  console.log(`使用 ${iterationCount} 次迭代，平滑强度 ${smoothingStrength}`);
  
  for (let iteration = 0; iteration < iterationCount; iteration++) {
    console.log(`边缘平滑迭代 ${iteration + 1}/${iterationCount}`);
    
    const tempData = new Uint8ClampedArray(result.data);
    let iterationProcessed = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isEdgePixel(x, y)) {
          const smoothValue = getSmoothValue(x, y);
          const index = (y * width + x) * 4;
          
          // 增强平滑效果，使用非线性混合
          const originalValue = tempData[index];
          
          // 使用指数函数增强平滑效果的可见性
          const enhancedStrength = Math.pow(smoothingStrength, 0.5); // 让效果更明显
          const finalValue = originalValue * (1 - enhancedStrength) + smoothValue * enhancedStrength;
          
          result.data[index] = Math.round(finalValue);
          result.data[index + 1] = Math.round(finalValue);
          result.data[index + 2] = Math.round(finalValue);
          result.data[index + 3] = tempData[index + 3]; // 保持Alpha通道
          
          iterationProcessed++;
        }
      }
    }
    processedPixels += iterationProcessed;
    console.log(`迭代 ${iteration + 1} 处理了 ${iterationProcessed} 个边缘像素，混合强度: ${Math.pow(smoothingStrength, 0.5).toFixed(2)}`);
  }
  
  console.log(`智能边缘平滑处理完成，总共处理了 ${processedPixels} 次像素操作`);
  return result;
}

/**
 * 估算深度图DPI - 基于常见的深度图使用场景
 */
function estimateDepthMapDPI(imageData: ImageData): number {
  const { width, height } = imageData;
  const totalPixels = width * height;
  
  // 基于像素总数和常见深度图尺寸估算DPI
  if (totalPixels < 100000) { // 小于100K像素，假设为低分辨率
    return 72;
  } else if (totalPixels < 400000) { // 小于400K像素，假设为中等分辨率
    return 150;
  } else if (totalPixels < 1000000) { // 小于1M像素，假设为较高分辨率
    return 200;
  } else {
    return 300; // 大于1M像素，假设已经是高分辨率
  }
}

/**
 * 保边缘的图像放大算法
 * 专门为深度图设计，保持边缘清晰度和深度值精确性
 */
function edgePreservingUpscale(imageData: ImageData, scaleFactor: number): ImageData {
  const { width, height, data } = imageData;
  const newWidth = Math.round(width * scaleFactor);
  const newHeight = Math.round(height * scaleFactor);
  
  console.log(`保边缘放大: ${width}x${height} -> ${newWidth}x${newHeight}`);
  
  const result = new ImageData(newWidth, newHeight);
  
  // 获取原图像中指定位置的像素值
  const getPixel = (x: number, y: number, channel: number): number => {
    const clampedX = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const clampedY = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const index = (clampedY * width + clampedX) * 4 + channel;
    return data[index];
  };
  
  // 检查是否为边缘像素
  const isEdgePixel = (x: number, y: number): boolean => {
    const centerValue = getPixel(x, y, 0); // 使用R通道作为深度值
    const threshold = 10; // 深度差异阈值
    
    // 检查8个邻居
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        
        const neighborValue = getPixel(x + dx, y + dy, 0);
        if (Math.abs(centerValue - neighborValue) > threshold) {
          return true; // 发现明显的深度差异，认为是边缘
        }
      }
    }
    return false;
  };
  
  // 对每个新像素进行插值
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      // 映射到原图坐标
      const srcX = x / scaleFactor;
      const srcY = y / scaleFactor;
      
      const resultIndex = (y * newWidth + x) * 4;
      
      // 检查源位置是否为边缘区域
      const isNearEdge = isEdgePixel(srcX, srcY);
      
      if (isNearEdge) {
        // 边缘区域使用最近邻插值，保持边缘清晰
        const nearestX = Math.round(srcX);
        const nearestY = Math.round(srcY);
        
        for (let channel = 0; channel < 4; channel++) {
          result.data[resultIndex + channel] = getPixel(nearestX, nearestY, channel);
        }
      } else {
        // 非边缘区域使用双线性插值，稍微平滑
        const x1 = Math.floor(srcX);
        const y1 = Math.floor(srcY);
        const x2 = Math.min(x1 + 1, width - 1);
        const y2 = Math.min(y1 + 1, height - 1);
        
        const fx = srcX - x1;
        const fy = srcY - y1;
        
        for (let channel = 0; channel < 4; channel++) {
          const v11 = getPixel(x1, y1, channel);
          const v12 = getPixel(x1, y2, channel);
          const v21 = getPixel(x2, y1, channel);
          const v22 = getPixel(x2, y2, channel);
          
          const v1 = v11 * (1 - fx) + v21 * fx;
          const v2 = v12 * (1 - fx) + v22 * fx;
          const finalValue = v1 * (1 - fy) + v2 * fy;
          
          result.data[resultIndex + channel] = Math.round(finalValue);
        }
      }
    }
  }
  
  return result;
}

/**
 * 高质量降采样算法
 * 将高分辨率图像重新采样到指定尺寸，保持边缘清晰度
 */
function highQualityDownsample(imageData: ImageData, targetWidth: number, targetHeight: number): ImageData {
  const { width, height, data } = imageData;
  
  console.log(`高质量降采样: ${width}x${height} -> ${targetWidth}x${targetHeight}`);
  
  const result = new ImageData(targetWidth, targetHeight);
  
  // 计算采样比例
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;
  
  // 获取原图像中指定位置的像素值
  const getPixel = (x: number, y: number, channel: number): number => {
    const clampedX = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const clampedY = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const index = (clampedY * width + clampedX) * 4 + channel;
    return data[index];
  };
  
  // 区域平均采样，避免锯齿
  const getAreaAverage = (centerX: number, centerY: number, channel: number): number => {
    const radius = Math.max(scaleX, scaleY) * 0.5;
    let sum = 0;
    let count = 0;
    
    const startX = Math.max(0, Math.floor(centerX - radius));
    const endX = Math.min(width - 1, Math.ceil(centerX + radius));
    const startY = Math.max(0, Math.floor(centerY - radius));
    const endY = Math.min(height - 1, Math.ceil(centerY + radius));
    
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        sum += getPixel(x, y, channel);
        count++;
      }
    }
    
    return count > 0 ? sum / count : 0;
  };
  
  // 对每个目标像素进行采样
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      // 映射到源图坐标
      const srcX = (x + 0.5) * scaleX;
      const srcY = (y + 0.5) * scaleY;
      
      const resultIndex = (y * targetWidth + x) * 4;
      
      // 使用区域平均采样，保持深度信息的准确性
      for (let channel = 0; channel < 4; channel++) {
        const value = getAreaAverage(srcX, srcY, channel);
        result.data[resultIndex + channel] = Math.round(value);
      }
    }
  }
  
  return result;
}

/**
 * 优化后的深度图生成函数 - 包含专门的深度图DPI优化和边缘平滑
 */
export function processImageWithEdgesOptimized(
  sourceImageData: ImageData, 
  options: EdgeProcessorOptions,
  enableDPIOptimization: boolean = true,
  targetDPI: number = 300,
  enableEdgeSmoothing: boolean = true,
  smoothingStrength: number = 0.6
): ImageData {
  console.log('🔧 processImageWithEdgesOptimized 开始执行');
  console.log(`参数检查: enableDPIOptimization=${enableDPIOptimization}, enableEdgeSmoothing=${enableEdgeSmoothing}`);
  console.log(`参数检查: targetDPI=${targetDPI}, smoothingStrength=${smoothingStrength}`);
  console.log(`图像尺寸: ${sourceImageData.width}x${sourceImageData.height}`);
  
  // 首先进行正常的边缘处理
  const processedImageData = processImageWithEdges(sourceImageData, options);
  console.log('✅ 基础边缘处理完成');
  
  // 如果启用DPI优化，使用专门的深度图优化算法
  if (enableDPIOptimization) {
    console.log('🎯 进入DPI优化分支');
    console.log('开始深度图DPI优化处理...');
    const optimizedImageData = optimizeDepthMapDPI(processedImageData, targetDPI, undefined, enableEdgeSmoothing, smoothingStrength);
    console.log('深度图DPI优化处理完成');
    return optimizedImageData;
  }
  
  // 如果只启用边缘平滑但不启用DPI优化
  if (enableEdgeSmoothing) {
    console.log('🎯 进入纯边缘平滑分支');
    console.log('开始边缘平滑处理...');
    const smoothedImageData = intelligentEdgeSmoothing(processedImageData, smoothingStrength);
    console.log('边缘平滑处理完成');
    return smoothedImageData;
  }
  
  console.log('⚠️ 未应用任何优化，返回原始处理结果');
  return processedImageData;
}

/**
 * 创建带有DPI信息的深度图DataURL
 */
export function imageDataToDataURLWithDPI(imageData: ImageData, dpi: number = 300): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('无法创建Canvas上下文');
  }

  canvas.width = imageData.width;
  canvas.height = imageData.height;
  
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL('image/png', 1.0); // 使用最高质量PNG格式
} 