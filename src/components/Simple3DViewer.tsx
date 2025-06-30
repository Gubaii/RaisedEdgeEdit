import React, { useRef, useEffect, useState } from 'react';

interface Simple3DViewerProps {
  grayscaleUrl?: string;
  width: number;
  height: number;
  modelHeight: number;
  edgeType: string;
}

export function Simple3DViewer({ grayscaleUrl, width, height, modelHeight, edgeType }: Simple3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [rotation, setRotation] = useState({ x: -30, y: 35 }); // 初始3D视角
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current || !grayscaleUrl) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;

      canvas.width = 400;
      canvas.height = 300;

      const img = new Image();
      img.onload = () => {
        renderIsometric3D(ctx, img);
        setIsInitialized(true);
      };
      
      img.onerror = () => {
        console.error('灰度图加载失败');
        setIsInitialized(true);
      };
      
      img.src = grayscaleUrl;
    } catch (error) {
      console.error('3D渲染失败:', error);
      setIsInitialized(true);
    }
  }, [grayscaleUrl, modelHeight, edgeType, rotation]);

  const renderIsometric3D = (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => {
    // 清空画布
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 绘制背景网格
    drawBackground(ctx);

    // 创建临时画布分析灰度图
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const resolution = 24; // 3D网格分辨率
    tempCanvas.width = resolution;
    tempCanvas.height = resolution;
    tempCtx.drawImage(img, 0, 0, resolution, resolution);
    
    const imageData = tempCtx.getImageData(0, 0, resolution, resolution);
    
    // 等距投影参数
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const scale = 6;
    const maxHeight = modelHeight * 2;

    // 创建高度图数组
    const heightMap: number[][] = [];
    for (let y = 0; y < resolution; y++) {
      heightMap[y] = [];
      for (let x = 0; x < resolution; x++) {
        const pixelIndex = (y * resolution + x) * 4;
        const grayValue = imageData.data[pixelIndex];
        heightMap[y][x] = (grayValue / 255) * maxHeight;
      }
    }

    // 绘制3D网格
    draw3DMesh(ctx, heightMap, centerX, centerY, scale, resolution);
    
    // 绘制坐标轴
    drawAxes(ctx, centerX, centerY, scale);
    
    // 绘制标题和信息
    drawInfo(ctx);
  };

  const draw3DMesh = (
    ctx: CanvasRenderingContext2D, 
    heightMap: number[][], 
    centerX: number, 
    centerY: number, 
    scale: number,
    resolution: number
  ) => {
    const faces: any[] = [];

    // 生成所有面
    for (let y = 0; y < resolution - 1; y++) {
      for (let x = 0; x < resolution - 1; x++) {
        const h1 = heightMap[y][x];
        const h2 = heightMap[y][x + 1];
        const h3 = heightMap[y + 1][x];
        const h4 = heightMap[y + 1][x + 1];

        if (h1 > 0 || h2 > 0 || h3 > 0 || h4 > 0) {
          // 计算3D坐标
          const p1 = project3D(x - resolution/2, y - resolution/2, h1, centerX, centerY, scale);
          const p2 = project3D(x + 1 - resolution/2, y - resolution/2, h2, centerX, centerY, scale);
          const p3 = project3D(x - resolution/2, y + 1 - resolution/2, h3, centerX, centerY, scale);
          const p4 = project3D(x + 1 - resolution/2, y + 1 - resolution/2, h4, centerX, centerY, scale);

          // 顶面
          if (Math.max(h1, h2, h3, h4) > 1) {
            const avgHeight = (h1 + h2 + h3 + h4) / 4;
            const brightness = Math.min(100, 40 + avgHeight * 2);
            
            let hue;
            switch (edgeType) {
              case 'rounded': hue = 260; break;
              case 'chamfered': hue = 200; break;
              default: hue = 280;
            }

            faces.push({
              points: [p1, p2, p4, p3],
              color: `hsl(${hue}, 70%, ${brightness}%)`,
              z: avgHeight,
              type: 'top'
            });
          }

          // 侧面
          if (h1 > 1 || h2 > 1) {
            const p1Base = project3D(x - resolution/2, y - resolution/2, 0, centerX, centerY, scale);
            const p2Base = project3D(x + 1 - resolution/2, y - resolution/2, 0, centerX, centerY, scale);
            
            faces.push({
              points: [p1, p2, p2Base, p1Base],
              color: `hsl(${edgeType === 'rounded' ? 260 : edgeType === 'chamfered' ? 200 : 280}, 60%, 35%)`,
              z: (h1 + h2) / 2 - 5,
              type: 'side'
            });
          }
        }
      }
    }

    // 按Z深度排序
    faces.sort((a, b) => a.z - b.z);

    // 绘制所有面
    faces.forEach(face => {
      ctx.fillStyle = face.color;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.3;

      ctx.beginPath();
      ctx.moveTo(face.points[0].x, face.points[0].y);
      for (let i = 1; i < face.points.length; i++) {
        ctx.lineTo(face.points[i].x, face.points[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  };

  const project3D = (x: number, y: number, z: number, centerX: number, centerY: number, scale: number) => {
    // 等距投影
    const rad = Math.PI / 180;
    const rotX = rotation.x * rad;
    const rotY = rotation.y * rad;

    // 旋转变换
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y1 = y * cosX - z1 * sinX;

    return {
      x: centerX + x1 * scale,
      y: centerY + y1 * scale
    };
  };

  const drawBackground = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i < ctx.canvas.width; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, ctx.canvas.height);
      ctx.stroke();
    }
    
    for (let i = 0; i < ctx.canvas.height; i += 20) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(ctx.canvas.width, i);
      ctx.stroke();
    }
  };

  const drawAxes = (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, scale: number) => {
    const axisLength = 40;
    
    // X轴 (红色)
    const xEnd = project3D(axisLength, 0, 0, centerX, centerY, scale);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(xEnd.x, xEnd.y);
    ctx.stroke();
    
    // Y轴 (绿色)
    const yEnd = project3D(0, axisLength, 0, centerX, centerY, scale);
    ctx.strokeStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(yEnd.x, yEnd.y);
    ctx.stroke();
    
    // Z轴 (蓝色)
    const zEnd = project3D(0, 0, axisLength, centerX, centerY, scale);
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(zEnd.x, zEnd.y);
    ctx.stroke();
  };

  const drawInfo = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${edgeType}边缘 - 3D模型`, ctx.canvas.width / 2, 25);
    
    ctx.font = '10px sans-serif';
    ctx.fillText(`高度: ${modelHeight}mm | 拖拽旋转视角`, ctx.canvas.width / 2, ctx.canvas.height - 10);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastMouse.x;
    const deltaY = e.clientY - lastMouse.y;

    setRotation(prev => ({
      x: Math.max(-90, Math.min(90, prev.x + deltaY * 0.5)),
      y: prev.y + deltaX * 0.5
    }));

    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="w-full">
      <div className="text-center mb-2">
        <p className="text-xs font-medium text-gray-700">交互式3D预览</p>
      </div>
      
      <div className="relative bg-white rounded border overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-auto cursor-grab active:cursor-grabbing"
          style={{ maxHeight: '300px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        
        {!isInitialized && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin mx-auto h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
              <p className="text-gray-500 text-xs">生成3D模型...</p>
            </div>
          </div>
        )}
        
        <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
          可交互
        </div>

        <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
          XYZ轴: 🔴🟢🔵
        </div>
      </div>
      
      <div className="mt-2 text-xs text-gray-500 text-center">
        <p>尺寸: {width}×{height} | 高度: {modelHeight}mm</p>
        <p className="text-[10px] mt-1">💡 拖拽鼠标旋转3D视角</p>
      </div>
    </div>
  );
} 