import { ArrowLeftRight, Calendar, Eye, Megaphone, Move, MousePointerClick, Moon, Power, SlidersHorizontal, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Switch } from '../ui';
import type { PaneProps } from './shared';

const TIPS: [LucideIcon, string][] = [
  [Move, '드래그해서 화면 어디든 이동 가능해요'],
  [MousePointerClick, '클릭하면 반응해요 (2~3번 중 1번 파티클!)'],
  [Zap, '더블클릭하면 무조건 파티클 팡팡!'],
  [Eye, '마우스를 2초간 올려두면 버디가 도망가요'],
  [SlidersHorizontal, '우클릭하면 설정창이 열려요'],
  [Megaphone, "'버디 부르기' 버튼으로 버디를 불러올 수 있어요"],
  [Calendar, '25일엔 월급 문구, 금요일엔 불금 문구가 나와요!'],
  [Moon, '마우스를 30초간 안 움직이면 버디가 낮잠 자요'],
  [ArrowLeftRight, '가끔 화면 반대편으로 순간이동해요'],
  [Power, '설정창을 닫아도 버디는 계속 실행돼요. 완전히 끄려면 트레이 아이콘 → 앱 종료'],
];

export default function HelpPane({ settings, patch, onReplayIntro, onReplayOnboarding }: Pick<PaneProps, 'settings' | 'patch'> & { onReplayIntro: () => void; onReplayOnboarding: () => void }) {
  return (
    <section className="st-pane">
      <article className="st-card st-help">
        {TIPS.map(([Icon, text]) => (
          <div key={text} className="st-tipline">
            <Icon className="ui-i" strokeWidth={1.5} aria-hidden />
            <span>{text}</span>
          </div>
        ))}
      </article>
      <article className="st-card st-intro-card">
        <div className="st-row"><span>시작 인트로 보기</span><Switch checked={settings.introEnabled !== false} onChange={v => patch({ introEnabled: v })} label="시작 인트로 보기" /></div>
        <p className="ui-note">새 버전을 처음 열 때 하트가 인사해요. 한 번 보면 다음 새 버전까지는 나오지 않아요.</p>
        <button type="button" className="ui-btn" onClick={onReplayIntro}>인트로 다시 보기</button>
      </article>
      <article className="st-card st-intro-card">
        <div className="st-row"><span>처음 안내</span></div>
        <p className="ui-note">버디 고르기, 알림 켜기, 끄는 방법을 3단계로 다시 보여 드려요. 지금 설정값이 채워진 채로 시작해요.</p>
        <button type="button" className="ui-btn" onClick={onReplayOnboarding}>처음 안내 다시 보기</button>
      </article>
      <p className="ui-note st-credit">
        버디 이미지: Twemoji © Twitter, Inc. and other contributors · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </p>
    </section>
  );
}
