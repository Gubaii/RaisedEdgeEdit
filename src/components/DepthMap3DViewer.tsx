import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';

interface DepthMap3DViewerProps {
  depthMapUrl: string;
  modelHeight: number;
  width: number;
  height: number;
  quality?: 'low' | 'medium' | 'high' | 'ultra'; // 新增质量选项
  initialCameraState?: {
    position: [number, number, number];
    target: [number, number, number];
  } | null;
  onCameraStateChange?: (newState: { position: [number, number, number]; target: [number, number, number] }) => void;
}

// 全屏按钮组件
function FullscreenButton({ onToggleFullscreen, isFullscreen }: { onToggleFullscreen: () => void; isFullscreen: boolean }) {
  return (
    <button
      onClick={onToggleFullscreen}
      className="absolute top-3 left-3 z-10 p-2 bg-white bg-opacity-90 hover:bg-opacity-100 rounded-lg shadow-sm transition-all duration-200 text-gray-700 hover:text-gray-900"
      title={isFullscreen ? "退出全屏" : "全屏显示"}
    >
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        {isFullscreen ? (
          // 退出全屏图标
          <>
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
          </>
        ) : (
          // 全屏图标
          <>
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
          </>
        )}
      </svg>
    </button>
  );
}

// 精细3D模型组件 - 手动计算顶点位置
function PreciseDepthMapModel({ depthMapUrl, modelHeight, width, height, quality = 'high' }: DepthMap3DViewerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [imageData, setImageData] = React.useState<ImageData | null>(null);
  
  // 加载深度图数据
  React.useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setImageData(data);
    };
    img.src = depthMapUrl;
  }, [depthMapUrl]);
  
  // 严格按照深度图创建几何体 - 完全重写
  const geometry = useMemo(() => {
    if (!imageData) return null;
    
    console.time('严格几何体生成');
    
    // 根据质量设置决定采样步长
    const qualitySettings = {
      low: { step: 8 },      // 每8个像素采样一次
      medium: { step: 4 },   // 每4个像素采样一次  
      high: { step: 2 },     // 每2个像素采样一次
      ultra: { step: 1 }     // 每个像素都采样
    };
    
    const step = qualitySettings[quality].step;
    
    // 计算实际的网格尺寸
    const gridWidth = Math.ceil(width / step);
    const gridHeight = Math.ceil(height / step);
    
    console.log(`严格模式: 原图${width}x${height}, 网格${gridWidth}x${gridHeight}, 步长${step}`);
    
    // 手动创建顶点数组
    const vertices: number[] = [];
    const faces: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    
    // 创建顶点网格，严格对应像素位置
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        // 对应的原图像素位置
        const imgX = Math.min(x * step, width - 1);
        const imgY = Math.min(y * step, height - 1);
        const pixelIndex = (imgY * width + imgX) * 4;
        
        // 严格使用像素值
        const r = imageData.data[pixelIndex];
        const g = imageData.data[pixelIndex + 1];
        const b = imageData.data[pixelIndex + 2];
        const alpha = imageData.data[pixelIndex + 3];
        
        // 计算深度：使用灰度值或红色通道
        const depth = (alpha > 32) ? (r / 255) : 0;
        
        // 计算3D坐标：严格按像素网格映射
        const worldX = (x / (gridWidth - 1) - 0.5) * 10;
        const worldY = ((gridHeight - 1 - y) / (gridHeight - 1) - 0.5) * 10 * (height / width);
        const worldZ = depth * modelHeight * 0.05;
        
        vertices.push(worldX, worldY, worldZ);
        
        // 简单的颜色
        const intensity = 0.7 + depth * 0.3;
        colors.push(intensity, intensity * 0.95, intensity * 0.9);
        
        // 暂时设置向上的法线，稍后计算
        normals.push(0, 0, 1);
      }
    }
    
    // 创建面（三角形）
    for (let y = 0; y < gridHeight - 1; y++) {
      for (let x = 0; x < gridWidth - 1; x++) {
        const topLeft = y * gridWidth + x;
        const topRight = y * gridWidth + (x + 1);
        const bottomLeft = (y + 1) * gridWidth + x;
        const bottomRight = (y + 1) * gridWidth + (x + 1);
        
        // 每个四边形创建两个三角形
        faces.push(
          topLeft, bottomLeft, topRight,
          topRight, bottomLeft, bottomRight
        );
      }
    }
    
    // 重新计算法线 - 严格基于实际几何
    const normalArray = new Array(normals.length).fill(0);
    
    for (let i = 0; i < faces.length; i += 3) {
      const i1 = faces[i] * 3;
      const i2 = faces[i + 1] * 3;
      const i3 = faces[i + 2] * 3;
      
      // 计算三角形的法线
      const v1x = vertices[i2] - vertices[i1];
      const v1y = vertices[i2 + 1] - vertices[i1 + 1];
      const v1z = vertices[i2 + 2] - vertices[i1 + 2];
      
      const v2x = vertices[i3] - vertices[i1];
      const v2y = vertices[i3 + 1] - vertices[i1 + 1];
      const v2z = vertices[i3 + 2] - vertices[i1 + 2];
      
      // 叉积计算法线
      const nx = v1y * v2z - v1z * v2y;
      const ny = v1z * v2x - v1x * v2z;
      const nz = v1x * v2y - v1y * v2x;
      
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const nnx = length > 0 ? nx / length : 0;
      const nny = length > 0 ? ny / length : 0;
      const nnz = length > 0 ? nz / length : 1;
      
      // 累加到每个顶点
      [faces[i], faces[i + 1], faces[i + 2]].forEach(vertexIndex => {
        const idx = vertexIndex * 3;
        normalArray[idx] += nnx;
        normalArray[idx + 1] += nny;
        normalArray[idx + 2] += nnz;
      });
    }
    
    // 标准化法线
    for (let i = 0; i < normalArray.length; i += 3) {
      const length = Math.sqrt(
        normalArray[i] * normalArray[i] + 
        normalArray[i + 1] * normalArray[i + 1] + 
        normalArray[i + 2] * normalArray[i + 2]
      );
      
      if (length > 0) {
        normalArray[i] /= length;
        normalArray[i + 1] /= length;
        normalArray[i + 2] /= length;
      } else {
        normalArray[i] = 0;
        normalArray[i + 1] = 0;
        normalArray[i + 2] = 1;
      }
    }
    
    // 创建Three.js几何体
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normalArray), 3));
    geometry.setIndex(faces);
    
    console.timeEnd('严格几何体生成');
    console.log(`创建了${vertices.length / 3}个顶点，${faces.length / 3}个三角形`);
    
    return geometry;
  }, [imageData, modelHeight, width, height, quality]);
  
  // 移除复杂的平滑算法，只保留核心功能
  
  // 创建优化的材质
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.05, // 降低金属感
      roughness: 0.4, // 增加粗糙度，减少反射
      side: THREE.DoubleSide,
      envMapIntensity: 0.1, // 大幅降低环境反射
      flatShading: true, // 强制使用flat shading确保垂直边缘清晰
    });
  }, [quality]);
  
  // 更新材质参数
  React.useEffect(() => {
    if (material) {
      material.needsUpdate = true;
    }
  }, [modelHeight, material]);
  
  // 移除动画，保持模型完全静止以便观察垂直度
  // useFrame((state) => {
  //   if (meshRef.current) {
  //     meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.05;
  //     meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.02;
  //   }
  // });
  
  if (!geometry) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10 * (height / width), 32, 32]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
    );
  }
  
  return (
    <mesh ref={meshRef} geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} />
  );
  }

