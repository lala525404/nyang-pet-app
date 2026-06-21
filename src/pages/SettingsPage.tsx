import { useState, useEffect } from 'react';
import '../styles/settings.css';
import { ANIMALS } from '../data/animals';

interface PetSettings {
  alwaysOnTop: boolean;
  petVisible: boolean;
  distractEmoji: boolean;
  workStart: string;
  workEnd: string;
  animalId: string;
  customImages: (string | null)[];
  distractInterval: number;
  imageRotateInterval: number;
  moveSpeed: number;
  zone: number;
  yarEnabled: boolean;
  yarInterval: number;
  useCustomMode: boolean;
  buddyMode: 'chill' | 'buddy' | 'chaos' | 'custom';
  size: number; // 50~200
  breakTimeEnabled: boolean;
  lunchTime: string;
  leaveTime: string;
}

const DEFAULT: PetSettings = {
  alwaysOnTop: true, petVisible: true, distractEmoji: true,
  workStart: '09:00', workEnd: '18:00', animalId: 'cat',
  customImages: [null, null, null], distractInterval: 30,
  imageRotateInterval: 60, useCustomMode: false, moveSpeed: 5, zone: 0,
  yarEnabled: false, yarInterval: 60, buddyMode: 'buddy', size: 100,
  breakTimeEnabled: false, lunchTime: '12:00', leaveTime: '18:00',
};

const MODE_PRESETS: Record<string, Partial<PetSettings>> = {
  chill: { moveSpeed: 1, distractEmoji: false, yarEnabled: false, buddyMode: 'chill' },
  buddy: { moveSpeed: 5, distractEmoji: true, distractInterval: 30, yarEnabled: false, buddyMode: 'buddy' },
  chaos: { moveSpeed: 10, distractEmoji: true, distractInterval: 10, yarEnabled: true, yarInterval: 30, buddyMode: 'chaos' },
};

type NavPage = 'buddy' | 'mode' | 'display' | 'yar' | 'breaktime' | 'custom' | 'help';

function loadSettings(): PetSettings {
  try {
    const s = localStorage.getItem('petSettings');
    return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT;
  } catch { return DEFAULT; }
}
function saveSettings(s: PetSettings) {
  localStorage.setItem('petSettings', JSON.stringify(s));
}

// 아코디언 컴포넌트 (외부에서 open 제어)
function Acc({ icon, title, badge, badgeOn, open, onToggle, children }: {
  icon: string; title: string; badge?: string;
  badgeOn?: boolean; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="settings-section">
      <button className="section-label" onClick={onToggle}>
        <span className="section-icon">{icon}</span>
        <span>{title}</span>
        {badge !== undefined && (
          <span className={`badge ${badgeOn ? 'badge-on' : 'badge-off'}`}>{badge}</span>
        )}
        <span className={`section-arrow ${open ? 'open' : ''}`}>▼</span>
      </button>
      {open && <div className="section-content">{children}</div>}
    </div>
  );
}

