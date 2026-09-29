import React from 'react';

const MetadataHeader = () => {
  return (
    <div className="flex justify-between items-start text-[10px] tracking-widest uppercase text-muted z-10 relative">
      <div className="flex flex-col gap-1">
        <span>Queue Management</span>
        <span>Healthcare Solutions</span>
      </div>
      <div className="flex flex-col gap-1 text-right">
        <span>Global Network</span>
        <span>Hospitals & Clinics</span>
      </div>
    </div>
  );
};

export default MetadataHeader;
