import React from 'react';

// On déclare la variable globale pour TypeScript
declare global {
  const __BUILD_DATE__: string;
}

const BuildInfo = () => {
  return (
    <div className="py-4 text-center opacity-30">
      <p className="text-[10px] text-muted-foreground font-mono">
        Build: {__BUILD_DATE__}
      </p>
    </div>
  );
};

export default BuildInfo;
