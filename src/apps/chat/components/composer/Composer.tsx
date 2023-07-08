import * as React from 'react';
import { shallow } from 'zustand/shallow';

import { Box, Button, ButtonGroup, Card, Grid, IconButton, ListDivider, ListItemDecorator, Menu, MenuItem, Stack, Textarea, Tooltip, Typography, useTheme } from '@mui/joy';
import { ColorPaletteProp, SxProps, VariantProp } from '@mui/joy/styles/types';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import DataArrayIcon from '@mui/icons-material/DataArray';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import MicIcon from '@mui/icons-material/Mic';
import PanToolIcon from '@mui/icons-material/PanTool';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import PsychologyIcon from '@mui/icons-material/Psychology';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { ContentReducer } from '~/modules/aifn/summarize/ContentReducer';
import { useChatLLM } from '~/modules/llms/store-llms';

import { ConfirmationModal } from '~/common/components/ConfirmationModal';
import { SpeechResult, useSpeechRecognition } from '~/common/components/useSpeechRecognition';
import { countModelTokens } from '~/common/llm-util/token-counter';
import { extractFilePathsWithCommonRadix } from '~/common/util/dropTextUtils';
import { hideOnDesktop, hideOnMobile } from '~/common/theme';
import { htmlTableToMarkdown } from '~/common/util/htmlTableToMarkdown';
import { pdfToText } from '~/common/util/pdfToText';
import { useChatStore } from '~/common/state/store-chats';
import { useUIPreferencesStore } from '~/common/state/store-ui';

import { ChatModeId } from '../../AppChat';
import { ChatModeMenu } from './ChatModeMenu';
import { TokenBadge } from './TokenBadge';
import { TokenProgressbar } from './TokenProgressbar';
import { useComposerStore } from './store-composer';


/// Text template helpers

const PromptTemplates = {
  Concatenate: '{{input}}\n\n{{text}}',
  PasteFile: '{{input}}\n\n```{{fileName}}\n{{fileText}}\n```\n',
  PasteMarkdown: '{{input}}\n\n```\n{{clipboard}}\n```\n',
};

const expandPromptTemplate = (template: string, dict: object) => (inputValue: string): string => {
  let expanded = template.replaceAll('{{input}}', (inputValue || '').trim()).trim();
  for (const [key, value] of Object.entries(dict))
    expanded = expanded.replaceAll(`{{${key}}}`, value.trim());
  return expanded;
};


const attachFileLegend =
  <Stack sx={{ p: 1, gap: 1, fontSize: '16px', fontWeight: 400 }}>
    <Box sx={{ mb: 1, textAlign: 'center' }}>
      Attach a file to the message
    </Box>
    <table>
      <tbody>
      <tr>
        <td width={36}><PictureAsPdfIcon sx={{ width: 24, height: 24 }} /></td>
        <td><b>PDF</b></td>
        <td width={36} align='center' style={{ opacity: 0.5 }}>→</td>
        <td>📝 Text (split manually)</td>
      </tr>
      <tr>
        <td><DataArrayIcon sx={{ width: 24, height: 24 }} /></td>
        <td><b>Code</b></td>
        <td align='center' style={{ opacity: 0.5 }}>→</td>
        <td>📚 Markdown</td>
      </tr>
      <tr>
        <td><FormatAlignCenterIcon sx={{ width: 24, height: 24 }} /></td>
        <td><b>Text</b></td>
        <td align='center' style={{ opacity: 0.5 }}>→</td>
        <td>📝 As-is</td>
      </tr>
      </tbody>
    </table>
    <Box sx={{ mt: 1, fontSize: '14px' }}>
      Drag & drop in chat for faster loads ⚡
    </Box>
  </Stack>;

const pasteClipboardLegend =
  <Box sx={{ p: 1, fontSize: '14px', fontWeight: 400 }}>
    Converts Code and Tables to 📚 Markdown
  </Box>;


const MicButton = (props: { variant: VariantProp, color: ColorPaletteProp, onClick: () => void, sx?: SxProps }) =>
  <Tooltip title='CTRL + M' placement='top'>
    <IconButton variant={props.variant} color={props.color} onClick={props.onClick} sx={props.sx}>
      <MicIcon />
    </IconButton>
  </Tooltip>;


