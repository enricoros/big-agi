import * as React from 'react';

import { Container, Sheet, Typography } from '@mui/joy';

import { YTPersonaCreator } from './YTPersonaCreator';


export function AppPersonas() {
  return (
    <Sheet sx={{
      flexGrow: 1,
      overflowY: 'auto',
      p: { xs: 3, md: 6 },
    }}>

      <Container disableGutters maxWidth='md' sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

        <Typography level='h5' sx={{ textAlign: 'center' }}>
          Persona Editor
        </Typography>

        <YTPersonaCreator />

      </Container>

    </Sheet>
  );
}