// 增强光照场景组件
function EnhancedScene({ 
  depthMapUrl, 
  modelHeight, 
  width, 
  height, 
  quality = 'high',
  initialCameraState,
  onCameraStateChange 
}: DepthMap3DViewerProps) {
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  
  // 保存相机状态到父组件
  const saveCameraState = () => {
    if (controlsRef.current && cameraRef.current && onCameraStateChange) {
      const newState = {
        position: [...cameraRef.current.position.toArray()] as [number, number, number],
        target: [...controlsRef.current.target.toArray()] as [number, number, number]
      };
      onCameraStateChange(newState);
    }
  };
  
  // 恢复相机状态
  const restoreCameraState = () => {
    if (initialCameraState && controlsRef.current && cameraRef.current) {
      console.log('恢复相机状态:', initialCameraState);
      
      // 设置相机位置
      cameraRef.current.position.set(...initialCameraState.position);
      
      // 设置控制器目标
      controlsRef.current.target.set(...initialCameraState.target);
      
      // 更新控制器
      controlsRef.current.update();
    }
  };
  
  // 初始化相机位置
  const defaultPosition: [number, number, number] = initialCameraState?.position || [8, 15, 12];
  const defaultTarget: [number, number, number] = initialCameraState?.target || [0, 0, 0];
  
  // 在组件挂载后恢复相机状态
  useEffect(() => {
    if (initialCameraState) {
      // 延迟恢复，确保控制器已经初始化
      const timer = setTimeout(() => {
        restoreCameraState();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [initialCameraState]);
  
  // 监听参数变化时保存当前状态
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCameraState();
    }, 500); // 延迟保存，避免频繁触发
    
    return () => clearTimeout(timer);
  }, [modelHeight]); // 只在高度变化时保存状态

  return (
    <>
      {/* 相机 */}
      <PerspectiveCamera 
        ref={cameraRef}
        makeDefault 
        position={defaultPosition} 
        fov={40} 
      />
      
      {/* 控制器 - 大幅增加缩放范围 */}
      <OrbitControls 
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxPolarAngle={Math.PI / 1.8}
        minPolarAngle={Math.PI / 8}
        minDistance={1}
        maxDistance={100}
        target={defaultTarget}
        enableDamping={true}
        dampingFactor={0.05}
        zoomSpeed={1.5}
        panSpeed={1.2}
        onChange={saveCameraState} // 当相机状态改变时保存
      />
      
      {/* 简化光照系统 */}
      <ambientLight intensity={0.6} color="#ffffff" />
      
      {/* 只保留一个主光源 */}
      <directionalLight 
        position={[15, 20, 10]} 
        intensity={1.2} 
        color="#ffffff"
        castShadow={quality !== 'low'}
        shadow-mapSize-width={quality === 'ultra' ? 2048 : 1024}
        shadow-mapSize-height={quality === 'ultra' ? 2048 : 1024}
      />
      
      {/* 只在高质量模式下添加补充光源 */}
      {quality !== 'low' && (
        <pointLight position={[0, 5, 5]} intensity={0.4} color="#e6f3ff" />
      )}
      
      {/* 只在超高质量模式下使用环境贴图 */}
      {quality === 'ultra' && (
        <Environment preset="studio" environmentIntensity={0.3} />
      )}
      
      {/* 3D模型 */}
      <PreciseDepthMapModel 
        depthMapUrl={depthMapUrl}
        modelHeight={modelHeight}
        width={width}
        height={height}
        quality={quality}
      />
      
      {/* 简化的参考网格 */}
      {quality !== 'low' && (
        <>
          <gridHelper 
            args={[20, 20]} 
            position={[0, -0.2, 0]} 
          />
          <mesh position={[0, -0.201, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[20, 20]} />
            <meshBasicMaterial 
              color="#f8f9fa" 
              opacity={0.15} 
              transparent={true} 
            />
          </mesh>
        </>
      )}
      
      {/* 简化背景 */}
      <color attach="background" args={['#f5f5f5']} />
    </>
  );
}

// 主组件
export function DepthMap3DViewer({ 
  depthMapUrl, 
  modelHeight, 
  width, 
  height, 
  quality = 'high',
  initialCameraState,
  onCameraStateChange 
}: DepthMap3DViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExitHint, setShowExitHint] = useState(false);
  const [currentQuality, setCurrentQuality] = useState<'low' | 'medium' | 'high' | 'ultra'>(quality);
  const [renderTime, setRenderTime] = useState<number>(0);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 性能监控
  React.useEffect(() => {
    const startTime = performance.now();
    const timer = setTimeout(() => {
      const endTime = performance.now();
      setRenderTime(endTime - startTime);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [currentQuality, depthMapUrl, modelHeight]);
  
  const showHintWithDelay = () => {
    setShowExitHint(true);
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current);
    }
    hintTimeoutRef.current = setTimeout(() => {
      setShowExitHint(false);
    }, 3000);
  };
  
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      showHintWithDelay();
    }
  };
  
  // 性能优化的质量设置标签
  const qualityLabels = {
    low: '流畅模式',
    medium: '平衡模式 (推荐)',
    high: '高质量',
    ultra: '极致质量'
  };
  
  // 监听ESC键退出全屏
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    
    let mouseMoveTimeout: NodeJS.Timeout | null = null;
    const handleMouseMove = () => {
      if (isFullscreen) {
        if (mouseMoveTimeout) {
          clearTimeout(mouseMoveTimeout);
        }
        mouseMoveTimeout = setTimeout(() => {
          showHintWithDelay();
        }, 200); // 增加防抖延迟
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousemove', handleMouseMove);
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }
      if (mouseMoveTimeout) {
        clearTimeout(mouseMoveTimeout);
      }
    };
  }, [isFullscreen]);
  
  // 全屏时的样式
  const containerStyle = isFullscreen 
    ? "fixed inset-0 z-50 bg-gradient-to-b from-blue-50 to-gray-100"
    : "relative w-full h-96 bg-gradient-to-b from-blue-50 to-gray-100 rounded-lg overflow-hidden border border-gray-300 shadow-lg";
  
  return (
    <div className={containerStyle}>
      {/* 全屏按钮 */}
      <FullscreenButton onToggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen} />
      
      {/* 质量选择器 */}
      <div className="absolute top-3 left-16 z-10">
        <select
          value={currentQuality}
          onChange={(e) => setCurrentQuality(e.target.value as any)}
          className="text-xs bg-white bg-opacity-90 border border-gray-300 rounded px-2 py-1 shadow-sm"
          title="渲染质量设置"
        >
          {Object.entries(qualityLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      
      <Canvas 
        shadows={{ 
          enabled: currentQuality !== 'low', // 低质量关闭阴影
          type: THREE.PCFShadowMap // 使用更快的阴影类型
        }}
        camera={{ position: [8, 15, 12], fov: 40 }}
        gl={{ 
          antialias: currentQuality !== 'low', // 低质量关闭抗锯齿
          alpha: false,
          powerPreference: 'high-performance',
          logarithmicDepthBuffer: false, // 关闭对数深度缓冲提高性能
        }}
        dpr={currentQuality === 'low' ? 1 : Math.min(window.devicePixelRatio, 1.5)} // 降低像素比
        performance={{ min: 0.8 }} // 设置最低帧率
      >
        <EnhancedScene 
          depthMapUrl={depthMapUrl}
          modelHeight={modelHeight}
          width={width}
          height={height}
          quality={currentQuality}
          initialCameraState={initialCameraState}
          onCameraStateChange={onCameraStateChange}
        />
      </Canvas>
      
      {/* 增强的控制提示 */}
      <div className={`absolute bottom-3 left-3 text-xs text-gray-700 bg-white bg-opacity-90 px-3 py-2 rounded-lg backdrop-blur-sm shadow-sm ${isFullscreen ? 'text-sm' : ''}`}>
        <div className="space-y-1">
          <div>🖱️ <strong>左键</strong>：旋转视角</div>
          <div>🎯 <strong>右键</strong>：平移视图</div>
          <div>⚡ <strong>滚轮</strong>：缩放距离 (1-100倍)</div>
          {renderTime > 0 && <div>⏱️ <strong>渲染:</strong> {renderTime.toFixed(0)}ms</div>}
        </div>
      </div>
      
      {/* 增强的信息面板 */}
      <div className={`absolute top-3 right-3 text-xs text-gray-700 bg-white bg-opacity-90 px-4 py-3 rounded-lg backdrop-blur-sm shadow-sm ${isFullscreen ? 'text-sm' : ''}`}>
        <div className="space-y-1">
          <div><strong>模型高度:</strong> {modelHeight.toFixed(1)}mm</div>
          <div><strong>原始分辨率:</strong> {width}×{height}</div>
          <div><strong>渲染质量:</strong> {qualityLabels[currentQuality]}</div>
          {renderTime > 0 && (
            <div className={`${renderTime > 500 ? 'text-red-600' : renderTime > 200 ? 'text-yellow-600' : 'text-green-600'}`}>
              <strong>性能:</strong> {renderTime > 500 ? '较慢' : renderTime > 200 ? '一般' : '流畅'}
            </div>
          )}
        </div>
      </div>
      
      {/* 性能指示器 */}
      <div className="absolute bottom-3 right-3 text-xs text-gray-600 bg-white bg-opacity-80 px-2 py-1 rounded">
        {renderTime > 500 ? '🐌' : renderTime > 200 ? '🚀' : '⚡'} 渲染中
      </div>
      
      {/* 全屏时的退出提示 */}
      {isFullscreen && showExitHint && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-none z-20 transition-opacity duration-500">
          <div className="bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg text-sm">
            💡 按 ESC 键或点击 <span className="text-yellow-300">⬅️</span> 按钮退出全屏
          </div>
        </div>
      )}
    </div>
  );
} 