const SentMessagesMenu = (props: {
  anchorEl: HTMLAnchorElement, onClose: () => void,
  messages: { date: number; text: string; count: number }[],
  onPaste: (text: string) => void,
  onClear: () => void,
}) =>
  <Menu
    variant='plain' color='neutral' size='md' placement='top-end' sx={{ minWidth: 320, maxWidth: '100dvw', maxHeight: 'calc(100dvh - 56px)', overflowY: 'auto' }}
    open={!!props.anchorEl} anchorEl={props.anchorEl} onClose={props.onClose}>

    <MenuItem color='neutral' selected>Reuse messages 💬</MenuItem>

    <ListDivider />

    {props.messages.map((item, index) =>
      <MenuItem
        key={'composer-sent-' + index}
        onClick={() => {
          props.onPaste(item.text);
          props.onClose();
        }}
        sx={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline', overflow: 'hidden' }}
      >
        {item.count > 1 && <span style={{ marginRight: 1 }}>({item.count})</span>} {item.text?.length > 70 ? item.text.slice(0, 68) + '...' : item.text}
      </MenuItem>)}

    <ListDivider />

    <MenuItem onClick={props.onClear}>
      <ListItemDecorator><DeleteOutlineIcon /></ListItemDecorator>
      Clear sent messages history
    </MenuItem>

  </Menu>;


/**
 * A React component for composing and sending messages in a chat-like interface.
 * Supports pasting text and code from the clipboard, and a local log of sent messages.
 *
 * Note: Useful bash trick to generate code from a list of files:
 *       $ for F in *.ts; do echo; echo "\`\`\`$F"; cat $F; echo; echo "\`\`\`"; done | clip
 *
 * @param {boolean} props.disableSend - Flag to disable the send button.
 * @param {(text: string, conversationId: string | null) => void} props.sendMessage - Function to send the message. conversationId is null for the Active conversation
 * @param {() => void} props.stopGeneration - Function to stop response generation
 */
export function Composer(props: {
  conversationId: string | null; messageId: string | null;
  chatModeId: ChatModeId, setChatModeId: (chatModeId: ChatModeId) => void;
  isDeveloperMode: boolean;
  onSendMessage: (conversationId: string, text: string) => void;
  sx?: SxProps;
}) {
  // state
  const [composeText, setComposeText] = React.useState('');
  const [speechInterimResult, setSpeechInterimResult] = React.useState<SpeechResult | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [reducerText, setReducerText] = React.useState('');
  const [reducerTextTokens, setReducerTextTokens] = React.useState(0);
  const [chatModeMenuAnchor, setChatModeMenuAnchor] = React.useState<HTMLAnchorElement | null>(null);
  const [sentMessagesAnchor, setSentMessagesAnchor] = React.useState<HTMLAnchorElement | null>(null);
  const [confirmClearSent, setConfirmClearSent] = React.useState(false);
  const attachmentFileInputRef = React.useRef<HTMLInputElement>(null);

  // external state
  const theme = useTheme();
  const { enterToSend, goofyLabs } = useUIPreferencesStore(state => ({
    enterToSend: state.enterToSend,
    goofyLabs: state.goofyLabs,
  }), shallow);
  const { sentMessages, appendSentMessage, clearSentMessages, startupText, setStartupText } = useComposerStore();
  const { assistantTyping, tokenCount: conversationTokenCount, stopTyping } = useChatStore(state => {
    const conversation = state.conversations.find(conversation => conversation.id === props.conversationId);
    return {
      assistantTyping: conversation ? !!conversation.abortController : false,
      tokenCount: conversation ? conversation.tokenCount : 0,
      stopTyping: state.stopTyping,
    };
  }, shallow);
  const { chatLLMId, chatLLM } = useChatLLM();

  // Effect: load initial text if queued up (e.g. by /share)
  React.useEffect(() => {
    if (startupText) {
      setStartupText(null);
      setComposeText(startupText);
    }
  }, [startupText, setStartupText]);

  // derived state
  const tokenLimit = chatLLM?.contextTokens || 0;
  const directTokens = React.useMemo(() => {
    return (!composeText || !chatLLMId) ? 4 : 4 + countModelTokens(composeText, chatLLMId, 'composer text');
  }, [chatLLMId, composeText]);
  const historyTokens = conversationTokenCount;
  const responseTokens = chatLLM?.options?.llmResponseTokens || 0;
  const remainingTokens = tokenLimit - directTokens - historyTokens - responseTokens;


  const handleSendClicked = () => {
    const text = (composeText || '').trim();
    if (text.length && props.conversationId) {
      setComposeText('');
      props.onSendMessage(props.conversationId, text);
      appendSentMessage(text);
    }
  };

  const handleToggleChatMode = (event: React.MouseEvent<HTMLAnchorElement>) =>
    setChatModeMenuAnchor(anchor => anchor ? null : event.currentTarget);

  const handleHideChatMode = () => setChatModeMenuAnchor(null);

  const handleSetChatModeId = (chatModeId: ChatModeId) => {
    handleHideChatMode();
    props.setChatModeId(chatModeId);
  };

  const handleStopClicked = () => props.conversationId && stopTyping(props.conversationId);

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const shiftOrAlt = e.shiftKey || e.altKey;
      if (enterToSend ? !shiftOrAlt : shiftOrAlt) {
        if (!assistantTyping)
          handleSendClicked();
        e.preventDefault();
      }
    }
  };


  const onSpeechResultCallback = React.useCallback((result: SpeechResult) => {
    setSpeechInterimResult(result.done ? null : { ...result });
    if (result.done) {
      setComposeText(prevText => {
        prevText = prevText.trim();
        const transcript = result.transcript.trim();
        return prevText ? prevText + ' ' + transcript : transcript;
      });
    }
  }, []);

  const { isSpeechEnabled, isSpeechError, isRecordingAudio, isRecordingSpeech, toggleRecording } = useSpeechRecognition(onSpeechResultCallback, 'm');

  const handleMicClicked = () => toggleRecording();

  const micColor = isSpeechError ? 'danger' : isRecordingSpeech ? 'warning' : isRecordingAudio ? 'warning' : 'neutral';
  const micVariant = isRecordingSpeech ? 'solid' : isRecordingAudio ? 'solid' : 'plain';

  async function loadAndAttachFiles(files: FileList, overrideFileNames: string[]) {

    // NOTE: we tried to get the common 'root prefix' of the files here, so that we could attach files with a name that's relative
    //       to the common root, but the files[].webkitRelativePath property is not providing that information

    // perform loading and expansion
    let newText = '';
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = overrideFileNames.length === files.length ? overrideFileNames[i] : file.name;
      let fileText = '';
      try {
        if (file.type === 'application/pdf')
          fileText = await pdfToText(file);
        else
          fileText = await file.text();
        newText = expandPromptTemplate(PromptTemplates.PasteFile, { fileName: fileName, fileText })(newText);
      } catch (error) {
        // show errors in the prompt box itself - FUTURE: show in a toast
        console.error(error);
        newText = `${newText}\n\nError loading file ${fileName}: ${error}\n`;
      }
    }

    // see how we fare on budget
    if (chatLLMId) {
      const newTextTokens = countModelTokens(newText, chatLLMId, 'reducer trigger');

      // simple trigger for the reduction dialog
      if (newTextTokens > remainingTokens) {
        setReducerTextTokens(newTextTokens);
        setReducerText(newText);
        return;
      }
    }

    // within the budget, so just append
    setComposeText(text => expandPromptTemplate(PromptTemplates.Concatenate, { text: newText })(text));
  }

  const handleContentReducerClose = () => {
    setReducerText('');
  };

  const handleContentReducerText = (newText: string) => {
    handleContentReducerClose();
    setComposeText(text => text + newText);
  };

  const handleShowFilePicker = () => attachmentFileInputRef.current?.click();

  const handleLoadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target?.files;
    if (files && files.length >= 1)
      await loadAndAttachFiles(files, []);

    // this is needed to allow the same file to be selected again
    e.target.value = '';
  };


  const handlePasteButtonClicked = async () => {
    for (const clipboardItem of await navigator.clipboard.read()) {

      // when pasting html, only process tables as markdown (e.g. from Excel), or fallback to text
      try {
        const htmlItem = await clipboardItem.getType('text/html');
        const htmlString = await htmlItem.text();
        // paste tables as markdown
        if (htmlString.indexOf('<table') == 0) {
          const markdownString = htmlTableToMarkdown(htmlString);
          setComposeText(expandPromptTemplate(PromptTemplates.PasteMarkdown, { clipboard: markdownString }));
          continue;
        }
        // TODO: paste html to markdown (tried Turndown, but the gfm plugin is not good - need to find another lib with minimal footprint)
      } catch (error) {
        // ignore missing html: fallback to text/plain
      }

      // find the text/plain item if any
      try {
        const textItem = await clipboardItem.getType('text/plain');
        const textString = await textItem.text();
        setComposeText(expandPromptTemplate(PromptTemplates.PasteMarkdown, { clipboard: textString }));
        continue;
      } catch (error) {
        // ignore missing text
      }

      // no text/html or text/plain item found
      console.log('Clipboard item has no text/html or text/plain item.', clipboardItem.types, clipboardItem);
    }
  };

  const handleTextareaCtrlV = async (e: React.ClipboardEvent) => {

    // paste local files
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      await loadAndAttachFiles(e.clipboardData.files, []);
      return;
    }

    // paste not intercepted, continue with default behavior
  };


  const showSentMessages = (event: React.MouseEvent<HTMLAnchorElement>) => setSentMessagesAnchor(event.currentTarget);

  const hideSentMessages = () => setSentMessagesAnchor(null);

  const handlePasteSent = (text: string) => setComposeText(text);

  const handleClearSent = () => setConfirmClearSent(true);

  const handleCancelClearSent = () => setConfirmClearSent(false);

  const handleConfirmedClearSent = () => {
    setConfirmClearSent(false);
    clearSentMessages();
  };


  const eatDragEvent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleTextareaDragEnter = (e: React.DragEvent) => {
    eatDragEvent(e);
    setIsDragging(true);
  };

  const handleOverlayDragLeave = (e: React.DragEvent) => {
    eatDragEvent(e);
    setIsDragging(false);
  };

  const handleOverlayDragOver = (e: React.DragEvent) => {
    eatDragEvent(e);
    // e.dataTransfer.dropEffect = 'copy';
  };

  const handleOverlayDrop = async (e: React.DragEvent) => {
    eatDragEvent(e);
    setIsDragging(false);

    // dropped files
    if (e.dataTransfer.files?.length >= 1) {
      // Workaround: as we don't have the full path in the File object, we need to get it from the text/plain data
      let overrideFileNames: string[] = [];
      if (e.dataTransfer.types?.includes('text/plain')) {
        const plainText = e.dataTransfer.getData('text/plain');
        overrideFileNames = extractFilePathsWithCommonRadix(plainText);
      }
      return loadAndAttachFiles(e.dataTransfer.files, overrideFileNames);
    }

    // special case: detect failure of dropping from VSCode
    // VSCode: Drag & Drop does not transfer the File object: https://github.com/microsoft/vscode/issues/98629#issuecomment-634475572
    if (e.dataTransfer.types?.includes('codeeditors'))
      return setComposeText(test => test + 'Pasting from VSCode is not supported! Fixme. Anyone?');

    // dropped text
    const droppedText = e.dataTransfer.getData('text');
    if (droppedText?.length >= 1)
      return setComposeText(text => expandPromptTemplate(PromptTemplates.PasteMarkdown, { clipboard: droppedText })(text));

    // future info for dropping
    console.log('Unhandled Drop event. Contents: ', e.dataTransfer.types.map(t => `${t}: ${e.dataTransfer.getData(t)}`));
  };

  // const prodiaApiKey = isValidProdiaApiKey(useSettingsStore(state => state.prodiaApiKey));
  // const isProdiaConfigured = !requireUserKeyProdia || prodiaApiKey;
  const textPlaceholder: string = props.isDeveloperMode
    ? 'Tell me what you need, and drop source files...'
    : /*isProdiaConfigured ?*/ 'Chat · /react · /imagine · /system · drop text files...' /*: 'Chat · /react · drop text files...'*/;

  const isImmediate = props.chatModeId === 'immediate';
  const isFollowUp = props.chatModeId === 'immediate-follow-up';
  const isReAct = props.chatModeId === 'react';

  const chatButton = (
    <Button
      fullWidth variant='solid' color={isReAct ? 'info' : isFollowUp ? 'warning' : 'primary'} disabled={!props.conversationId || !chatLLM}
      onClick={handleSendClicked} onDoubleClick={handleToggleChatMode} endDecorator={isReAct ? <PsychologyIcon /> : <TelegramIcon />}
    >
      {isReAct ? 'ReAct' : isFollowUp ? 'Chat+' : 'Chat'}
    </Button>
  );

  return (
    <Box sx={props.sx}>
      <Grid container spacing={{ xs: 1, md: 2 }}>

        {/* Left pane (buttons and Textarea) */}
        <Grid xs={12} md={9}><Stack direction='row' spacing={{ xs: 1, md: 2 }}>

          {/* Vertical Buttons Bar */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0, md: 2 } }}>

            {/*<Typography level='body3' sx={{mb: 2}}>Context</Typography>*/}

            {isSpeechEnabled && <Box sx={hideOnDesktop}>
              <MicButton variant={micVariant} color={micColor} onClick={handleMicClicked} />
            </Box>}

            <IconButton variant='plain' color='neutral' onClick={handleShowFilePicker} sx={{ ...hideOnDesktop }}>
              <UploadFileIcon />
            </IconButton>
            <Tooltip
              variant='solid' placement='top-start'
              title={attachFileLegend}>
              <Button fullWidth variant='plain' color='neutral' onClick={handleShowFilePicker} startDecorator={<UploadFileIcon />}
                      sx={{ ...hideOnMobile, justifyContent: 'flex-start' }}>
                Attach
              </Button>
            </Tooltip>

            <IconButton variant='plain' color='neutral' onClick={handlePasteButtonClicked} sx={{ ...hideOnDesktop }}>
              <ContentPasteGoIcon />
            </IconButton>
            <Tooltip
              variant='solid' placement='top-start'
              title={pasteClipboardLegend}>
              <Button fullWidth variant='plain' color='neutral' startDecorator={<ContentPasteGoIcon />} onClick={handlePasteButtonClicked}
                      sx={{ ...hideOnMobile, justifyContent: 'flex-start' }}>
                {props.isDeveloperMode ? 'Paste code' : 'Paste'}
              </Button>
            </Tooltip>

            <input type='file' multiple hidden ref={attachmentFileInputRef} onChange={handleLoadAttachment} />

          </Box>

          {/* Edit box, with Drop overlay */}
          <Box sx={{ flexGrow: 1, position: 'relative' }}>

            <Box sx={{ position: 'relative' }}>

              <Textarea
                variant='outlined' color={isReAct ? 'info' : 'neutral'}
                autoFocus
                minRows={4} maxRows={12}
                placeholder={textPlaceholder}
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                onDragEnter={handleTextareaDragEnter}
                onKeyDown={handleTextareaKeyDown}
                onPasteCapture={handleTextareaCtrlV}
                slotProps={{
                  textarea: {
                    enterKeyHint: enterToSend ? 'send' : 'enter',
                    sx: {
                      ...(isSpeechEnabled ? { pr: { md: 5 } } : {}),
                      mb: 0.5,
                    },
                  },
                }}
                sx={{
                  background: theme.vars.palette.background.level1,
                  fontSize: '16px',
                  lineHeight: 1.75,
                }} />

              {tokenLimit > 0 && (directTokens > 0 || (historyTokens + responseTokens) > 0) && <TokenProgressbar history={historyTokens} response={responseTokens} direct={directTokens} limit={tokenLimit} />}

            </Box>

            {isSpeechEnabled && (
              <MicButton variant={micVariant} color={micColor} onClick={handleMicClicked} sx={{
                ...hideOnMobile,
                position: 'absolute', top: 0, right: 0,
                zIndex: 21,
                m: 1,
              }} />
            )}

            {!!tokenLimit && <TokenBadge directTokens={directTokens} indirectTokens={historyTokens + responseTokens} tokenLimit={tokenLimit} absoluteBottomRight />}

            {!!speechInterimResult && (
              <Card
                color='primary' invertedColors variant='soft'
                sx={{
                  display: 'flex',
                  position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
                  // alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${theme.vars.palette.primary.solidBg}`,
                  borderRadius: theme.radius.xs,
                  zIndex: 20,
                  px: 1.5, py: 1,
                }}>
                <Typography>
                  {speechInterimResult.transcript}{' '}
                  <span style={{ opacity: 0.5 }}>{speechInterimResult.interimTranscript}</span>
                </Typography>
              </Card>
            )}

            <Card
              color='primary' invertedColors variant='soft'
              sx={{
                display: isDragging ? 'flex' : 'none',
                position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
                alignItems: 'center', justifyContent: 'space-evenly',
                border: '2px dashed',
                borderRadius: theme.radius.xs,
                zIndex: 10,
              }}
              onDragLeave={handleOverlayDragLeave}
              onDragOver={handleOverlayDragOver}
              onDrop={handleOverlayDrop}>
              <PanToolIcon sx={{ width: 40, height: 40, pointerEvents: 'none' }} />
              <Typography level='body2' sx={{ pointerEvents: 'none' }}>
                I will hold on to this for you
              </Typography>
            </Card>

          </Box>

        </Stack></Grid>

        {/* Send pane */}
        <Grid xs={12} md={3}>
          <Stack spacing={2}>

            <Box sx={{ display: 'flex', flexDirection: 'row' }}>

              {/* [mobile-only] Sent messages arrow */}
              {sentMessages.length > 0 && (
                <IconButton disabled={!!sentMessagesAnchor} variant='plain' color='neutral' onClick={showSentMessages} sx={{ ...hideOnDesktop, mr: { xs: 1, md: 2 } }}>
                  <KeyboardArrowUpIcon />
                </IconButton>
              )}

              {/* Send / Stop */}
              {assistantTyping
                ? (
                  <Button
                    fullWidth variant='soft' color={isReAct ? 'info' : 'primary'} disabled={!props.conversationId}
                    onClick={handleStopClicked}
                    endDecorator={<StopOutlinedIcon />}
                  >
                    Stop
                  </Button>
                ) : (!goofyLabs && isImmediate) ? chatButton : (
                  <ButtonGroup variant='solid' color={isReAct ? 'info' : isFollowUp ? 'warning' : 'primary'} sx={{ flexGrow: 1 }}>
                    {chatButton}
                    <IconButton disabled={!props.conversationId || !chatLLM || !!chatModeMenuAnchor} onClick={handleToggleChatMode}>
                      <ExpandLessIcon />
                    </IconButton>
                  </ButtonGroup>
                )}
            </Box>

            {/* [desktop-only] row with Sent Messages button */}
            <Stack direction='row' spacing={1} sx={{ ...hideOnMobile, flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'flex-end' }}>
              {sentMessages.length > 0 && (
                <Button disabled={!!sentMessagesAnchor} fullWidth variant='plain' color='neutral' startDecorator={<KeyboardArrowUpIcon />} onClick={showSentMessages}>
                  History
                </Button>
              )}
            </Stack>

          </Stack>
        </Grid>


        {/* Mode selector */}
        {!!chatModeMenuAnchor && (
          <ChatModeMenu anchorEl={chatModeMenuAnchor} chatModeId={props.chatModeId} onSetChatModeId={handleSetChatModeId} onClose={handleHideChatMode} />
        )}

        {/* Sent messages menu */}
        {!!sentMessagesAnchor && (
          <SentMessagesMenu
            anchorEl={sentMessagesAnchor} messages={sentMessages} onClose={hideSentMessages}
            onPaste={handlePasteSent} onClear={handleClearSent}
          />
        )}

        {/* Content reducer modal */}
        {reducerText?.length >= 1 &&
          <ContentReducer
            initialText={reducerText} initialTokens={reducerTextTokens} tokenLimit={remainingTokens}
            onReducedText={handleContentReducerText} onClose={handleContentReducerClose}
          />
        }

        {/* Clear confirmation modal */}
        <ConfirmationModal
          open={confirmClearSent} onClose={handleCancelClearSent} onPositive={handleConfirmedClearSent}
          confirmationText={'Are you sure you want to clear all your sent messages?'} positiveActionText={'Clear all'}
        />

      </Grid>
    </Box>
  );
}