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
  useCustomMode: boolean;
  imageRotateInterval: number;
  moveSpeed: number; // 1~10
}

const DEFAULT: PetSettings = {
  alwaysOnTop: true, petVisible: true, distractEmoji: true,
  workStart: '09:00', workEnd: '18:00', animalId: 'cat',
  customImages: [null, null, null], distractInterval: 30, imageRotateInterval: 60, useCustomMode: false, moveSpeed: 5,
};

function loadSettings(): PetSettings {
  try {
    const s = localStorage.getItem('petSettings');
    return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT;
  } catch { return DEFAULT; }
}
function saveSettings(s: PetSettings) {
  localStorage.setItem('petSettings', JSON.stringify(s));
}

function Section({ icon, title, badge, badgeOn, defaultOpen = false, children }: {
  icon: string; title: string; badge?: string;
  badgeOn?: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="settings-section">
      <button className="section-label" onClick={() => setOpen(o => !o)}>
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
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
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

  useEffect(() => {
    const s = loadSettings();
    setSaved(s); setDraft(s);
  }, []);

  const isDirty = JSON.stringify(saved) !== JSON.stringify(draft);

  const updateDraft = (patch: Partial<PetSettings>) => {
    setDraft(prev => ({ ...prev, ...patch }));
  };

  const handleApply = () => {
    saveSettings(draft);
    setSaved(draft);
    window.electronAPI?.setAlwaysOnTop(draft.alwaysOnTop);
    if (draft.petVisible) window.electronAPI?.showPet();
    else window.electronAPI?.hidePet();
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  };

  const handleCancel = () => setDraft(saved);

  const currentAnimal = ANIMALS.find(a => a.id === draft.animalId) || ANIMALS[0];
  const activeImages = draft.customImages.filter(Boolean);
  const headerIcon = draft.useCustomMode && activeImages.length > 0
    ? '🖼️' : currentAnimal.emoji;

  return (
    <div className="settings-root">
      {toast && <div className="toast">✅ 설정이 저장됐어요!</div>}

      <header className="settings-header">
        <div className="header-cat">{headerIcon}</div>
        <div className="header-text">
          <h1>일하기싫냥?</h1>
          <p>데스크탑 버디 설정</p>
        </div>
        {isDirty && <div className="unsaved-badge">저장 안 됨</div>}
      </header>

      <main className="settings-main">

        {/* ★ 버디 모드 선택 */}
        <Section icon="🎮" title="버디 모드" defaultOpen={true}
          badge={draft.useCustomMode ? '커스텀' : '이모지'} badgeOn={true}>
          <p className="section-desc">
            이모지 버디 또는 커스텀 이미지 중 선택해요.
          </p>
          <div className="mode-tabs">
            <button
              className={`mode-tab ${!draft.useCustomMode ? 'mode-tab--active' : ''}`}
              onClick={() => updateDraft({ useCustomMode: false })}
            >
              🐾 이모지 버디
            </button>
            <button
              className={`mode-tab ${draft.useCustomMode ? 'mode-tab--active' : ''}`}
              onClick={() => updateDraft({ useCustomMode: true })}
            >
              🖼️ 커스텀 이미지
            </button>
          </div>

          {/* 이모지 모드: 동물 선택 */}
          {!draft.useCustomMode && (
            <div style={{ marginTop: 12 }}>
              <p className="section-desc" style={{ marginBottom: 8 }}>함께할 버디를 선택해요!</p>
              <div className="animal-grid">
                {ANIMALS.map(animal => (
                  <button key={animal.id}
                    className={`animal-btn ${draft.animalId === animal.id ? 'animal-selected' : ''}`}
                    onClick={() => updateDraft({ animalId: animal.id })}>
                    <span className="animal-emoji">{animal.emoji}</span>
                    <span className="animal-name">{animal.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 커스텀 모드: 이미지 업로드 */}
          {draft.useCustomMode && (
            <div style={{ marginTop: 12 }}>
              <p className="section-desc">
                최대 3개까지 업로드하면 순서대로 돌아가요.<br/>
                <span className="spec-tag">권장: PNG / SVG</span>
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
                          const next = [...draft.customImages];
                          next[i] = null;
                          updateDraft({ customImages: next });
                        }}>✕</button>
                      </>
                    ) : (
                      <label className="upload-slot-add">
                        +
                        <input type="file" accept=".png,.svg,.jpg,.jpeg,.webp"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 5 * 1024 * 1024) { alert('5MB 이하로 해주세요!'); return; }
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const next = [...draft.customImages];
                              next[i] = ev.target?.result as string;
                              updateDraft({ customImages: next });
                            };
                            reader.readAsDataURL(file);
                          }} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              {activeImages.length === 0 && (
                <p style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>
                  ⚠️ 이미지를 1개 이상 업로드해야 커스텀 모드가 작동해요!
                </p>
              )}
              {activeImages.length >= 2 && (
                <div className="interval-row" style={{ marginTop: 10 }}>
                  <span className="interval-label">🔄 교체 주기</span>
                  <input type="range" min={30} max={1800} step={30}
                    value={draft.imageRotateInterval}
                    onChange={e => updateDraft({ imageRotateInterval: Number(e.target.value) })}
                    className="interval-slider" />
                  <span className="interval-value">
                    {draft.imageRotateInterval < 60
                      ? `${draft.imageRotateInterval}초`
                      : `${Math.floor(draft.imageRotateInterval / 60)}분${draft.imageRotateInterval % 60 > 0 ? ` ${draft.imageRotateInterval % 60}초` : ''}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* 버디 표시/숨기기 */}
        <Section icon="👁️" title="버디 표시"
          badge={draft.petVisible ? '보임' : '숨김'} badgeOn={draft.petVisible} defaultOpen={true}>
          <div className="btn-row">
            <button className="btn btn-primary"
              onClick={() => updateDraft({ petVisible: true })}
              disabled={draft.petVisible}>
              ✨ 보이기
            </button>
            <button className="btn btn-secondary"
              onClick={() => updateDraft({ petVisible: false })}
              disabled={!draft.petVisible}>🙈 숨기기</button>
            <button className="btn btn-accent"
              onClick={() => window.electronAPI?.callPet()}>📣 여기야!</button>
          </div>
        </Section>

        {/* 항상 위 */}
        <Section icon="📌" title="항상 위"
          badge={draft.alwaysOnTop ? '켜짐' : '꺼짐'} badgeOn={draft.alwaysOnTop} defaultOpen={true}>
          <div className="btn-row">
            <button className={`btn ${draft.alwaysOnTop ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateDraft({ alwaysOnTop: true })}
              disabled={draft.alwaysOnTop}>🔒 켜기</button>
            <button className={`btn ${!draft.alwaysOnTop ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateDraft({ alwaysOnTop: false })}
              disabled={!draft.alwaysOnTop}>🔓 끄기</button>
          </div>
        </Section>

        {/* 졸림 방지 */}
        <Section icon="🎭" title="졸림 방지"
          badge={draft.distractEmoji ? `${draft.distractInterval}초마다` : '꺼짐'}
          badgeOn={draft.distractEmoji} defaultOpen={false}>
          <div className="radio-group" style={{ marginBottom: 12 }}>
            <label className={`radio-item ${draft.distractEmoji ? 'radio-selected' : ''}`}>
              <input type="radio" name="distract" checked={draft.distractEmoji}
                onChange={() => updateDraft({ distractEmoji: true })} />
              <span>켜기 — 기습 이모지 + 컬러 말풍선</span>
            </label>
            <label className={`radio-item ${!draft.distractEmoji ? 'radio-selected' : ''}`}>
              <input type="radio" name="distract" checked={!draft.distractEmoji}
                onChange={() => updateDraft({ distractEmoji: false })} />
              <span>끄기</span>
            </label>
          </div>
          {draft.distractEmoji && (
            <div className="interval-row">
              <span className="interval-label">⏱️ 주기</span>
              <input type="range" min={10} max={300} step={5}
                value={draft.distractInterval}
                onChange={e => updateDraft({ distractInterval: Number(e.target.value) })}
                className="interval-slider" />
              <span className="interval-value">
                {draft.distractInterval < 60
                  ? `${draft.distractInterval}초`
                  : `${Math.floor(draft.distractInterval / 60)}분${draft.distractInterval % 60 > 0 ? ` ${draft.distractInterval % 60}초` : ''}`}
              </span>
            </div>
          )}
        </Section>

        {/* 움직임 속도 */}
        <Section icon="🏃" title="움직임 속도" defaultOpen={true}
          badge={draft.moveSpeed <= 2 ? '느림' : draft.moveSpeed <= 5 ? '보통' : draft.moveSpeed <= 8 ? '빠름' : '광속'}
          badgeOn={true}>
          <p className="section-desc">버디가 화면을 돌아다니는 속도를 조절해요.</p>
          <div className="interval-row">
            <span className="interval-label">🐢</span>
            <input type="range" min={1} max={10} step={1}
              value={draft.moveSpeed}
              onChange={e => updateDraft({ moveSpeed: Number(e.target.value) })}
              className="interval-slider" />
            <span className="interval-label">🐇</span>
            <span className="interval-value">
              {draft.moveSpeed <= 2 ? '🐢 느긋하게' : draft.moveSpeed <= 5 ? '🚶 적당히' : draft.moveSpeed <= 8 ? '🏃 빠르게' : '⚡ 광속'}
            </span>
          </div>
        </Section>

        {/* 출퇴근 시간 */}
        <Section icon="🕐" title="출퇴근 시간" defaultOpen={false}>
          <p className="section-desc">시간대별 잔소리 + 금요일/월급날 특별 문구!</p>
          <div className="time-row">
            <div className="time-field">
              <label className="time-label">🌅 출근</label>
              <input type="time" className="time-input" value={draft.workStart}
                onChange={e => updateDraft({ workStart: e.target.value })} />
            </div>
            <div className="time-divider">→</div>
            <div className="time-field">
              <label className="time-label">🌇 퇴근</label>
              <input type="time" className="time-input" value={draft.workEnd}
                onChange={e => updateDraft({ workEnd: e.target.value })} />
            </div>
          </div>
          <TimePreview workStart={draft.workStart} workEnd={draft.workEnd} />
        </Section>

        {/* 사용 방법 */}
        <Section icon="💡" title="사용 방법" defaultOpen={false}>
          <ul className="tips-list">
            <li>🖱️ 드래그해서 화면 어디든 이동 가능해요</li>
            <li>👆 클릭하면 반응해요 (2~3번 중 1번 파티클 팡팡!)</li>
            <li>👆👆 더블클릭하면 무조건 파티클 팡팡!</li>
            <li>🏃 마우스를 2초간 올려두면 도망가요</li>
            <li>🖱️ 우클릭하면 설정창이 열려요</li>
            <li>📣 '여기야!' 버튼으로 버디를 불러올 수 있어요</li>
            <li>💸 25일엔 월급 관련 문구, 금요일엔 불금 문구가 나와요!</li>
          </ul>
        </Section>

      </main>

      <footer className="settings-footer">
        <button className="btn btn-danger" onClick={() => window.electronAPI?.quitApp()}>
          ⏻ 종료
        </button>
        <div className="footer-actions">
          {isDirty && (
            <button className="btn btn-secondary" onClick={handleCancel}>
              ↩️ 취소
            </button>
          )}
          <button
            className={`btn ${isDirty ? 'btn-confirm' : 'btn-confirm-done'}`}
            onClick={handleApply}
            disabled={!isDirty}
          >
            {isDirty ? '✅ 확인' : '✔ 저장됨'}
          </button>
        </div>
      </footer>
    </div>
  );
}
