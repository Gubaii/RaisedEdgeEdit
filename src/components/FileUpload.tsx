import React, { useCallback, useState } from 'react';
import { Upload, FileImage, File } from 'lucide-react';
import { FileUploadResult } from '../types';
import { createImageFromFile, createImageFromSVG } from '../utils/imageProcessor';

interface FileUploadProps {
  onUpload: (result: FileUploadResult) => void;
}

export function FileUpload({ onUpload }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const result: FileUploadResult = { file };

      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
        // 处理SVG文件
        const svgText = await file.text();
        result.svgData = svgText;
        result.imageData = await createImageFromSVG(svgText);
      } else if (file.type.startsWith('image/')) {
        // 处理PNG等图像文件
        result.imageData = await createImageFromFile(file);
      } else {
        throw new Error('不支持的文件格式');
      }

      onUpload(result);
    } catch (error) {
      console.error('文件处理失败:', error);
      alert('文件处理失败，请检查文件格式');
    } finally {
      setIsProcessing(false);
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">文件上传</h2>
        <p className="text-sm text-gray-600 mt-1">
          支持 SVG、PNG 等格式
        </p>
      </div>
      
      <div className="p-4">
        <div
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragging 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
            }
            ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isProcessing ? (
            <div className="space-y-3">
              <div className="animate-spin mx-auto h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <p className="text-gray-600">正在处理文件...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-center">
                <Upload className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <p className="text-gray-600">
                  拖拽文件到此处，或
                  <label className="text-blue-600 hover:text-blue-700 cursor-pointer ml-1">
                    点击选择文件
                    <input
                      type="file"
                      className="hidden"
                      accept=".svg,.png,.jpg,.jpeg"
                      onChange={handleFileSelect}
                    />
                  </label>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  支持 SVG、PNG、JPG 格式
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <File className="h-4 w-4" />
            <span>SVG: 矢量图形，保持清晰度</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <FileImage className="h-4 w-4" />
            <span>PNG/JPG: 位图格式，自动提取轮廓</span>
          </div>
        </div>
      </div>
    </div>
  );
} 