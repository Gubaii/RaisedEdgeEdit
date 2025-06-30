import React from 'react';
import { Settings, Download } from 'lucide-react';
import { ShapeConfig, FileUploadResult } from '../types';
import { extractContour, generateGrayscaleWithEdges } from '../utils/imageProcessor';
import { exportSTL } from '../utils/stlExporter';

interface ParameterPanelProps {
  config: ShapeConfig;
  onChange: (config: ShapeConfig) => void;
  hasFile: boolean;
  uploadResult: FileUploadResult | null;
}

export function ParameterPanel({ config, onChange, hasFile, uploadResult }: ParameterPanelProps) {
  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const height = parseFloat(e.target.value) || 0;
    onChange({ ...config, height });
  };

  const handleEdgeTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const edgeType = e.target.value as ShapeConfig['edgeType'];
    onChange({ ...config, edgeType });
  };

  const handleCornerRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cornerRadius = parseFloat(e.target.value) || 0;
    onChange({ ...config, cornerRadius });
  };

  const handleChamferAngleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chamferAngle = parseFloat(e.target.value) || 0;
    onChange({ ...config, chamferAngle });
  };

  const handleExportSTL = () => {
    if (!uploadResult?.imageData) {
      alert('请先上传文件');
      return;
    }

    try {
      // 提取轮廓
      const contour = extractContour(uploadResult.imageData);
      
      // 生成带边缘效果的灰度图
      const grayscaleData = generateGrayscaleWithEdges(contour, {
        width: contour.width,
        height: contour.height,
        edgeType: config.edgeType,
        cornerRadius: config.cornerRadius,
        chamferAngle: config.chamferAngle
      });

      // 导出STL
      exportSTL({
        grayscaleData,
        height: config.height,
        filename: `3d-model-${config.edgeType}-${Date.now()}.stl`
      });
    } catch (error) {
      console.error('STL导出失败:', error);
      alert('STL导出失败，请重试');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Settings className="h-5 w-5 mr-2" />
          参数设置
        </h2>
      </div>
      
      <div className="p-4 space-y-6">
        {/* 高度设置 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            模型高度 (mm)
          </label>
          <input
            type="number"
            min="0.1"
            max="100"
            step="0.1"
            value={config.height}
            onChange={handleHeightChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="10"
          />
          <p className="text-xs text-gray-500 mt-1">
            设置模型的总高度
          </p>
        </div>

        {/* 边缘类型 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            边缘类型
          </label>
          <select
            value={config.edgeType}
            onChange={handleEdgeTypeChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="vertical">垂直边缘</option>
            <option value="rounded">圆角边缘</option>
            <option value="chamfered">切角边缘</option>
          </select>
        </div>

        {/* 圆角半径 */}
        {config.edgeType === 'rounded' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              圆角半径 (像素)
            </label>
            <input
              type="number"
              min="0.1"
              max="50"
              step="0.1"
              value={config.cornerRadius}
              onChange={handleCornerRadiusChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="1"
            />
            <p className="text-xs text-gray-500 mt-1">
              圆角的半径大小
            </p>
          </div>
        )}

        {/* 切角角度 */}
        {config.edgeType === 'chamfered' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              切角角度 (度)
            </label>
            <input
              type="number"
              min="15"
              max="75"
              step="1"
              value={config.chamferAngle}
              onChange={handleChamferAngleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="45"
            />
            <p className="text-xs text-gray-500 mt-1">
              切角的倾斜角度
            </p>
          </div>
        )}

        {/* 导出按钮 */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={handleExportSTL}
            disabled={!hasFile}
            className={`
              w-full flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium
              ${hasFile
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
              transition-colors
            `}
          >
            <Download className="h-4 w-4 mr-2" />
            导出STL文件
          </button>
          {!hasFile && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              请先上传文件
            </p>
          )}
        </div>
      </div>
    </div>
  );
} 