function TimePreview({ workStart, workEnd }: { workStart: string; workEnd: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const h = now.getHours(), m = now.getMinutes();
  const pad = (n: number) => String(n).padStart(2, '0');
  const total = h * 60 + m;
  const [sh, sm] = workStart.split(':').map(Number);
  const [eh, em] = workEnd.split(':').map(Number);
  const startMin = sh * 60 + sm, endMin = eh * 60 + em;
  let zone = '';
  if (total < 5 * 60)            zone = '🌙 새벽';
  else if (total < startMin)     zone = '☀️ 출근 전';
  else if (total < 12 * 60)      zone = '💼 오전 근무 중';
  else if (total < 13 * 60)      zone = '🍱 점심시간';
  else if (total < endMin - 60)  zone = '💻 오후 근무 중';
  else if (total < endMin)       zone = '⏰ 퇴근 임박!';
  else if (total < endMin + 60)  zone = '🎉 퇴근 시간!';
  else if (total < 21 * 60)      zone = '🏠 저녁';
  else                           zone = '🌙 밤';
  return (
    <div className="time-preview-box">
      <span className="preview-time">지금 {pad(h)}:{pad(m)}</span>
      <span className="preview-zone">{zone}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [saved, setSaved] = useState<PetSettings>(loadSettings);
  const [draft, setDraft] = useState<PetSettings>(loadSettings);
  const [toast, setToast] = useState(false);
  const [page, setPage] = useState<NavPage>('buddy');
  // 아코디언 열린 섹션 (한 번에 하나만)
  const [openSection, setOpenSection] = useState<string>('speed');

  const toggleSection = (key: string) =>
    setOpenSection(prev => prev === key ? '' : key);

  useEffect(() => { const s = loadSettings(); setSaved(s); setDraft(s); }, []);

  const isDirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const update = (patch: Partial<PetSettings>) =>
    setDraft(prev => ({ ...prev, ...patch, buddyMode: 'custom' }));
  const applyMode = (mode: 'chill' | 'buddy' | 'chaos') =>
    setDraft(prev => ({ ...prev, ...MODE_PRESETS[mode], size: prev.size }));
  const handleApply = () => {
    saveSettings(draft);
    setSaved(draft);
    window.electronAPI?.setAlwaysOnTop(draft.alwaysOnTop);
    if (draft.petVisible) window.electronAPI?.showPet();
    else window.electronAPI?.hidePet();
    window.electronAPI?.setYarTimer(draft.yarEnabled ? draft.yarInterval : 0);
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  };

  const currentAnimal = ANIMALS.find(a => a.id === draft.animalId) || ANIMALS[0];
  const activeImages = draft.customImages.filter(Boolean);
  const headerEmoji = draft.useCustomMode && activeImages.length > 0 ? '🖼️' : currentAnimal.emoji;

  const NAV: { id: NavPage; icon: string; label: string; badge?: string }[] = [
    { id: 'buddy',   icon: '🎮', label: '버디 설정',   badge: draft.useCustomMode ? '커스텀' : currentAnimal.name },
    { id: 'mode',    icon: '✨', label: '모드 선택',   badge: draft.buddyMode === 'custom' ? '커스텀' : draft.buddyMode === 'chill' ? 'Chill' : draft.buddyMode === 'buddy' ? 'Buddy' : 'Chaos' },
    { id: 'display', icon: '👁️', label: '표시 설정',   badge: draft.petVisible ? '보임' : '숨김' },
    { id: 'yar',     icon: '🎉', label: '야르~ 타임',  badge: draft.yarEnabled ? `${draft.yarInterval}분` : '꺼짐' },
    { id: 'breaktime', icon: '🍱', label: '알림', badge: draft.breakTimeEnabled ? '켜짐' : '꺼짐' },
    { id: 'custom',  icon: '⚙️', label: '커스텀 설정' },
    { id: 'help',    icon: '💡', label: '사용 방법' },
  ];

  return (
    <div className="settings-root">
      {toast && <div className="toast">✅ 설정이 저장됐어요!</div>}

      {/* 사이드바 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">
            최애를<br/><span>풀어놨습니다</span>
          </div>
          <div className="sidebar-version">v1.0.5</div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button key={n.id}
              className={`nav-item ${page === n.id ? 'nav-item--active' : ''}`}
              onClick={() => setPage(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn-quit" onClick={() => window.electronAPI?.quitApp()}>
            ⏻ 앱 종료
          </button>
        </div>
      </aside>

      {/* 메인 */}
      <div className="settings-main">
        <div className="main-header">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div className="main-title">{NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}</div>
              <div className="main-desc">
                {page === 'buddy'   && '함께할 버디를 선택해요'}
                {page === 'mode'    && '클릭 한 번으로 설정이 자동으로 맞춰져요'}
                {page === 'display' && '버디 표시 여부와 위치를 설정해요'}
                {page === 'yar'     && '정해진 간격마다 이모지가 쏟아져요!'}
                {page === 'custom'  && '세부 설정을 직접 조절해요'}
                {page === 'help'    && '버디와 함께하는 방법을 알아봐요'}
              </div>
            </div>
            {isDirty && <div className="unsaved-badge">저장 안 됨</div>}
          </div>
        </div>

        <div className="main-body">

          {/* 버디 설정 */}
          {page === 'buddy' && (
            <>
              <div className="mode-tabs">
                <button className={`mode-tab ${!draft.useCustomMode ? 'mode-tab--active' : ''}`}
                  onClick={() => setDraft(p => ({ ...p, useCustomMode: false }))}>
                  🐾 이모지 버디
                </button>
                <button className={`mode-tab ${draft.useCustomMode ? 'mode-tab--active' : ''}`}
                  onClick={() => setDraft(p => ({ ...p, useCustomMode: true }))}>
                  🖼️ 커스텀 이미지
                </button>
              </div>

              {!draft.useCustomMode && (
                <div className="animal-grid">
                  {ANIMALS.map(animal => (
                    <button key={animal.id}
                      className={`animal-btn ${draft.animalId === animal.id ? 'animal-selected' : ''}`}
                      onClick={() => setDraft(p => ({ ...p, animalId: animal.id }))}>
                      <span className="animal-emoji">{animal.emoji}</span>
                      <span className="animal-name">{animal.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {draft.useCustomMode && (
                <div className="dark-card">
                  <div className="dark-card-body">
                    <p className="section-desc">
                      최대 3개 업로드 → 순서대로 돌아가요.<br/>
                      <span className="spec-tag">PNG / SVG</span>
                      <span className="spec-tag">100×100 ~ 300×300px</span>
                      <span className="spec-tag">최대 5MB</span>
                    </p>
                    <div className="upload-grid">
                      {[0, 1, 2].map(i => (
                        <div key={i} className={`upload-slot ${draft.customImages[i] ? 'upload-slot--filled' : ''}`}>
                          <div className="upload-slot-num">{i + 1}</div>
                          {draft.customImages[i] ? (
                            <>
                              <img src={draft.customImages[i]!} alt={`custom ${i+1}`} className="upload-slot-img" />
                              <button className="upload-slot-remove" onClick={() => {
                                const next = [...draft.customImages]; next[i] = null;
                                setDraft(p => ({ ...p, customImages: next }));
                              }}>✕</button>
                            </>
                          ) : (
                            <label className="upload-slot-add">
                              +
                              <input type="file" accept=".png,.svg,.jpg,.jpeg,.webp" style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (file.size > 5 * 1024 * 1024) { alert('5MB 이하로 해주세요!'); return; }
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    const next = [...draft.customImages];
                                    next[i] = ev.target?.result as string;
                                    setDraft(p => ({ ...p, customImages: next }));
                                  };
                                  reader.readAsDataURL(file);
                                }} />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                    {activeImages.length >= 2 && (
                      <div className="interval-row" style={{ marginTop: 12 }}>
                        <span className="interval-label">🔄 교체 주기</span>
                        <input type="range" min={30} max={1800} step={30}
                          value={draft.imageRotateInterval}
                          onChange={e => update({ imageRotateInterval: Number(e.target.value) })}
                          className="interval-slider" />
                        <span className="interval-value">
                          {draft.imageRotateInterval < 60 ? `${draft.imageRotateInterval}초`
                            : `${Math.floor(draft.imageRotateInterval / 60)}분`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 모드 선택 */}
          {page === 'mode' && (
            <>
              <div className="mode-tabs-3">
                {(['chill', 'buddy', 'chaos'] as const).map(m => (
                  <button key={m}
                    className={`mode-tab-3 ${draft.buddyMode === m ? 'mode-tab-3--active' : ''}`}
                    onClick={() => applyMode(m)}>
                    <span className="mode-tab-emoji">{m === 'chill' ? '🧘' : m === 'buddy' ? '🐾' : '🔥'}</span>
                    <span className="mode-tab-name">{m === 'chill' ? 'Chill' : m === 'buddy' ? 'Buddy' : 'Chaos'}</span>
                    <span className="mode-tab-desc">{m === 'chill' ? '조용히 옆에' : m === 'buddy' ? '기본 친구' : '신나게 난리'}</span>
                  </button>
                ))}
              </div>
              <div className="mode-desc-box">
                {draft.buddyMode === 'chill'  && '🧘 거의 안 움직이고 조용히 있어요. 집중이 필요할 때!'}
                {draft.buddyMode === 'buddy'  && '🐾 가끔 움직이고 말풍선도 띄워요. 기본 설정이에요.'}
                {draft.buddyMode === 'chaos'  && '🔥 광속으로 날아다니고 기습 이모지에 야르타임까지! 재미용!'}
                {draft.buddyMode === 'custom' && '⚙️ 커스텀 설정으로 직접 조절 중이에요.'}
              </div>
              <div style={{ fontSize: 11.5, color: '#bbb', textAlign: 'center' }}>
                💡 커스텀 설정에서 좀 더 상세히 설정할 수 있어요
              </div>
            </>
          )}

          {/* 표시 설정 */}
          {page === 'display' && (
            <div className="dark-card">
              <div className="dark-card-body">
                <div className="btn-row" style={{ marginBottom: 16 }}>
                  <button className="btn btn-primary"
                    onClick={() => setDraft(p => ({ ...p, petVisible: true }))}
                    disabled={draft.petVisible}>✨ 보이기</button>
                  <button className="btn btn-secondary"
                    onClick={() => setDraft(p => ({ ...p, petVisible: false }))}
                    disabled={!draft.petVisible}>🙈 숨기기</button>
                  <button className="btn btn-accent"
                    onClick={() => window.electronAPI?.callPet()}>📣 버디 부르기!</button>
                </div>
                <div className="btn-row">
                  <button className={`btn ${draft.alwaysOnTop ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => update({ alwaysOnTop: true })}
                    disabled={draft.alwaysOnTop}>📌 항상 위 켜기</button>
                  <button className={`btn ${!draft.alwaysOnTop ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => update({ alwaysOnTop: false })}
                    disabled={!draft.alwaysOnTop}>🔓 항상 위 끄기</button>
                </div>
              </div>
            </div>
          )}

          {/* 야르 타임 */}
          {page === 'yar' && (
            <Acc icon="🎉" title="야르~ 타임 설정"
              badge={draft.yarEnabled ? `${draft.yarInterval}분마다` : '꺼짐'}
              badgeOn={draft.yarEnabled}
              open={openSection === 'yar'} onToggle={() => toggleSection('yar')}>
              <p className="section-desc">정해진 간격마다 이모지가 화면에 쏟아져요! 🎊</p>
              <div className="radio-group" style={{ marginBottom: 12 }}>
                <label className={`radio-item ${draft.yarEnabled ? 'radio-selected' : ''}`}>
                  <input type="radio" name="yar" checked={draft.yarEnabled}
                    onChange={() => update({ yarEnabled: true })} />
                  <span>켜기</span>
                </label>
                <label className={`radio-item ${!draft.yarEnabled ? 'radio-selected' : ''}`}>
                  <input type="radio" name="yar" checked={!draft.yarEnabled}
                    onChange={() => update({ yarEnabled: false })} />
                  <span>끄기</span>
                </label>
              </div>
              {draft.yarEnabled && (
                <>
                  <select className="time-input" style={{ marginBottom: 12, fontSize: 13 }}
                    value={draft.yarInterval}
                    onChange={e => update({ yarInterval: Number(e.target.value) })}>
                    <option value={30}>30분마다</option>
                    <option value={60}>1시간마다</option>
                    <option value={90}>1시간 30분마다</option>
                    <option value={120}>2시간마다</option>
                    <option value={180}>3시간마다</option>
                  </select>
                  <button className="btn btn-accent" style={{ width:'100%', justifyContent:'center' }}
                    onClick={() => window.electronAPI?.yarNow()}>
                    🎉 지금 야르~ 타임!
                  </button>
                </>
              )}
            </Acc>
          )}

          {/* 출퇴근 알림 */}
          {page === 'breaktime' && (
            <Acc icon="🍱" title="알림 설정"
              badge={draft.breakTimeEnabled ? '켜짐' : '꺼짐'}
              badgeOn={draft.breakTimeEnabled}
              open={openSection === 'breaktime'} onToggle={() => toggleSection('breaktime')}>
              <p className="section-desc">점심시간, 퇴근시간에 화면 가득 알림이 떠요! 🎉</p>
              <div className="radio-group" style={{ marginBottom: 12 }}>
                <label className={`radio-item ${draft.breakTimeEnabled ? 'radio-selected' : ''}`}>
                  <input type="radio" name="breaktime" checked={draft.breakTimeEnabled}
                    onChange={() => update({ breakTimeEnabled: true })} />
                  <span>켜기</span>
                </label>
                <label className={`radio-item ${!draft.breakTimeEnabled ? 'radio-selected' : ''}`}>
                  <input type="radio" name="breaktime" checked={!draft.breakTimeEnabled}
                    onChange={() => update({ breakTimeEnabled: false })} />
                  <span>끄기</span>
                </label>
              </div>
              {draft.breakTimeEnabled && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:700, marginBottom:6, color:'#666' }}>🍚 점심시간</label>
                    <input type="time" className="time-input"
                      value={draft.lunchTime}
                      onChange={e => update({ lunchTime: e.target.value })} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:700, marginBottom:6, color:'#666' }}>🏃 퇴근시간</label>
                    <input type="time" className="time-input"
                      value={draft.leaveTime}
                      onChange={e => update({ leaveTime: e.target.value })} />
                  </div>
                  <div className="btn-row">
                    <button className="btn btn-accent" style={{ flex: 1, justifyContent:'center' }}
                      onClick={() => window.electronAPI?.testBreakTime('lunch')}>
                      🍱 점심 테스트
                    </button>
                    <button className="btn btn-accent" style={{ flex: 1, justifyContent:'center' }}
                      onClick={() => window.electronAPI?.testBreakTime('leave')}>
                      🏃 퇴근 테스트
                    </button>
                  </div>
                </>
              )}
            </Acc>
          )}

          {/* 커스텀 설정 - 아코디언 그룹 (하나만 열림) */}
          {page === 'custom' && (
            <>
              <Acc icon="📐" title="버디 크기"
                badge={`${draft.size || 100}%`}
                open={openSection === 'sizeAdj'} onToggle={() => toggleSection('sizeAdj')}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {([
                    { val: 70, label: '🔹 소' },
                    { val: 100, label: '▪️ 중' },
                    { val: 150, label: '🔷 대' },
                  ] as {val:number, label:string}[]).map(s => (
                    <button key={s.val}
                      className={`mode-tab ${(draft.size || 100) === s.val ? 'mode-tab--active' : ''}`}
                      onClick={() => update({ size: s.val })}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </Acc>

              <Acc icon="🏃" title="움직임 속도"
                badge={draft.moveSpeed <= 2 ? '느긋' : draft.moveSpeed <= 5 ? '보통' : draft.moveSpeed <= 8 ? '빠름' : '광속'}
                open={openSection === 'speed'} onToggle={() => toggleSection('speed')}>
                <div className="interval-row">
                  <span className="interval-label">🐢</span>
                  <input type="range" min={1} max={10} step={1}
                    value={draft.moveSpeed}
                    onChange={e => update({ moveSpeed: Number(e.target.value) })}
                    className="interval-slider" />
                  <span className="interval-label">🐇</span>
                  <span className="interval-value">
                    {draft.moveSpeed <= 2 ? '느긋' : draft.moveSpeed <= 5 ? '보통' : draft.moveSpeed <= 8 ? '빠름' : '광속'}
                  </span>
                </div>
              </Acc>

              <Acc icon="🎭" title="졸림 방지 이모지"
                badge={draft.distractEmoji ? `${draft.distractInterval}초마다` : '꺼짐'}
                badgeOn={draft.distractEmoji}
                open={openSection === 'distract'} onToggle={() => toggleSection('distract')}>
                <div className="radio-group" style={{ marginBottom: draft.distractEmoji ? 10 : 0 }}>
                  <label className={`radio-item ${draft.distractEmoji ? 'radio-selected' : ''}`}>
                    <input type="radio" name="distract" checked={draft.distractEmoji}
                      onChange={() => update({ distractEmoji: true })} />
                    <span>켜기</span>
                  </label>
                  <label className={`radio-item ${!draft.distractEmoji ? 'radio-selected' : ''}`}>
                    <input type="radio" name="distract" checked={!draft.distractEmoji}
                      onChange={() => update({ distractEmoji: false })} />
                    <span>끄기</span>
                  </label>
                </div>
                {draft.distractEmoji && (
                  <div className="interval-row">
                    <span className="interval-label">⏱️ 주기</span>
                    <input type="range" min={10} max={300} step={5}
                      value={draft.distractInterval}
                      onChange={e => update({ distractInterval: Number(e.target.value) })}
                      className="interval-slider" />
                    <span className="interval-value">
                      {draft.distractInterval < 60 ? `${draft.distractInterval}초`
                        : `${Math.floor(draft.distractInterval / 60)}분`}
                    </span>
                  </div>
                )}
              </Acc>

              <Acc icon="📍" title="활동 구역"
                badge={draft.zone === 0 ? '전체' : ['','좌상단','우상단','좌하단','우하단'][draft.zone]}
                badgeOn={draft.zone !== 0}
                open={openSection === 'zone'} onToggle={() => toggleSection('zone')}>
                <p className="section-desc">버디가 돌아다닐 화면 구역을 선택해요.</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                  {[
                    { val:1, label:'↖️ 좌상단' },
                    { val:2, label:'↗️ 우상단' },
                    { val:3, label:'↙️ 좌하단' },
                    { val:4, label:'↘️ 우하단' },
                  ].map(z => (
                    <button key={z.val}
                      className={`mode-tab ${draft.zone === z.val ? 'mode-tab--active' : ''}`}
                      onClick={() => update({ zone: z.val })}>
                      {z.label}
                    </button>
                  ))}
                </div>
                <button className={`mode-tab ${draft.zone === 0 ? 'mode-tab--active' : ''}`}
                  style={{ width:'100%' }}
                  onClick={() => update({ zone: 0 })}>
                  🖥️ 전체 화면 (기본)
                </button>
              </Acc>

              <Acc icon="🕐" title="출퇴근 시간"
                open={openSection === 'work'} onToggle={() => toggleSection('work')}>
                <div className="time-row">
                  <div className="time-field">
                    <label className="time-label">🌅 출근</label>
                    <input type="time" className="time-input" value={draft.workStart}
                      onChange={e => update({ workStart: e.target.value })} />
                  </div>
                  <div className="time-divider">→</div>
                  <div className="time-field">
                    <label className="time-label">🌇 퇴근</label>
                    <input type="time" className="time-input" value={draft.workEnd}
                      onChange={e => update({ workEnd: e.target.value })} />
                  </div>
                </div>
                <TimePreview workStart={draft.workStart} workEnd={draft.workEnd} />
              </Acc>
            </>
          )}

          {/* 사용 방법 */}
          {page === 'help' && (
            <div className="dark-card">
              <div className="dark-card-body">
                <ul className="tips-list">
                  <li>🖱️ 드래그해서 화면 어디든 이동 가능해요</li>
                  <li>👆 클릭하면 반응해요 (2~3번 중 1번 파티클!)</li>
                  <li>👆👆 더블클릭하면 무조건 파티클 팡팡!</li>
                  <li>🏃 마우스를 2초간 올려두면 버디가 도망가요</li>
                  <li>🖱️ 우클릭하면 설정창이 열려요</li>
                  <li>📣 '버디 부르기' 버튼으로 버디를 불러올 수 있어요</li>
                  <li>💸 25일엔 월급 문구, 금요일엔 불금 문구가 나와요!</li>
                  <li>💤 마우스를 30초간 안 움직이면 버디가 낮잠 자요</li>
                  <li>💨 가끔 화면 반대편으로 순간이동해요</li>
                </ul>
              </div>
            </div>
          )}

        </div>

        <div className="main-footer">
          {isDirty && (
            <button className="btn btn-secondary" onClick={() => setDraft(saved)}>↩️ 취소</button>
          )}
          <button className={`btn ${isDirty ? 'btn-confirm' : 'btn-confirm-done'}`}
            onClick={handleApply} disabled={!isDirty}>
            {isDirty ? '✅ 확인' : '✔ 저장됨'}
          </button>
        </div>
      </div>
    </div>
  );
}
