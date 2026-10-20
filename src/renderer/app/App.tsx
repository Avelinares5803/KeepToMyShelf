import { useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/ipc';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo);
  }, []);

  return (
    <main className="app">
      <h1>KeepToMyShelf</h1>
      <p className="app__version">{info ? `v${info.version}` : '…'}</p>
    </main>
  );
}
