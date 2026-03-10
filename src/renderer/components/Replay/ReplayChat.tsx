import {
  getChatMessages,
  getDriverList,
  getSessionDependentData,
  normalizeDriverCarClass,
} from '@/renderer/utils/sessionUtils';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { LMUReplay } from '@types';
import { BlockQuote, BlockQuoteType } from '../Common/BlockQuote';

interface ReplayChatDriverLike {
  Name?: string;
  CarNumber?: string;
  CarType?: string;
  CarClass?: string;
}

interface ReplayChatMessageLike {
  _?: string;
  et?: number | string;
}

export const ReplayChat: React.FC<{ replay: LMUReplay | null }> = ({
  replay,
}) => {
  const sessionData = getSessionDependentData(replay!);
  const driverList = getDriverList(replay!);
  const chatMessages = getChatMessages(replay!);

  const getDriverObject = (userId: string) => {
    const userIdParts = userId.split(' ');
    const firstInitial = userIdParts[0]?.charAt(0) || '';
    const lastName = userIdParts[1] || '';
    const driver = driverList.find((d) => {
      const driverNameParts = String(d.Name ?? '').split(' ');
      const driverFirstInitial = driverNameParts[0]?.charAt(0) || '';
      const driverLastName = driverNameParts[1] || '';
      return driverFirstInitial === firstInitial && driverLastName === lastName;
    });
    return (driver as ReplayChatDriverLike | undefined) || { Name: userId };
  };

  const formattedChatMessages = chatMessages.map((msg) => {
    const chatMessage = msg as ReplayChatMessageLike;
    const sessionStream =
      (sessionData as
        | {
            Stream?: {
              Score?: Array<{ et?: number | string }>;
              Minutes?: number;
            };
          }
        | null
        | undefined)?.Stream;
    const scoreEntries = Array.isArray(sessionStream?.Score)
      ? sessionStream.Score
      : [];
    const latestScoreEt = Number(scoreEntries[scoreEntries.length - 1]?.et ?? NaN);
    const fallbackEt = Number(sessionStream?.Minutes ?? 0) * 60;
    const baselineEt = Number.isFinite(latestScoreEt) ? latestScoreEt : fallbackEt;

    const timestamp =
      Number(replay?.timestamp) +
      Number(chatMessage.et) -
      Number(baselineEt);
    const date = new Date(Number(timestamp) * 1000);
    const localizedTime = date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const stringSplit = String(chatMessage._ ?? '').split(':');
    const user = stringSplit[0] || 'Unknown';
    const message = stringSplit[1] || '';
    const driver = getDriverObject(user);
    return {
      driver: driver,
      message: message,
      time: localizedTime,
    };
  });
  return (
    <Box sx={{ width: 400, p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Chat for Replay {replay?.id}
      </Typography>
      {/* Placeholder content */}
      {formattedChatMessages && formattedChatMessages.length > 0 ? (
        formattedChatMessages.map((msg, index: number) => (
          <Box key={index} sx={{ mb: 1 }}>
            <Typography
              sx={{
                color: 'text.secondary',
              }}
              variant="subtitle2"
            >
              {msg.driver.Name} #{msg.driver.CarNumber} - {msg.driver.CarType}
            </Typography>
            <BlockQuote
              type={
                (normalizeDriverCarClass(msg.driver.CarClass) ||
                  'info') as BlockQuoteType
              }
            >
              <Typography variant="body2">{msg.message}</Typography>
            </BlockQuote>
            <Typography sx={{ color: 'text.secondary' }} variant="caption">
              {msg.time}
            </Typography>
          </Box>
        ))
      ) : (
        <Typography variant="body1" color="text.secondary">
          No chat messages found for this replay.
        </Typography>
      )}
    </Box>
  );
};
