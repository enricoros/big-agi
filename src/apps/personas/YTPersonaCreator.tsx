import * as React from 'react';

import { Alert, Box, Button, IconButton, Input, ListDivider, Typography } from '@mui/joy';
import YouTubeIcon from '@mui/icons-material/YouTube';
import WhatshotIcon from '@mui/icons-material/Whatshot';

import { apiQuery } from '~/modules/trpc/trpc.client';


// URL -> Video ID
function extractVideoID(url: string): string | null {
  let regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^#&?]*).*/;
  let match = url.match(regExp);
  return (match && match[1]?.length == 11) ? match[1] : null;
}


export function YTPersonaCreator() {
  // state
  const [videoURL, setVideoURL] = React.useState('');
  const [videoID, setVideoID] = React.useState('');
  const [transcriptText, setTranscriptText] = React.useState<string | null>(null);

  // Create a mutation for fetching the YouTube video transcript
  const {
    data: transcriptData, isFetching, isSuccess,
    isError, error,
  } = apiQuery.ytpersona.getTranscript.useQuery({
    videoId: videoID,
  }, {
    enabled: !!videoID,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // Effects to update the transcript from the transcriptData.transcript
  React.useEffect(() => {
    setTranscriptText(transcriptData?.transcript?.trim() ?? null);
  }, [transcriptData]);

  // Effect to call the chat generate
  React.useEffect(() => {
    // if (transcriptText)
    console.log('transcriptText', transcriptText?.length);
  }, [transcriptText]);

  const handleVideoIdChange = (e: React.ChangeEvent<HTMLInputElement>) => setVideoURL(e.target.value);

  const handleFetchTranscript = (e: React.FormEvent<HTMLFormElement>) => {
    // we do it
    e.preventDefault();

    const videoId = extractVideoID(videoURL);
    if (!videoId) {
      setVideoURL('Invalid');
    } else {
      setTranscriptText(null);
      setVideoID(videoId);
    }
  };

  return <>

    <ListDivider />

    <Typography color='primary' sx={{ textAlign: 'center', mt: 4 }}>
      <YouTubeIcon sx={{ fontSize: 'xl6', color: '#f00' }} />
    </Typography>

    <Typography level='h5'>
      Create a YouTube persona
    </Typography>

    <form onSubmit={handleFetchTranscript}>
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
        <Input
          required
          type='url'
          fullWidth
          variant='outlined'
          placeholder='Enter a YouTube video URL'
          value={videoURL} onChange={handleVideoIdChange}
          endDecorator={
            <IconButton
              variant='outlined' color='neutral'
              onClick={() => setVideoURL('https://www.youtube.com/watch?v=M_wZpSEvOkc&t=2s')}
            >
              <WhatshotIcon />
            </IconButton>
          }
        />
        <Button
          type='submit'
          variant='solid' disabled={videoURL == videoID} loading={isFetching}
          sx={{ minWidth: 120 }}>
          Create
        </Button>
      </Box>
    </form>

    {/* After the first roundtrip */}
    {isError && (
      <Alert color='warning' sx={{ mt: 1 }}>
        <Typography component='div'>{error.message || 'Unknown error'}</Typography>
      </Alert>
    )}
    {isSuccess && (
      <Typography sx={{ whiteSpace: 'break-spaces' }}>
        {transcriptData?.transcript}
      </Typography>
    )}

  </>;
}