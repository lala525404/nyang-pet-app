import { Switch } from '../ui';
import type { PaneProps } from './shared';

// 부팅 후 오늘 브리핑: 켜기/끄기(기본 켜짐)와 "지금 브리핑 보기". 끄면 띄우지 않고 마지막으로 띄운 날(lastBriefDate)도 바꾸지 않는다.
// "지금 브리핑 보기"는 켜기/끄기·요일·오늘 이미 띄웠는지와 상관없이 보여 주고 그 기록도 바꾸지 않는다(개발 모드 포함, 메인의 안내 카드를 쓴다).
export default function BriefRow({ settings: s, patch }: Pick<PaneProps, 'settings' | 'patch'>) {
  const on = s.briefEnabled !== false;
  const show = window.electronAPI?.showBrief;
  return (
    <>
      <div className="st-row"><span>부팅 후 오늘 브리핑</span><Switch checked={on} onChange={v => patch({ briefEnabled: v })} label="부팅 후 오늘 브리핑" /></div>
      <p className="ui-note">{on ? '컴퓨터를 켜고 3분쯤 뒤, 하루에 한 번 오늘 일정과 날씨를 알려 줘요. 주말·공휴일엔 일정이 있을 때만요.' : '켜면 컴퓨터를 켠 뒤 하루에 한 번 오늘 일정과 날씨를 알려 줘요.'}</p>
      {show && <button type="button" className="ui-btn" onClick={() => show()}>지금 브리핑 보기</button>}
    </>
  );
}
