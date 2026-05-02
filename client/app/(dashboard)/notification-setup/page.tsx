'use client';

import { Suspense } from 'react';
import NotificationSetupContent from './NotificationSetupContent';

export default function NotificationSetup() {
  return (
    <Suspense fallback={<div className="p-6">Loading notification setup...</div>}>
      <NotificationSetupContent />
    </Suspense>
  );
}