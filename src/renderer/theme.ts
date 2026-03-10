import { createTheme } from '@mui/material/styles';

// Augment the palette to include a salmon color
declare module '@mui/material/styles' {
  interface Palette {
    qualifying: Palette['primary'];
  }

  interface PaletteOptions {
    qualifying?: PaletteOptions['primary'];
  }
}

let theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2196F3',
      light: '#64B5F6',
      dark: '#1976D2',
      contrastText: '#FFFFFF',
    },
    secondary: { main: '#00E5FF' },
    error: { main: '#FF5252' },
    // @ts-ignore
    warning: { main: '#FFD740', alt: '#FFC107' },
    // @ts-ignore
    success: { main: '#00E676', alt: '#50C878' },
    qualifying: { main: '#AB47BC' },
    // @ts-ignore
    background: { default: '#0B1218', paper: '#161F28', alt: '#1A252F' },
    text: { primary: '#ECEFF1', secondary: '#90A4AE' },
    divider: 'rgba(144, 164, 174, 0.12)',
    action: { active: '#2196F3', hover: 'rgba(33, 150, 243, 0.08)' },
  },
  typography: {
    fontFamily: '"Space Grotesk", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCard: { styleOverrides: { root: { borderRadius: '4px' } } },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: '#0B1218', boxShadow: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: '#161F28' },
      },
    },
  },
});

theme = createTheme(theme, {
  // Custom colors created with augmentColor go here
  palette: {
    qualifying: theme.palette.augmentColor({
      color: {
        main: '#AB47BC',
      },
      name: 'qualifying',
    }),
  },
});

export default theme;
