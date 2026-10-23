import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Switch, useDialog } from '../ui';
import { PARENT_SHORT, cityById } from '../../data/cities';
import { cityLabel, searchCities } from '../../utils/citySearch';
import type { PaneProps } from './shared';

// 날씨 설정(말풍선 팝오버의 "날씨" 버튼으로 연다. 새 칩을 만들지 않는다): 동의 안내 → 켜기/끄기 → 도시 검색·삭제.
// 동의("켤게요") 전에는 어떤 요청도 보내지 않는다(메인도 동의+켜짐을 확인하기 전에는 요청을 막는다).
export default function WeatherModal({ settings: s, patch, onClose, suspended }: Pick<PaneProps, 'settings' | 'patch'> & {
  onClose: () => void;
  suspended: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, onClose, suspended);
  const [q, setQ] = useState('');
  const results = useMemo(() => searchCities(q), [q]);
  const consent = s.weatherConsent === true;
  const enabled = s.weatherEnabled === true;
  const city = cityById(s.weatherCityId);

  return (
    <div className="ui-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby="weather-modal-title" ref={dialogRef} tabIndex={-1}>
        <div className="ui-modal-head">
          <div>
            <h3 className="ui-modal-title" id="weather-modal-title">날씨</h3>
            <p className="ui-note">출근·퇴근길에 날씨를 알려 주고, 버디를 누르면 지금 날씨를 보여줘요</p>
          </div>
          <button type="button" className="ui-iconbtn" onClick={onClose} aria-label="닫기">
            <X className="ui-i" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        {!consent ? (
          <div className="st-stack">
            <p className="ui-note st-weather-consent">날씨를 켜면 선택한 도시의 대략적인 좌표가 날씨 서비스(Open-Meteo)로 전송돼요. 이름·사진·알람 같은 개인 정보는 보내지 않아요.</p>
            <div className="st-weather-btns">
              <button type="button" className="ui-btn ui-btn--primary" onClick={() => patch({ weatherConsent: true, weatherEnabled: true })}>켤게요</button>
              <button type="button" className="ui-btn" onClick={() => { patch(s.bubbleIdle === 'weather' ? { weatherEnabled: false, bubbleIdle: 'clock' } : { weatherEnabled: false }); onClose(); }}>안 할래요</button>
            </div>
          </div>
        ) : (
          <div className="st-stack">
            <div className="st-row"><span>날씨 사용</span><Switch checked={enabled} onChange={v => patch({ weatherEnabled: v })} label="날씨 사용" /></div>
            <div className="st-row">
              <span className="st-weather-city">{city ? `${city.name} · ${PARENT_SHORT[city.parent] ?? city.parent}` : '도시를 아직 고르지 않았어요'}</span>
              {city && <button type="button" className="ui-btn ui-btn--sm" onClick={() => patch({ weatherCityId: '' })}>도시 삭제</button>}
            </div>
            <input className="st-text" type="text" autoComplete="off" spellCheck={false} maxLength={20} value={q} onChange={e => setQ(e.target.value)}
              placeholder={city ? '다른 도시 검색 (예: 부산 중구)' : '도시 검색 (예: 의정부)'} aria-label="도시 검색" />
            {q.trim() && results.length > 0 && (
              <div className="st-weather-results">
                {results.map(c => (
                  <button key={c.id} type="button" className="ui-btn ui-btn--sm" onClick={() => { patch({ weatherCityId: c.id, weatherEnabled: true }); setQ(''); }}>{cityLabel(c)}</button>
                ))}
              </div>
            )}
            {q.trim() && results.length === 0 && <p className="ui-note">못 찾았어요, 다른 이름으로 검색해 보세요.</p>}
            {enabled && !city && <p className="ui-note">도시를 고르지 않으면 버디가 직접 "어느 동네에 있어요?"라고 물어봐요.</p>}
          </div>
        )}

        <div className="ui-modal-foot">
          <p className="ui-note st-credit">날씨 데이터: Open-Meteo (CC BY 4.0)</p>
          <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  );
}
