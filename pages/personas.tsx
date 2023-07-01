import * as React from 'react';

import { AppPersonas } from '../src/apps/personas/AppPersonas';

import { AppLayout } from '~/common/layouts/AppLayout';


export default function HomePage() {
  return (
    <AppLayout>
      <AppPersonas />
    </AppLayout>
  );
}