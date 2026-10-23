import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cityById } from '../../data/cities';
import type { City } from '../../data/cities';
import { cityLabel, searchPlaces } from '../../utils/citySearch';
import { useDialog } from '../ui';
import type { PaneProps } from './shared';

// 날씨 안부 동의 문구(동네를 고르는 순간 한 번 보여 준다)
export const WEATHER_CONSENT_TEXT = '이 동네의 날씨를 안부처럼 전해드릴게요. 선택한 동네의 대략적인 좌표가 날씨 서비스(Open-Meteo)로 전송돼요. 이름·사진·알람 같은 정보는 보내지 않아요.';
export const WEATHER_CREDIT = '날씨 데이터: Open-Meteo (CC BY 4.0)';

function ConsentDialog({ city, onYes, onNo }: { city: City; onYes: () => void; onNo: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onNo);
  return createPortal(
    <div className="ui-overlay ui-overlay--top" onMouseDown={(e) => { if (e.target === e.currentTarget) onNo(); }}>
      <div className="ui-modal st-weather-dialog" role="dialog" aria-modal="true" aria-labelledby="weather-consent-title" ref={ref} tabIndex={-1}>
        <h3 className="ui-modal-title" id="weather-consent-title">날씨 안부 · {cityLabel(city)}</h3>
        <p className="ui-note">{WEATHER_CONSENT_TEXT}</p>
        <div className="ui-modal-foot">
          <button type="button" className="ui-btn" onClick={onNo}>취소</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={onYes}>좋아요</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 말풍선 팝오버의 "날씨 안부: 동네" 한 줄: 동네 검색(후보 최대 5개) → 고르면 안내 대화상자 → [좋아요]에서만 동네와 동의를 함께 저장한다.
// 저장된 동네가 있으면 그 줄에 이름과 [바꾸기] [지우기](동네 삭제 + 동의 철회). 그 전에는 어떤 요청도 없다(요청은 동의가 저장된 뒤 메인이 한다).
// 평소에는 한 줄(44px)만 쓰고, 검색 중에만 후보 목록이 아래로 늘어난다.
export default function WeatherCityRow({ settings: s, patch }: Pick<PaneProps, 'settings' | 'patch'>) {
  const saved = cityById(s.weatherConsent ? s.weatherCityId : '');
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<City | null>(null);
  const hits = useMemo(() => searchPlaces(query), [query]);
  const searching = !saved || editing;
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (hits.length) listRef.current?.scrollIntoView({ block: 'nearest' }); }, [hits]);   // 후보가 팝오버 아래에 가려지지 않게

  const yes = () => {
    if (!pending) return;
    patch({ weatherCityId: pending.id, weatherConsent: true });   // 둘은 이때 함께 저장한다
    setPending(null); setQuery(''); setEditing(false);
  };

  return (
    <div className="st-weather">
      <div className="st-weather-line">
        {searching ? (
          <>
            <span className="st-weather-label">날씨 안부: 동네</span>
            <input type="text" className="st-text" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="예: 노량진" aria-label="날씨 안부 동네 검색" />
          </>
        ) : (
          <>
            <span className="st-weather-label st-weather-saved" title={saved ? cityLabel(saved) : undefined}>날씨 안부: <strong>{saved ? cityLabel(saved) : ''}</strong></span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setEditing(true)}>바꾸기</button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => { patch({ weatherCityId: '', weatherConsent: false }); setQuery(''); }}>지우기</button>
          </>
        )}
      </div>
      {searching && hits.length > 0 && (
        <div className="st-places" role="list" ref={listRef}>
          {hits.map(h => (
            <button key={h.label} type="button" className="ui-btn st-place" role="listitem" onClick={() => setPending(h.city)}>{h.label}</button>
          ))}
        </div>
      )}
      {searching && query.trim() !== '' && hits.length === 0 && <p className="ui-note">찾는 동네가 없어요. 시·군·구나 동 이름으로 찾아보세요.</p>}
      {searching && saved && <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setEditing(false); setQuery(''); }}>취소</button>}
      {pending && <ConsentDialog city={pending} onYes={yes} onNo={() => setPending(null)} />}
    </div>
  );
}
