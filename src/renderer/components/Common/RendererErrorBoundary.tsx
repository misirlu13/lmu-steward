import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { CONSTANTS } from '@constants';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class RendererErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const payload = {
      source: 'react-error-boundary',
      message: error.message,
      stack: error.stack,
      detail: info.componentStack,
    };

    try {
      window.electron?.ipcRenderer.sendMessage(CONSTANTS.API.POST_RENDERER_ERROR, payload);
    } catch (sendError) {
      console.error('Failed to send renderer error report', sendError);
    }

    this.setState({
      hasError: true,
      errorMessage: error.message,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            bgcolor: 'background.default',
            color: 'text.primary',
          }}
        >
          <Typography variant="h4" sx={{ mb: 2 }}>
            Something went wrong.
          </Typography>
          <Typography variant="body1" sx={{ mb: 1, textAlign: 'center', maxWidth: 600 }}>
            The application encountered an error and reported it to the crash logger.
          </Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Please copy the error details from the crash report window and paste them into a GitHub issue.
          </Typography>
          <Button variant="contained" onClick={this.handleReload}>
            Reload application
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
