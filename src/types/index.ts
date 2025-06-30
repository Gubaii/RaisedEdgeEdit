export interface ShapeConfig {
  height: number; // 高度，单位mm
  edgeType: 'vertical' | 'rounded' | 'chamfered';
  cornerRadius: number; // 圆角半径，当edgeType为rounded时使用
  chamferAngle: number; // 切角角度，当edgeType为chamfered时使用
}

export interface FileUploadResult {
  file: File;
  imageData?: ImageData;
  svgData?: string;
}

export interface GrayscaleOptions {
  width: number;
  height: number;
  edgeType: ShapeConfig['edgeType'];
  cornerRadius: number;
  chamferAngle: number;
} 