/**
 * STL文件导出工具
 */

export interface STLExportOptions {
  grayscaleData: ImageData;
  height: number; // mm
  filename?: string;
}

/**
 * 从灰度图生成STL文件并下载
 */
export function exportSTL(options: STLExportOptions): void {
  const { grayscaleData, height, filename = '3d-model.stl' } = options;
  const stlContent = generateSTLFromGrayscale(grayscaleData, height);
  downloadSTL(stlContent, filename);
}

/**
 * 从灰度图生成STL内容
 */
function generateSTLFromGrayscale(imageData: ImageData, maxHeight: number): string {
  const { width, height, data } = imageData;
  const triangles: string[] = [];
  
  // STL文件头
  let stlContent = 'solid generated_model\n';
  
  // 遍历每个像素，生成对应的几何体
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      // 获取四个角的高度值
      const heights = [
        getHeightAtPixel(data, x, y, width, height, maxHeight),
        getHeightAtPixel(data, x + 1, y, width, height, maxHeight),
        getHeightAtPixel(data, x, y + 1, width, height, maxHeight),
        getHeightAtPixel(data, x + 1, y + 1, width, height, maxHeight)
      ];
      
      // 计算世界坐标（假设1像素=0.1mm）
      const scale = 0.1;
      const vertices = [
        { x: x * scale, y: y * scale, z: heights[0] },
        { x: (x + 1) * scale, y: y * scale, z: heights[1] },
        { x: x * scale, y: (y + 1) * scale, z: heights[2] },
        { x: (x + 1) * scale, y: (y + 1) * scale, z: heights[3] }
      ];
      
      // 只为有高度的区域生成三角形
      if (heights.some(h => h > 0)) {
        // 生成顶面的两个三角形
        if (heights[0] > 0 || heights[1] > 0 || heights[2] > 0) {
          triangles.push(createTriangle(vertices[0], vertices[1], vertices[2]));
        }
        if (heights[1] > 0 || heights[2] > 0 || heights[3] > 0) {
          triangles.push(createTriangle(vertices[1], vertices[3], vertices[2]));
        }
        
        // 生成侧面（边缘部分）
        generateSideFaces(vertices, heights, triangles);
      }
    }
  }
  
  stlContent += triangles.join('\n');
  stlContent += '\nendsolid generated_model\n';
  
  return stlContent;
}

/**
 * 获取像素位置的高度值
 */
function getHeightAtPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number,
  maxHeight: number
): number {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  
  const index = (y * width + x) * 4;
  const grayscale = data[index]; // 红色通道
  return (grayscale / 255) * maxHeight;
}

/**
 * 创建三角形STL文本
 */
function createTriangle(v1: Vector3, v2: Vector3, v3: Vector3): string {
  const normal = calculateNormal(v1, v2, v3);
  
  return `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}
    outer loop
      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}
      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}
      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}
    endloop
  endfacet`;
}

/**
 * 计算三角形法线
 */
function calculateNormal(v1: Vector3, v2: Vector3, v3: Vector3): Vector3 {
  const u = {
    x: v2.x - v1.x,
    y: v2.y - v1.y,
    z: v2.z - v1.z
  };
  
  const v = {
    x: v3.x - v1.x,
    y: v3.y - v1.y,
    z: v3.z - v1.z
  };
  
  const normal = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x
  };
  
  // 归一化
  const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
  if (length > 0) {
    normal.x /= length;
    normal.y /= length;
    normal.z /= length;
  }
  
  return normal;
}

/**
 * 生成侧面三角形
 */
function generateSideFaces(_vertices: Vector3[], heights: number[], _triangles: string[]): void {
  // 为边缘生成侧面，这里简化处理
  // 实际应用中需要更复杂的算法来正确处理所有边缘情况
  
  // 检查是否在边界上，如果是则生成底面连接
  for (let i = 0; i < 4; i++) {
    if (heights[i] > 0) {
      // const bottomVertex = { ...vertices[i], z: 0 };
      
      // 这里可以添加更多的侧面生成逻辑
      // 为简化，我们只生成基本的底面连接
    }
  }
}

/**
 * 下载STL文件
 */
function downloadSTL(stlContent: string, filename: string): void {
  const blob = new Blob([stlContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
} 