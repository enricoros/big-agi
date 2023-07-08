import * as React from 'react';
import { shallow } from 'zustand/shallow';

import { useTheme } from '@mui/joy';

import type { PublishedSchema } from '~/modules/publish/publish.router';
import { CmdRunProdia } from '~/modules/prodia/prodia.client';
import { CmdRunReact } from '~/modules/aifn/react/react';
import { PublishedModal } from '~/modules/publish/PublishedModal';
import { apiAsync } from '~/modules/trpc/trpc.client';
import { imaginePromptFromText } from '~/modules/aifn/imagine/imaginePromptFromText';
import { useModelsStore } from '~/modules/llms/store-llms';

import { Brand } from '~/common/brand';
import { ConfirmationModal } from '~/common/components/ConfirmationModal';
import { Link } from '~/common/components/Link';
import { conversationToMarkdown } from '~/common/util/conversationToMarkdown';
import { createDMessage, DMessage, useChatStore } from '~/common/state/store-chats';
import { extractCommands } from '~/common/util/extractCommands';
import { useApplicationBarStore } from '~/common/layouts/appbar/store-applicationbar';
import { useUIPreferencesStore } from '~/common/state/store-ui';

import { ChatContextItems } from './components/appbar/ChatContextItems';
import { ChatMessageList } from './components/ChatMessageList';
import { Composer } from './components/composer/Composer';
import { ConversationItems } from './components/appbar/ConversationItems';
import { Dropdowns } from './components/appbar/Dropdowns';
import { Ephemerals } from './components/Ephemerals';
import { ImportedModal, ImportedOutcome } from './components/appbar/ImportedModal';
import { restoreConversationFromJson } from './exportImport';
import { runAssistantUpdatingState } from './editors/chat-stream';
import { runImageGenerationUpdatingState } from './editors/image-generate';
import { runReActUpdatingState } from './editors/react-tangent';
import { CmdSystemMessage } from '~/modules/llms/llm.client';


const SPECIAL_ID_ALL_CHATS = 'all-chats';

// definition of chat modes
export type ChatModeId = 'immediate' | 'immediate-follow-up' | 'react';
export const ChatModeItems: { [key in ChatModeId]: { label: string; description: string | React.JSX.Element; } } = {
  'immediate': {
    label: 'Chat',
    description: 'AI-powered direct responses',
  },
  'immediate-follow-up': {
    label: 'Chat & Follow-up',
    description: 'Chat with follow-up questions',
  },
  'react': {
    label: 'Reason+Act',
    description: 'Answer your questions with ReAct and search',
  },
};


/// Returns a pretty link to the current page, for promo
function linkToOrigin() {
  let origin = (typeof window !== 'undefined') ? window.location.href : '';
  if (!origin || origin.includes('//localhost'))
    origin = Brand.URIs.OpenRepo;
  origin = origin.replace('https://', '');
  if (origin.endsWith('/'))
    origin = origin.slice(0, -1);
  return origin;
}


