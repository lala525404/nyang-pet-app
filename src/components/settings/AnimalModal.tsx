import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import CatEmoji, { customShapeRadius } from '../CatEmoji';
import { RangeInput, Segmented, useDialog } from '../ui';
import { formatInterval, makeRepresentative } from '../../utils/settings';
import { ANIMALS } from '../../data/animals';
import type { PaneProps } from './shared';

// 동물 바꾸기: 동물 타일 / 내 사진(최대 3장) 두 탭. 고르면 바로 적용된다.
export default function AnimalModal({ settings: s, update, patch, onClose, onPickPhoto, suspended }: PaneProps & {
  onClose: () => void;
  onPickPhoto: (slot: number) => void;
  suspended: boolean; // 사진 자르기 창이 위에 열려 있으면 Esc·Tab을 그쪽에 맡긴다
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, onClose, suspended);
  const radius = customShapeRadius(s.customShape);
  const activeCount = s.customImages.filter(Boolean).length;
  const firstSlot = s.customImages.findIndex(Boolean);   // 대표 = 내 사진 중 첫 번째
  const rotateEnabled = s.imageRotateEnabled !== false;

  return (
    <div className="ui-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="animal-modal-title" ref={dialogRef} tabIndex={-1}>
        <div className="ui-modal-head">
          <div>
            <h3 className="ui-modal-title" id="animal-modal-title">동물 바꾸기</h3>
            <p className="ui-note">고르면 바로 바뀌어요</p>
          </div>
          <button type="button" className="ui-iconbtn" onClick={onClose} aria-label="닫기">
            <X className="ui-i" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <Segmented<string> label="버디 종류" value={s.useCustomMode ? 'photo' : 'animal'}
          onChange={v => patch({ useCustomMode: v === 'photo' })}
          options={[{ value: 'animal', label: '동물' }, { value: 'photo', label: '내 사진' }]} />

        {!s.useCustomMode && (
          <div className="st-tiles" role="group" aria-label="동물 고르기">
            {ANIMALS.map(a => (
              <button key={a.id} type="button" className="st-tile" aria-pressed={s.animalId === a.id}
                onClick={() => patch({ animalId: a.id })}>
                <CatEmoji emoji={a.emoji} size={48} forceImage />
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        )}

        {s.useCustomMode && (
          <div className="st-stack">
            <p className="ui-note">내 사진으로 나만의 버디를 만들어 보세요! 최대 3개 업로드 → 순서대로 돌아가요. 사진이 없으면 기본 동물로 보여요.</p>
            <div className="st-slots">
              {[0, 1, 2].map(i => s.customImages[i] ? (
                <div key={i} className="st-slot-col">
                  <div className="st-slot">
                    <img src={s.customImages[i]!} alt={`내 사진 ${i + 1}${activeCount >= 2 && i === firstSlot ? ' (대표)' : ''}`} style={{ borderRadius: radius }} />
                    {activeCount >= 2 && i === firstSlot && <span className="st-badge">대표</span>}
                    <button type="button" className="st-slot-rm" aria-label={`사진 ${i + 1} 지우기`}
                      onClick={() => {
                        const next = [...s.customImages]; next[i] = null;
                        patch({ customImages: next });
                      }}>
                      <span className="st-dot"><X className="ui-i" strokeWidth={1.5} aria-hidden /></span>
                    </button>
                  </div>
                  {activeCount >= 2 && i !== firstSlot && (
                    <button type="button" className="ui-btn ui-btn--sm" aria-label={`사진 ${i + 1}을 대표로 지정`}
                      onClick={() => patch({ customImages: makeRepresentative(s.customImages, i) })}>대표로 지정</button>
                  )}
                </div>
              ) : (
                <div key={i} className="st-slot-col">
                  <button type="button" className="st-slot" aria-label={`사진 ${i + 1} 올리기`} onClick={() => onPickPhoto(i)}>
                    <Plus className="ui-i" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            {activeCount === 1 && <p className="ui-note">사진을 더 올리면 번갈아 보여줄 수 있어요.</p>}
            {activeCount >= 2 && <p className="ui-note">대표 사진은 점심·퇴근·알람 알림 카드에 나와요.</p>}
            <p className="ui-note">PNG / JPG / WEBP / SVG · 자동으로 정사각형 512px 이하로 저장 · 최대 5MB</p>
            {/* 사진 버디 설정 두 줄: 같은 모양(라벨 + 선택). 사진 교체는 사진이 2장 이상일 때만 의미가 있어 그때만 보인다(저장 키는 imageRotateEnabled·imageRotateInterval 그대로) */}
            <div className="st-stack">
              <p className="st-lab">버디 모양</p>
              <Segmented label="버디 모양" value={s.customShape} onChange={v => patch({ customShape: v })}
                options={[{ value: 'round', label: '원형' }, { value: 'rounded', label: '사각형' }]} />
            </div>
            {activeCount >= 2 && (
              <div className="st-stack">
                <p className="st-lab">사진 교체</p>
                <Segmented<'off' | 'on'> label="사진 교체" value={rotateEnabled ? 'on' : 'off'} onChange={v => patch({ imageRotateEnabled: v === 'on' })}
                  options={[{ value: 'off', label: '끔' }, { value: 'on', label: '켬' }]} />
                {rotateEnabled ? (
                  <div className="ui-range-row">
                    <label className="ui-end" htmlFor="rotate-interval">교체 주기</label>
                    <RangeInput id="rotate-interval" min={30} max={1800} step={30} value={s.imageRotateInterval}
                      onChange={v => patch({ imageRotateInterval: v })} />
                    <span className="ui-val">{formatInterval(s.imageRotateInterval)}마다</span>
                  </div>
                ) : <p className="ui-note">꺼 두면 대표 사진만 보여줘요.</p>}
              </div>
            )}
          </div>
        )}

        <div className="ui-modal-foot">
          <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  );
}
