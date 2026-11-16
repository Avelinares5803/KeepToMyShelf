import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EnterFullScreenIcon, LeaveFullScreenIcon } from '../components/icons';

/** Enters or leaves full screen, like F11; it follows F11 too. */
export function FullScreenButton() {
  const { t } = useTranslation();
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    let active = true;
    // Listen first, so a change made with F11 while asking is not missed.
    const stop = window.api.window.onFullScreenChange(setFullScreen);
    void window.api.window.getFullScreen().then((result) => {
      if (!active) return;
      if (result.ok) setFullScreen(result.value);
      // The button then starts as "enter full screen", which is right in nearly every case.
      else console.error('Could not read the full screen state', result.error);
    });
    return () => {
      active = false;
      stop();
    };
  }, []);

  const toggle = async () => {
    const result = await window.api.window.setFullScreen({ fullScreen: !fullScreen });
    if (!result.ok) console.error('Could not change the full screen state', result.error);
  };

  const label = t(fullScreen ? 'window.leaveFullScreen' : 'window.enterFullScreen');
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      aria-keyshortcuts="F11"
      title={`${label} (F11)`}
      onClick={() => void toggle()}
    >
      {fullScreen ? <LeaveFullScreenIcon /> : <EnterFullScreenIcon />}
    </button>
  );
}
