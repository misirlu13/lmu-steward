import { Box, Typography } from "@mui/material";
import { LMUReplay } from "@types";

export const ReplayHeader = ({replay}: {replay: LMUReplay}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexDirection: 'row',
        mb: 2,
      }}
    >
      <Typography variant="h5">Replay Details</Typography>
    </Box>
  );
}
