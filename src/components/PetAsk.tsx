import { useMemo, useState } from 'react';
import { cityLabel, searchCities } from '../utils/citySearch';
import type { City } from '../data/cities';

// 펫이 말풍선으로 묻는 "어느 동네에 있어요?" 대화(날씨 도시 고르기).
// 입력 포커스는 사용자가 입력칸을 직접 눌렀을 때만 가져간다(autoFocus 없음). Esc나 "나중에"로 닫는다.
export default function PetAsk({ onPick, onClose }: { onPick: (c: City) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchCities(q), [q]);
  const typed = q.trim().length > 0;
  return (
    <div className="pet-ask" role="dialog" aria-label="날씨 도시 고르기"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <p className="pet-ask-title">어느 동네에 있어요?</p>
      <input className="pet-ask-input" type="text" autoComplete="off" spellCheck={false} value={q} maxLength={20}
        placeholder="예: 의정부, 부산 중구" aria-label="동네 이름"
        onChange={e => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) onPick(results[0]); }} />
      {typed && results.length > 0 && (
        <div className="pet-ask-list">
          {results.map(c => <button key={c.id} type="button" className="pet-ask-opt" onClick={() => onPick(c)}>{cityLabel(c)}</button>)}
        </div>
      )}
      {typed && results.length === 0 && <p className="pet-ask-none">못 찾았어요, 다른 이름으로 알려줄래요?</p>}
      <button type="button" className="pet-ask-later" onClick={onClose}>나중에</button>
    </div>
  );
}
