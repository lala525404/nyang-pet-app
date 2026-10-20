import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { X } from 'lucide-react';
import '../styles/ui.css';
import '../styles/crop.css';
import { getCroppedImage } from '../utils/cropImage';
import type { CustomShape } from './CatEmoji';
import { RangeInput, Segmented } from './ui';

interface CropModalProps {
  src: string;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
  shape: CustomShape;
  onShapeChange: (shape: CustomShape) => void;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

export default function CropModal({ src, onCancel, onApply, shape, onShapeChange }: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const zoomId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  // 마운트 시 1회: 포커스 이동/복원, Esc 취소, Tab 순환
  useEffect(() => {
    cancelledRef.current = false;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelledRef.current = true;
      window.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, []);

  const handleApply = async () => {
    if (!pixels || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const url = await getCroppedImage(src, pixels, 512);
      if (cancelledRef.current) return;
      onApply(url);
    } catch {
      if (cancelledRef.current) return;
      alert('이미지를 자르지 못했어요. 다른 사진으로 시도해 주세요.');
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="ui-overlay ui-overlay--top">
      <div className="ui-modal crop-modal" role="dialog" aria-modal="true" aria-labelledby={`${zoomId}-title`}
        ref={dialogRef} tabIndex={-1}>
        <div className="ui-modal-head">
          <div className="crop-header">
            <h3 className="ui-modal-title" id={`${zoomId}-title`}>사진 자르기</h3>
            <p className="ui-note">버디로 쓸 영역을 정사각형으로 골라주세요</p>
          </div>
          <button type="button" className="ui-iconbtn" onClick={onCancel} disabled={busy} aria-label="닫기">
            <X className="ui-i" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <div className={`crop-area ${shape === 'rounded' ? 'crop-area--rounded' : ''}`}>
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
          <div className="ui-range-row crop-zoom-row">
            <label className="ui-end" htmlFor={zoomId}>확대</label>
            <RangeInput id={zoomId} min={1} max={4} step={0.05} value={zoom} onChange={setZoom} />
            <span className="ui-val">{zoom.toFixed(1)}x</span>
          </div>
          <Segmented<CustomShape> label="버디 모양" value={shape} onChange={onShapeChange}
            options={[{ value: 'round', label: '원형' }, { value: 'rounded', label: '사각형' }]} />
          <p className="crop-hint">드래그로 이동 · 휠로 확대/축소 · 버디는 가이드와 같은 모양으로 보여요</p>
        </div>

        <div className="crop-footer">
          <button type="button" className="ui-btn" onClick={onCancel} disabled={busy}>취소</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={handleApply} disabled={busy || !pixels}>
            {busy ? '처리 중...' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
