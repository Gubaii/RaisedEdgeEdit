import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface ThreeViewerProps {
  grayscaleUrl?: string;
  width: number;
  height: number;
  modelHeight: number;
  edgeType: string;
}

export function ThreeViewer({ grayscaleUrl, width, height, modelHeight, edgeType }: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fullscreenMountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const fullscreenRendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const meshRef = useRef<THREE.Mesh>();
  const frameIdRef = useRef<number>();
  const controlsCleanupRef = useRef<(() => void)[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    if (!mountRef.current) return;
    initThreeJS();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (grayscaleUrl && sceneRef.current) {
      generateModel();
    }
  }, [grayscaleUrl, modelHeight, edgeType]);

  // 响应式调整渲染器大小
  useEffect(() => {
    if (rendererRef.current && cameraRef.current && !isFullscreen) {
      const newWidth = 500 * scale;
      const newHeight = 400 * scale;
      
      rendererRef.current.setSize(newWidth, newHeight);
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [scale]);

  // 全屏模式切换
  useEffect(() => {
    if (isFullscreen) {
      initFullscreenRenderer();
    } else {
      cleanupFullscreenRenderer();
    }
  }, [isFullscreen]);

  const cleanup = () => {
    if (frameIdRef.current) {
      cancelAnimationFrame(frameIdRef.current);
    }
    
    // 清理所有控制器事件
    controlsCleanupRef.current.forEach(cleanup => cleanup());
    controlsCleanupRef.current = [];
    
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    cleanupFullscreenRenderer();
  };

  const initThreeJS = () => {
    if (!mountRef.current) return;

    // 场景 - 只创建一次
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    // 相机 - 只创建一次
    const camera = new THREE.PerspectiveCamera(75, 500 / 400, 0.1, 1000);
    camera.position.set(2, 2, 2);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 普通渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(500, 400);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf8fafc);
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    // 设置场景内容 - 只设置一次
    setupScene(scene);
    
    // 设置普通模式控制器
    const cleanup = setupControls(renderer.domElement, camera);
    controlsCleanupRef.current.push(cleanup);

    animate();
    setIsInitialized(true);
    setDebugInfo('3D引擎初始化完成');
  };

  const setupScene = (scene: THREE.Scene) => {
    // 光照
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(3, 5, 3);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5);
    fillLight.position.set(-2, 2, -2);
    scene.add(fillLight);

    // 坐标轴
    const axesHelper = new THREE.AxesHelper(3);
    scene.add(axesHelper);

    // 网格
    const gridHelper = new THREE.GridHelper(6, 30, 0xcccccc, 0xeeeeee);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // 测试立方体 - 确保渲染器工作
    const testGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const testMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const testCube = new THREE.Mesh(testGeometry, testMaterial);
    testCube.position.set(1.5, 0.1, 1.5);
    scene.add(testCube);
  };

  const initFullscreenRenderer = () => {
    if (!fullscreenMountRef.current || !sceneRef.current || !cameraRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf8fafc);
    fullscreenRendererRef.current = renderer;

    // 更新相机宽高比
    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();

    fullscreenMountRef.current.appendChild(renderer.domElement);
    
    // 设置全屏控制器
    const cleanup = setupControls(renderer.domElement, cameraRef.current);
    controlsCleanupRef.current.push(cleanup);

    setDebugInfo('全屏模式已激活');
  };

  const cleanupFullscreenRenderer = () => {
    if (fullscreenRendererRef.current) {
      if (fullscreenMountRef.current) {
        fullscreenMountRef.current.innerHTML = '';
      }
      fullscreenRendererRef.current.dispose();
      fullscreenRendererRef.current = undefined;
      
      // 恢复普通模式相机比例
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = 500 / 400;
        cameraRef.current.updateProjectionMatrix();
      }
    }
  };

  const setupControls = (canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera): (() => void) => {
    let isMouseDown = false;
    let mouseX = 0;
    let mouseY = 0;

    const onMouseDown = (event: MouseEvent) => {
      isMouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isMouseDown) return;

      const deltaX = event.clientX - mouseX;
      const deltaY = event.clientY - mouseY;

      const spherical = new THREE.Spherical();
      spherical.setFromVector3(camera.position);
      
      spherical.theta -= deltaX * 0.01;
      spherical.phi += deltaY * 0.01;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0, 0);

      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const onMouseUp = () => {
      isMouseDown = false;
    };

    const onWheel = (event: WheelEvent) => {
      const scale = event.deltaY > 0 ? 1.1 : 0.9;
      camera.position.multiplyScalar(scale);
      
      const distance = camera.position.length();
      if (distance < 0.5) {
        camera.position.normalize().multiplyScalar(0.5);
      } else if (distance > 20) {
        camera.position.normalize().multiplyScalar(20);
      }
      
      camera.lookAt(0, 0, 0);
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel);

    // 返回清理函数
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  };

  const generateModel = async () => {
    if (!grayscaleUrl || !sceneRef.current) return;

    setIsLoading(true);
    setDebugInfo('开始加载灰度图...');

    try {
      // 移除旧模型
      if (meshRef.current) {
        sceneRef.current.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach(material => material.dispose());
        } else {
          meshRef.current.material.dispose();
        }
      }

      const heightMap = await loadHeightMap(grayscaleUrl);
      setDebugInfo('高度图加载完成，生成几何体...');
      
      const geometry = createGeometryFromHeightMap(heightMap);
      const material = createMaterial();
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, 0, 0);
      
      sceneRef.current.add(mesh);
      meshRef.current = mesh;

      const vertexCount = geometry.attributes.position.count;
      const faceCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;
      setDebugInfo(`模型生成成功！顶点: ${vertexCount}, 面: ${faceCount}`);

    } catch (error) {
      console.error('生成3D模型失败:', error);
      setDebugInfo('模型生成失败: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHeightMap = async (url: string): Promise<number[][]> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建canvas上下文'));
          return;
        }

        const resolution = 64;
        canvas.width = resolution;
        canvas.height = resolution;
        
        ctx.drawImage(img, 0, 0, resolution, resolution);
        const imageData = ctx.getImageData(0, 0, resolution, resolution);
        
        const heightMap: number[][] = [];
        let hasHeight = false;
        let maxHeight = 0;
        
        for (let y = 0; y < resolution; y++) {
          heightMap[y] = [];
          for (let x = 0; x < resolution; x++) {
            const pixelIndex = (y * resolution + x) * 4;
            const grayValue = imageData.data[pixelIndex];
            const normalizedHeight = grayValue / 255;
            const scaledHeight = normalizedHeight * Math.max(1, modelHeight / 5);
            heightMap[y][x] = scaledHeight;
            
            if (scaledHeight > 0.01) {
              hasHeight = true;
              maxHeight = Math.max(maxHeight, scaledHeight);
            }
          }
        }
        
        console.log('高度图数据:', { resolution, hasHeight, maxHeight, modelHeight });
        resolve(heightMap);
      };
      
      img.onerror = () => reject(new Error('图像加载失败'));
      img.src = url;
    });
  };

  const createGeometryFromHeightMap = (heightMap: number[][]): THREE.BufferGeometry => {
    const resolution = heightMap.length;
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let y = 0; y <= resolution; y++) {
      for (let x = 0; x <= resolution; x++) {
        const worldX = (x / resolution - 0.5) * 3;
        const worldZ = (y / resolution - 0.5) * 3;
        
        let height = 0;
        if (x < resolution && y < resolution) {
          height = heightMap[y][x];
        }
        
        vertices.push(worldX, height, worldZ);
        uvs.push(x / resolution, y / resolution);
      }
    }

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const a = y * (resolution + 1) + x;
        const b = y * (resolution + 1) + x + 1;
        const c = (y + 1) * (resolution + 1) + x;
        const d = (y + 1) * (resolution + 1) + x + 1;

        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    
    console.log('几何体边界框:', geometry.boundingBox);
    console.log('几何体信息:', { 顶点数: vertices.length / 3, 面数: indices.length / 3 });

    return geometry;
  };

  const createMaterial = (): THREE.Material => {
    let color: number;
    
    switch (edgeType) {
      case 'rounded':
        color = 0x8b5cf6;
        break;
      case 'chamfered':
        color = 0x3b82f6;
        break;
      default:
        color = 0xa855f7;
    }

    return new THREE.MeshPhongMaterial({
      color: color,
      emissive: 0x222222,
      emissiveIntensity: 0.02,
      specular: 0x111111,
      shininess: 50,
      flatShading: false,
      side: THREE.DoubleSide,
      transparent: false,
    });
  };

  const animate = () => {
    if (sceneRef.current && cameraRef.current) {
      if (isFullscreen && fullscreenRendererRef.current) {
        fullscreenRendererRef.current.render(sceneRef.current, cameraRef.current);
      } else if (rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }
    frameIdRef.current = requestAnimationFrame(animate);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <>
      {/* 普通预览 */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-700">Three.js 3D实体模型</p>
          
          <div className="flex items-center space-x-2">
            {/* 全屏按钮 */}
            <button
              onClick={toggleFullscreen}
              className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              🖥️ 全屏
            </button>
            
            {/* 缩放控制 */}
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.25))}
              className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
            >
              🔍-
            </button>
            <span className="text-xs text-gray-600">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(Math.min(2, scale + 0.25))}
              className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
            >
              🔍+
            </button>
          </div>
        </div>
        
        <div className="relative bg-white rounded border overflow-hidden" style={{ height: 'fit-content' }}>
          <div 
            ref={mountRef} 
            className="cursor-grab active:cursor-grabbing"
            style={{ 
              width: `${500 * scale}px`, 
              height: `${400 * scale}px`,
              maxWidth: '100%',
              overflow: 'hidden'
            }}
          />
          
          {(isLoading || !isInitialized) && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90">
              <div className="text-center">
                <div className="animate-spin mx-auto h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
                <p className="text-gray-600 text-sm">
                  {!isInitialized ? '初始化3D引擎...' : '生成3D实体模型...'}
                </p>
              </div>
            </div>
          )}
          
          <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
            WebGL 3D
          </div>

          <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
            🔴X 🟢Y 🔵Z
          </div>

          <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
            {edgeType} 边缘
          </div>
        </div>
        
        <div className="mt-2 text-xs text-gray-500 text-center">
          <p>尺寸: {width}×{height} | 高度: {modelHeight}mm</p>
          <p className="text-[10px] mt-1">💡 拖拽旋转 | 滚轮缩放 | WebGL渲染</p>
          {debugInfo && <p className="text-[10px] mt-1 text-blue-600">🔧 {debugInfo}</p>}
        </div>
      </div>

      {/* 全屏模态框 */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
          <div className="relative w-full h-full">
            <div 
              ref={fullscreenMountRef}
              className="w-full h-full cursor-grab active:cursor-grabbing"
            />
            
            {/* 全屏控制栏 */}
            <div className="absolute top-4 right-4 flex items-center space-x-2">
              <div className="bg-black bg-opacity-70 text-white px-3 py-2 rounded text-sm">
                全屏3D预览 - {edgeType}边缘 - {modelHeight}mm
              </div>
              <button
                onClick={toggleFullscreen}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm"
              >
                ✕ 退出全屏
              </button>
            </div>

            <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded text-sm">
              🔴X 🟢Y 🔵Z | 拖拽旋转 | 滚轮缩放
            </div>

            {debugInfo && (
              <div className="absolute bottom-4 right-4 bg-black bg-opacity-70 text-white px-3 py-2 rounded text-sm">
                🔧 {debugInfo}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
} 