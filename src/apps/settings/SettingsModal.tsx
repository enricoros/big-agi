import * as React from 'react';

import { Box, Button, Modal, ModalClose, ModalDialog, ModalOverflow, Typography } from '@mui/joy';

import { ElevenlabsSettings } from '@/modules/elevenlabs/ElevenlabsSettings';
import { OpenAIAdvancedSettings } from '@/modules/openai/OpenAIAdvancedSettings';
import { OpenAISettings } from '@/modules/openai/OpenAISettings';
import { ProdiaSettings } from '@/modules/prodia/ProdiaSettings';
import { SearchSettings } from '@/modules/search/SearchSettings';
import { isValidOpenAIApiKey, requireUserKeyOpenAI } from '@/modules/openai/openai.client';

import { useSettingsStore } from '@/common/state/store-settings';
import { useUIStore } from '@/common/state/store-ui';

import { UISettings } from './UISettings';
import {EmbeddingsSettings} from "@/modules/openai/embeddings/EmbeddingsSettings";


/**
 * Component that allows the User to modify the application settings,
 * persisted on the client via localStorage.
 */
export function SettingsModal() {
  // external state
  const { settingsOpen, closeSettings } = useUIStore();
  const apiKey = useSettingsStore(state => state.apiKey);

  // show the Settings Dialog at startup if the API key is required but not set
  React.useEffect(() => {
    if (requireUserKeyOpenAI && !isValidOpenAIApiKey(apiKey))
      useUIStore.getState().openSettings();
  }, [apiKey]);

  return (
    <Modal open={settingsOpen} onClose={closeSettings}>
      <ModalOverflow>
        <ModalDialog sx={{ maxWidth: 500, display: 'flex', p: { xs: 1, sm: 2, lg: '20px' } }}>

          <Typography level='h6' sx={{ mb: 2 }}>Settings</Typography>
          <ModalClose />

          <OpenAISettings />

          <UISettings />

          <ElevenlabsSettings />

          <ProdiaSettings />

          <SearchSettings />

          <EmbeddingsSettings />

          <OpenAIAdvancedSettings />

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant='solid' onClick={closeSettings}>
              Close
            </Button>
          </Box>

        </ModalDialog>
      </ModalOverflow>
    </Modal>
  );
}
