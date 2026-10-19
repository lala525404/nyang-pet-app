import { useCallback, useEffect, useId, useState } from 'react';
import Cropper from 'react-easy-crop';
import '../styles/crop.css';
import { getCroppedImage, type PixelCrop } from '../utils/cropImage';

interface CropModalProps {
  src: string;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
}

export default function CropModal({ src, onCancel, onApply }: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [shape, setShape] = useState<'rect' | 'round'>('rect');
  const [pixels, setPixels] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const zoomId = useId();

  const onCropComplete = useCallback((_area: unknown, areaPixels: PixelCrop) => {
    setPixels(areaPixels);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleApply = async () => {
    if (!pixels || busy) return;
    setBusy(true);
    try {
      const url = await getCroppedImage(src, pixels, 512);
      onApply(url);
    } catch {
      alert('이미지를 자르지 못했어요. 다른 사진으로 시도해 주세요.');
      setBusy(false);
    }
  };

  return (
    <div className="crop-overlay">
      <div className="crop-modal" role="dialog" aria-modal="true" aria-labelledby={`${zoomId}-title`}>
        <div className="crop-header">
          <h3 className="crop-title" id={`${zoomId}-title`}>✂️ 사진 자르기</h3>
          <p className="crop-subtitle">버디로 쓸 영역을 정사각형으로 골라주세요</p>
        </div>

        <div className="crop-area">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            showGrid
            cropShape={shape === 'round' ? 'round' : 'rect'}
            zoomWithScroll
            minZoom={1}
            maxZoom={4}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="crop-controls">
          <div className="crop-zoom-row">
            <label className="crop-zoom-label" htmlFor={zoomId}>확대</label>
            <input id={zoomId} className="crop-zoom-slider" type="range"
              min={1} max={4} step={0.05} value={zoom}
              onChange={e => setZoom(Number(e.target.value))} />
            <span className="crop-zoom-value">{zoom.toFixed(1)}x</span>
          </div>
          <div className="crop-shape-toggle">
            <button type="button" className={`crop-shape-btn ${shape === 'rect' ? 'crop-shape-btn--active' : ''}`}
              aria-pressed={shape === 'rect'} onClick={() => setShape('rect')}>⬜ 사각</button>
            <button type="button" className={`crop-shape-btn ${shape === 'round' ? 'crop-shape-btn--active' : ''}`}
              aria-pressed={shape === 'round'} onClick={() => setShape('round')}>⚪ 원형</button>
          </div>
          <p className="crop-hint">드래그로 이동 · 휠로 확대/축소</p>
        </div>

        <div className="crop-footer">
          <button type="button" className="crop-btn crop-btn--cancel" onClick={onCancel} disabled={busy}>취소</button>
          <button type="button" className="crop-btn crop-btn--apply" onClick={handleApply} disabled={busy || !pixels}>
            {busy ? '처리 중...' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
