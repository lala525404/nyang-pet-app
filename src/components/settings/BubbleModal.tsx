import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useDialog } from '../ui';
import { BUBBLE_MAX_CHARS, BUBBLE_MAX_MESSAGES, charCount, cleanBubbleMessages } from '../../utils/settings';
import type { PaneProps } from './shared';

// 글자 수 제한 안에서 잘라 낸다 (이모지 한 개는 1글자)
const limit = (text: string) => Array.from(text).slice(0, BUBBLE_MAX_CHARS).join('');

// 말풍선 메시지 편집: 최대 5개, 한 개는 20자까지. 바꾸면 바로 저장되고 버디에 반영된다.
export default function BubbleModal({ settings: s, patch, onClose, suspended }: Pick<PaneProps, 'settings' | 'patch'> & {
  onClose: () => void;
  suspended: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const messages = Array.isArray(s.bubbleMessages) ? s.bubbleMessages.slice(0, BUBBLE_MAX_MESSAGES) : [];
  const set = (next: string[]) => patch({ bubbleMessages: next });

  // 닫을 때 빈 칸은 정리해서 저장한다
  const close = () => {
    const cleaned = cleanBubbleMessages(messages);
    if (cleaned.length !== messages.length || cleaned.some((m, i) => m !== messages[i])) set(cleaned);
    onClose();
  };
  useDialog(dialogRef, close, suspended);

  useEffect(() => {
    if (focusIdx !== null) { inputsRef.current[focusIdx]?.focus(); setFocusIdx(null); }
  }, [focusIdx]);

  const clockOn = s.bubbleClock !== false;
  const empty = cleanBubbleMessages(messages).length === 0;

  return (
    <div className="ui-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="bubble-modal-title" ref={dialogRef} tabIndex={-1}>
        <div className="ui-modal-head">
          <div>
            <h3 className="ui-modal-title" id="bubble-modal-title">말풍선 메시지</h3>
            <p className="ui-note">최대 {BUBBLE_MAX_MESSAGES}개, 한 개는 {BUBBLE_MAX_CHARS}자까지예요. 순서대로 하나씩 보여줘요.</p>
          </div>
          <button type="button" className="ui-iconbtn" onClick={close} aria-label="닫기">
            <X className="ui-i" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <div className="st-stack">
          <div className="st-msgs">
            {messages.map((text, i) => {
              const left = BUBBLE_MAX_CHARS - charCount(text);
              return (
                <div key={i} className="st-msg">
                  <input ref={el => { inputsRef.current[i] = el; }} type="text" className="st-msg-input" value={text}
                    placeholder={`메시지 ${i + 1}`} aria-label={`메시지 ${i + 1}`} aria-describedby={`msg-left-${i}`}
                    onChange={e => set(messages.map((m, k) => (k === i ? limit(e.target.value) : m)))} />
                  <span className="st-msg-count" id={`msg-left-${i}`} data-low={left <= 3 ? '' : undefined}>남은 글자 {left}</span>
                  <button type="button" className="ui-iconbtn" aria-label={`메시지 ${i + 1} 지우기`}
                    onClick={() => set(messages.filter((_, k) => k !== i))}>
                    <X className="ui-i" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="ui-btn" disabled={messages.length >= BUBBLE_MAX_MESSAGES}
            onClick={() => { set([...messages, '']); setFocusIdx(messages.length); }}>
            <Plus className="ui-i" strokeWidth={1.5} aria-hidden />
            메시지 추가 ({messages.length}/{BUBBLE_MAX_MESSAGES})
          </button>
          <p className="ui-note">
            {empty
              ? (clockOn ? '메시지가 없으면 시계만 보여요.' : '메시지가 없고 시계도 꺼져 있으면 말풍선이 뜨지 않아요.')
              : `메시지가 없는 동안에는 ${clockOn ? '현재 시간을 보여줘요.' : '말풍선이 숨겨져요.'}`}
          </p>
        </div>

        <div className="ui-modal-foot">
          <button type="button" className="ui-btn ui-btn--primary" onClick={close}>완료</button>
        </div>
      </div>
    </div>
  );
}
