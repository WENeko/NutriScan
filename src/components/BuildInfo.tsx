import React from 'react';

// Variables globales injectées par Vite (voir vite.config.ts)
declare global {
  const __BUILD_DATE__: string;
  const __APP_VERSION__: string;
  const __APP_VERSION_CODE__: string;
}

const BuildInfo = () => {
  return (
    <div className="py-4 text-center opacity-30">
      <p className="text-[10px] text-muted-foreground font-mono">
        v{__APP_VERSION__} ({__APP_VERSION_CODE__})
      </p>
      <p className="text-[10px] text-muted-foreground font-mono">
        Build: {__BUILD_DATE__}
      </p>
    </div>
  );
};

export default BuildInfo;
