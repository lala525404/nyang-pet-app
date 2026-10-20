import { ArrowLeftRight, Calendar, Eye, Megaphone, Move, MousePointerClick, Moon, SlidersHorizontal, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
];

export default function HelpPane() {
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
      <p className="ui-note st-credit">
        버디 이미지: Twemoji © Twitter, Inc. and other contributors · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </p>
    </section>
  );
}