export function AppChat() {

  // state
  const [chatModeId, setChatModeId] = React.useState<ChatModeId>('immediate');
  const [isMessageSelectionMode, setIsMessageSelectionMode] = React.useState(false);
  const [clearConfirmationId, setClearConfirmationId] = React.useState<string | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = React.useState<string | null>(null);
  const [publishConversationId, setPublishConversationId] = React.useState<string | null>(null);
  const [publishResponse, setPublishResponse] = React.useState<PublishedSchema | null>(null);
  const [conversationImportOutcome, setConversationImportOutcome] = React.useState<ImportedOutcome | null>(null);
  const conversationFileInputRef = React.useRef<HTMLInputElement>(null);

  // external state
  const theme = useTheme();
  const { activeConversationId, isConversationEmpty, conversationsCount, importConversation, deleteAllConversations, setMessages, systemPurposeId, setAutoTitle } = useChatStore(state => {
    const conversation = state.conversations.find(conversation => conversation.id === state.activeConversationId);
    return {
      activeConversationId: state.activeConversationId,
      isConversationEmpty: conversation ? !conversation.messages.length : true,
      conversationsCount: state.conversations.length,
      importConversation: state.importConversation,
      deleteAllConversations: state.deleteAllConversations,
      setMessages: state.setMessages,
      systemPurposeId: conversation?.systemPurposeId ?? null,
      setAutoTitle: state.setAutoTitle,
    };
  }, shallow);


  const handleExecuteConversation = async (chatModeId: ChatModeId, conversationId: string, history: DMessage[]) => {
    const { chatLLMId } = useModelsStore.getState();
    if (!conversationId || !chatLLMId) return;

    // Command - last user message is a cmd
    const lastMessage = history.length > 0 ? history[history.length - 1] : null;
    if (lastMessage?.role === 'user') {
      const pieces = extractCommands(lastMessage.text);
      if (pieces.length == 2 && pieces[0].type === 'cmd' && pieces[1].type === 'text') {
        const command = pieces[0].value;
        const prompt = pieces[1].value;
        if (CmdRunProdia.includes(command)) {
          setMessages(conversationId, history);
          return await runImageGenerationUpdatingState(conversationId, prompt);
        }
        if (CmdRunReact.includes(command) && chatLLMId) {
          setMessages(conversationId, history);
          return await runReActUpdatingState(conversationId, prompt, chatLLMId);
        }
        if (CmdSystemMessage.includes(command)) {
          lastMessage.role = "system"
          lastMessage.text = pieces[1].value
        }
        // if (CmdRunSearch.includes(command))
        //   return await run...
      }
    }

    // synchronous long-duration tasks, which update the state as they go
    if (chatModeId && chatLLMId && systemPurposeId) {
      switch (chatModeId) {
        case 'immediate':
        case 'immediate-follow-up':
          return await runAssistantUpdatingState(conversationId, history, chatLLMId, systemPurposeId, true, chatModeId === 'immediate-follow-up');
        case 'react':
          if (lastMessage?.text) {
            setMessages(conversationId, history);
            return await runReActUpdatingState(conversationId, lastMessage.text, chatLLMId);
          }
      }
    }

    // ISSUE: if we're here, it means we couldn't do the job, at least sync the history
    setMessages(conversationId, history);
  };

  const _findConversation = (conversationId: string) =>
    conversationId ? useChatStore.getState().conversations.find(c => c.id === conversationId) ?? null : null;

  const handleSendUserMessage = async (conversationId: string, userText: string) => {
    const conversation = _findConversation(conversationId);
    if (conversation)
      return await handleExecuteConversation(chatModeId, conversationId, [...conversation.messages, createDMessage('user', userText)]);
  };

  const handleExecuteChatHistory = async (conversationId: string, history: DMessage[]) =>
    await handleExecuteConversation(chatModeId, conversationId, history);

  const handleImagineFromText = async (conversationId: string, messageText: string) => {
    const conversation = _findConversation(conversationId);
    if (conversation) {
      const prompt = await imaginePromptFromText(messageText);
      if (prompt)
        return await handleExecuteConversation('immediate', conversationId, [...conversation.messages, createDMessage('user', `${CmdRunProdia[0]} ${prompt}`)]);
    }
  };


  const handleClearConversation = (conversationId: string) => setClearConfirmationId(conversationId);

  const handleConfirmedClearConversation = () => {
    if (clearConfirmationId) {
      setMessages(clearConfirmationId, []);
      setAutoTitle(clearConfirmationId, '');
      setClearConfirmationId(null);
    }
  };

  const handleDeleteAllConversations = () => setDeleteConfirmationId(SPECIAL_ID_ALL_CHATS);

  const handleConfirmedDeleteConversation = () => {
    if (deleteConfirmationId) {
      if (deleteConfirmationId === SPECIAL_ID_ALL_CHATS) {
        deleteAllConversations();
      }// else
      //  deleteConversation(deleteConfirmationId);
      setDeleteConfirmationId(null);
    }
  };

  const handlePublishConversation = (conversationId: string) => setPublishConversationId(conversationId);

  const handleConfirmedPublishConversation = async () => {
    if (publishConversationId) {
      const conversation = _findConversation(publishConversationId);
      setPublishConversationId(null);
      if (conversation) {
        const markdownContent = conversationToMarkdown(conversation, !useUIPreferencesStore.getState().showSystemMessages);
        try {
          const paste = await apiAsync.publish.publish.mutate({
            to: 'paste.gg',
            title: '🤖💬 Chat Conversation',
            fileContent: markdownContent,
            fileName: 'my-chat.md',
            origin: linkToOrigin(),
          });
          setPublishResponse(paste);
        } catch (error: any) {
          alert(`Failed to publish conversation: ${error?.message ?? error?.toString() ?? 'unknown error'}`);
          setPublishResponse(null);
        }
      }
    }
  };

  const handleImportConversation = () => conversationFileInputRef.current?.click();

  const handleImportConversationFromFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target?.files;
    if (!files || files.length < 1)
      return;

    // try to restore conversations from the selected files
    const outcomes: ImportedOutcome = { conversations: [] };
    for (const file of files) {
      const fileName = file.name || 'unknown file';
      try {
        const conversation = restoreConversationFromJson(await file.text());
        if (conversation) {
          importConversation(conversation);
          outcomes.conversations.push({ fileName, success: true, conversationId: conversation.id });
        } else {
          const fileDesc = `(${file.type}) ${file.size.toLocaleString()} bytes`;
          outcomes.conversations.push({ fileName, success: false, error: `Invalid file: ${fileDesc}` });
        }
      } catch (error) {
        console.error(error);
        outcomes.conversations.push({ fileName, success: false, error: (error as any)?.message || error?.toString() || 'unknown error' });
      }
    }

    // show the outcome of the import
    setConversationImportOutcome(outcomes);

    // this is needed to allow the same file to be selected again
    e.target.value = '';
  };


  // Pluggable ApplicationBar components

  const dropdowns = React.useMemo(() =>
      <Dropdowns conversationId={activeConversationId} />,
    [activeConversationId],
  );

  const conversationsBadge = conversationsCount < 2 ? 0 : conversationsCount;

  const conversationItems = React.useMemo(() =>
      <ConversationItems
        conversationId={activeConversationId}
        onImportConversation={handleImportConversation}
        onDeleteAllConversations={handleDeleteAllConversations}
      />,
    [activeConversationId],
  );

  const actionItems = React.useMemo(() =>
      <ChatContextItems
        conversationId={activeConversationId} isConversationEmpty={isConversationEmpty}
        isMessageSelectionMode={isMessageSelectionMode} setIsMessageSelectionMode={setIsMessageSelectionMode}
        onClearConversation={handleClearConversation}
        onPublishConversation={handlePublishConversation}
      />,
    [activeConversationId, isConversationEmpty, isMessageSelectionMode],
  );

  React.useEffect(() => {
    useApplicationBarStore.getState().registerClientComponents(dropdowns, conversationsBadge, conversationItems, actionItems);
    return () => useApplicationBarStore.getState().unregisterClientComponents();
  }, [dropdowns, conversationsBadge, conversationItems, actionItems]);

  return <>

    <ChatMessageList
      conversationId={activeConversationId}
      isMessageSelectionMode={isMessageSelectionMode} setIsMessageSelectionMode={setIsMessageSelectionMode}
      onExecuteChatHistory={handleExecuteChatHistory}
      onImagineFromText={handleImagineFromText}
      sx={{
        flexGrow: 1,
        background: theme.vars.palette.background.level2,
        overflowY: 'auto', // overflowY: 'hidden'
        minHeight: 96,
      }} />

    <Ephemerals
      conversationId={activeConversationId}
      sx={{
        // flexGrow: 0.1,
        flexShrink: 0.5,
        overflowY: 'auto',
        minHeight: 64,
      }} />

    <Composer
      conversationId={activeConversationId} messageId={null}
      chatModeId={chatModeId} setChatModeId={setChatModeId}
      isDeveloperMode={systemPurposeId === 'Developer'}
      onSendMessage={handleSendUserMessage}
      sx={{
        zIndex: 21, // position: 'sticky', bottom: 0,
        background: theme.vars.palette.background.surface,
        borderTop: `1px solid ${theme.vars.palette.divider}`,
        p: { xs: 1, md: 2 },
      }} />


    {/* Import Chat */}
    <input type='file' multiple hidden accept='.json' ref={conversationFileInputRef} onChange={handleImportConversationFromFiles} />
    {!!conversationImportOutcome && (
      <ImportedModal open outcome={conversationImportOutcome} onClose={() => setConversationImportOutcome(null)} />
    )}

    {/* Clear */}
    <ConfirmationModal
      open={!!clearConfirmationId} onClose={() => setClearConfirmationId(null)} onPositive={handleConfirmedClearConversation}
      confirmationText={'Are you sure you want to discard all the messages?'} positiveActionText={'Clear conversation'}
    />

    {/* Deletion */}
    <ConfirmationModal
      open={!!deleteConfirmationId} onClose={() => setDeleteConfirmationId(null)} onPositive={handleConfirmedDeleteConversation}
      confirmationText={deleteConfirmationId === SPECIAL_ID_ALL_CHATS
        ? 'Are you absolutely sure you want to delete ALL conversations? This action cannot be undone.'
        : 'Are you sure you want to delete this conversation?'}
      positiveActionText={deleteConfirmationId === SPECIAL_ID_ALL_CHATS
        ? 'Yes, delete all'
        : 'Delete conversation'}
    />

    {/* Publishing */}
    <ConfirmationModal
      open={!!publishConversationId} onClose={() => setPublishConversationId(null)} onPositive={handleConfirmedPublishConversation}
      confirmationText={<>
        Share your conversation anonymously on <Link href='https://paste.gg' target='_blank'>paste.gg</Link>?
        It will be unlisted and available to share and read for 30 days. Keep in mind, deletion may not be possible.
        Are you sure you want to proceed?
      </>} positiveActionText={'Understood, upload to paste.gg'}
    />
    {!!publishResponse && (
      <PublishedModal open onClose={() => setPublishResponse(null)} response={publishResponse} />
    )}

  </>;
}
