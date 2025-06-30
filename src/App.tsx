import { useState, useEffect, useRef } from 'react';
import { SimpleFileUpload } from './components/SimpleFileUpload';
import { DepthMap3DViewer } from './components/DepthMap3DViewer';
import { processImageWithEdges, imageDataToDataURL, EdgeProcessorOptions } from './utils/edgeProcessor';

interface ProcessedImages {
  original: string;
  contour: string;
  depthMap: string;
  width: number;
  height: number;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);
  const [processedImages, setProcessedImages] = useState<ProcessedImages | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 参数设置
  const [edgeType, setEdgeType] = useState<'vertical' | 'rounded' | 'chamfered'>('vertical');
  const [edgeWidth, setEdgeWidth] = useState(20);
  const [chamferAngle, setChamferAngle] = useState(45);
  const [modelHeight, setModelHeight] = useState(1.5); // 新增：3D模型高度参数 (mm)
  
  // 相机状态管理
  const [cameraState, setCameraState] = useState<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(() => {
    // 从localStorage恢复相机状态
    try {
      const saved = localStorage.getItem('3d-camera-state');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  
  // 全屏状态管理（提升到App层级避免参数变化时重置）
  const [is3DFullscreen, setIs3DFullscreen] = useState(false);
  
  // 防抖计时器
  const debounceTimer = useRef<number | null>(null);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    
    try {
      console.log('开始处理文件:', file.name);
      
      // 加载图像
      const imageData = await loadImageFromFile(file);
      setOriginalImageData(imageData);
      
      // 处理图像
      await processImages(imageData);
      
    } catch (error) {
      console.error('文件处理失败:', error);
      alert('文件处理失败: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 防抖处理参数变化
  const debouncedProcessImages = (imageData: ImageData) => {
    // 设置防抖状态
    setIsDebouncing(true);
    
    // 清除之前的定时器
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    
    // 设置新的定时器，延迟300ms执行（减少延迟时间）
    debounceTimer.current = window.setTimeout(async () => {
      setIsDebouncing(false);
      await processImages(imageData);
    }, 300);
  };

  // 当参数改变时使用防抖处理
  useEffect(() => {
    if (originalImageData) {
      debouncedProcessImages(originalImageData);
    }
    
    // 清理函数
    return () => {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, [edgeType, edgeWidth, chamferAngle, originalImageData]);

  const loadImageFromFile = (file: File): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('无法创建Canvas上下文'));
        return;
      }

      img.onload = () => {
        // 保持原图尺寸，不进行缩放
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 不添加白色背景，保持透明
        // 直接绘制图像，保留透明度信息
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        console.log(`图像加载完成: ${canvas.width}x${canvas.height}px`);
        resolve(imageData);
      };

      img.onerror = () => reject(new Error('图像加载失败'));
      img.src = URL.createObjectURL(file);
    });
  };

  const processImages = async (imageData: ImageData) => {
    setIsProcessing(true);
    
    try {
      // 创建原图URL
      const originalUrl = imageDataToDataURL(imageData);
      
      // 创建轮廓图（二值化）
      const contourImageData = createContourImage(imageData);
      const contourUrl = imageDataToDataURL(contourImageData);
      
      // 创建深度图
      const depthMapOptions: EdgeProcessorOptions = {
        edgeType,
        edgeWidth,
        chamferAngle
      };
      
      const depthMapImageData = processImageWithEdges(imageData, depthMapOptions);
      const depthMapUrl = imageDataToDataURL(depthMapImageData);
      
      setProcessedImages({
        original: originalUrl,
        contour: contourUrl,
        depthMap: depthMapUrl,
        width: imageData.width,
        height: imageData.height
      });
      
    } catch (error) {
      console.error('图像处理失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const createContourImage = (imageData: ImageData): ImageData => {
    const { width, height, data } = imageData;
    const result = new ImageData(width, height);
    
    for (let i = 0; i < data.length; i += 4) {
      // const r = data[i];
      // const g = data[i + 1];
      // const b = data[i + 2];
      const a = data[i + 3];
      
      // 简化逻辑：只根据透明度判断
      if (a > 32) {
        // 不透明区域显示为白色
        result.data[i] = 255;     // R
        result.data[i + 1] = 255; // G
        result.data[i + 2] = 255; // B
        result.data[i + 3] = 255; // A
      } else {
        // 透明区域保持透明
        result.data[i] = 0;       // R
        result.data[i + 1] = 0;   // G
        result.data[i + 2] = 0;   // B
        result.data[i + 3] = 0;   // A - 保持透明
      }
    }
    
    return result;
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  // 保存相机状态的回调函数
  const handleCameraStateChange = (newState: { position: [number, number, number]; target: [number, number, number] }) => {
    setCameraState(newState);
    // 持久化到localStorage
    try {
      localStorage.setItem('3d-camera-state', JSON.stringify(newState));
    } catch (error) {
      console.warn('无法保存相机状态到localStorage:', error);
    }
  };

  // 全屏参数变化处理函数
  const handleParameterChange = (params: {
    edgeType?: 'vertical' | 'rounded' | 'chamfered';
    edgeWidth?: number;
    chamferAngle?: number;
    modelHeight?: number;
  }) => {
    if (params.edgeType !== undefined) {
      setEdgeType(params.edgeType);
    }
    if (params.edgeWidth !== undefined) {
      setEdgeWidth(params.edgeWidth);
    }
    if (params.chamferAngle !== undefined) {
      setChamferAngle(params.chamferAngle);
    }
    if (params.modelHeight !== undefined) {
      setModelHeight(params.modelHeight);
    }
  };

  // 3D全屏状态控制函数
  const handle3DFullscreenToggle = () => {
    setIs3DFullscreen(!is3DFullscreen);
  };

  // 监听ESC键退出全屏
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && is3DFullscreen) {
        setIs3DFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [is3DFullscreen]);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">3D浮雕模型生成器</h1>
          <p className="text-gray-600">为任意形状添加边缘效果并生成精细3D模型</p>
          <div className="flex justify-center space-x-6 mt-3 text-sm text-gray-500">
            <div className="flex items-center">
              <span className="mr-1">📐</span>
              深度图生成
            </div>
            <div className="flex items-center">
              <span className="mr-1">🎯</span>
              3D模型预览
            </div>
            <div className="flex items-center">
              <span className="mr-1">⚙️</span>
              实时参数调节
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：文件上传和参数控制 */}
          <div className="space-y-6">
            {/* 文件上传 */}
            <SimpleFileUpload onFileSelect={handleFileSelect} />
            
            {/* 参数控制面板 */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">参数设置</h2>
              
              <div className="space-y-4">
                {/* 边缘类型 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    边缘类型
                  </label>
                  <select
                    value={edgeType}
                    onChange={(e) => setEdgeType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="vertical">垂直边缘（无过渡）</option>
                    <option value="rounded">圆角边缘</option>
                    <option value="chamfered">切角边缘</option>
                  </select>
                </div>

                {/* 边缘宽度 */}
                {edgeType !== 'vertical' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      边缘宽度 (像素): {edgeWidth}
                      {(isProcessing || isDebouncing) && (
                        <span className="text-xs text-orange-500 ml-2">
                          {isDebouncing ? '准备计算...' : '计算中...'}
                        </span>
                      )}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={edgeWidth}
                      onChange={(e) => setEdgeWidth(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span>100</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      💡 拖拽结束后0.3秒开始计算
                    </p>
                  </div>
                )}

                {/* 切角角度 */}
                {edgeType === 'chamfered' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      切角角度 (度): {chamferAngle}°
                      {(isProcessing || isDebouncing) && (
                        <span className="text-xs text-orange-500 ml-2">
                          {isDebouncing ? '准备计算...' : '计算中...'}
                        </span>
                      )}
                    </label>
                    <input
                      type="range"
                      min="15"
                      max="75"
                      step="5"
                      value={chamferAngle}
                      onChange={(e) => setChamferAngle(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>15°</span>
                      <span>75°</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      💡 停止拖拽后0.3秒开始计算
                    </p>
                  </div>
                )}

                {/* 模型高度 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    模型高度 (mm): {modelHeight}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.1"
                    value={modelHeight}
                    onChange={(e) => setModelHeight(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0.5mm</span>
                    <span>5mm</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    🎯 适合浮雕制作的高度范围
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：图像显示区域 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 2D处理结果 */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                处理结果
                {(isProcessing || isDebouncing) && (
                  <span className="text-sm text-orange-500 ml-2">
                    {isDebouncing ? '⏱️ 准备计算...' : '⏳ 正在计算...'}
                  </span>
                )}
              </h2>
              
              {(isProcessing || isDebouncing) ? (
                <div className="h-96 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin mx-auto h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mb-3"></div>
                    <p className="text-gray-600">
                      {isDebouncing ? '准备处理图像...' : '正在处理图像...'}
                    </p>
                  </div>
                </div>
              ) : processedImages ? (
                <div className="space-y-6">
                  {/* 文件信息 */}
                  <div className="text-center border-b border-gray-200 pb-3">
                    <p className="font-medium text-gray-900">{selectedFile?.name}</p>
                    <p className="text-xs text-gray-500">
                      {processedImages.width}×{processedImages.height} • 
                      {edgeType === 'vertical' ? '垂直' : edgeType === 'rounded' ? '圆角' : '切角'}边缘
                      {edgeType !== 'vertical' && ` • 边缘宽度: ${edgeWidth}px`}
                      {edgeType === 'chamfered' && ` • 角度: ${chamferAngle}°`}
                      {` • 高度: ${modelHeight}mm`}
                    </p>
                  </div>
                  
                  {/* 图像网格 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 原图 */}
                    <div className="text-center">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">原图</h3>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <img 
                          src={processedImages.original} 
                          alt="原图" 
                          className="w-full h-auto bg-gray-50"
                        />
                      </div>
                      <button
                        onClick={() => downloadImage(processedImages.original, 'original.png')}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                      >
                        下载
                      </button>
                    </div>
                    
                    {/* 轮廓图 */}
                    <div className="text-center">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">轮廓图</h3>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <img 
                          src={processedImages.contour} 
                          alt="轮廓图" 
                          className="w-full h-auto bg-gray-50"
                        />
                      </div>
                      <button
                        onClick={() => downloadImage(processedImages.contour, 'contour.png')}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                      >
                        下载
                      </button>
                    </div>
                    
                    {/* 深度图 */}
                    <div className="text-center">
                      <h3 className="text-sm font-medium text-gray-700 mb-2">深度图</h3>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <img 
                          src={processedImages.depthMap} 
                          alt="深度图" 
                          className="w-full h-auto bg-gray-50"
                        />
                      </div>
                      <button
                        onClick={() => downloadImage(processedImages.depthMap, `depth-map-${edgeType}-${Date.now()}.png`)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        下载深度图
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-96 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <p>请选择一个图像文件开始处理</p>
                    <p className="text-sm mt-2">支持 PNG、JPG、SVG 格式</p>
                  </div>
                </div>
              )}
            </div>

            {/* 3D模型显示区域 */}
            {processedImages && !isProcessing && !isDebouncing && (
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <span className="mr-2">🎯</span>
                  3D模型预览
                  <span className="text-sm text-gray-500 ml-2 font-normal">
                    (高度: {modelHeight}mm)
                  </span>
                </h2>
                
                <DepthMap3DViewer
                  key="3d-viewer" // 稳定的key，避免重新挂载
                  depthMapUrl={processedImages.depthMap}
                  modelHeight={modelHeight}
                  width={processedImages.width}
                  height={processedImages.height}
                  initialCameraState={cameraState}
                  onCameraStateChange={handleCameraStateChange}
                  edgeType={edgeType}
                  edgeWidth={edgeWidth}
                  chamferAngle={chamferAngle}
                  isProcessing={isProcessing}
                  isDebouncing={isDebouncing}
                  onParameterChange={handleParameterChange}
                  isFullscreen={is3DFullscreen}
                  onFullscreenToggle={handle3DFullscreenToggle}
                />
                
                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500">
                    💡 拖拽调整高度参数可实时更新3D模型效果
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App; 