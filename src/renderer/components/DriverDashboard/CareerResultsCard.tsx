import {
  Box,
  Card,
  CardContent,
  Divider,
  Tooltip,
  Typography,
} from '@mui/material';
import { CareerAggregate } from '@types';
import { formatCount, formatDecimal, formatSigned } from './careerFormat';

interface CareerResultsCardProps {
  aggregate: CareerAggregate;
}

const Row = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => {
  const content = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        py: 0.5,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );

  return hint ? (
    <Tooltip title={hint} placement="left">
      {content}
    </Tooltip>
  ) : (
    content
  );
};

/**
 * The finishing-position histogram, drawn rather than charted.
 *
 * The app has no charting dependency and draws its own visuals elsewhere
 * (ReplayIncidentHeatmap, trackMapToSVG), so this stays in that idiom.
 */
const FinishDistribution = ({
  distribution,
}: {
  distribution: { position: number; count: number }[];
}) => {
  if (!distribution.length) {
    return null;
  }

  const shown = distribution.slice(0, 15);
  const peak = Math.max(...shown.map((entry) => entry.count));

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        Class finishing positions
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 0.5,
          height: 72,
          mt: 0.5,
        }}
      >
        {shown.map((entry) => (
          <Tooltip
            key={entry.position}
            title={`P${entry.position} · ${entry.count}`}
            placement="top"
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 8,
                height: `${Math.max(4, (entry.count / peak) * 100)}%`,
                borderRadius: '2px 2px 0 0',
                backgroundColor:
                  entry.position <= 3 ? 'success.main' : 'primary.main',
                opacity: entry.position <= 3 ? 1 : 0.55,
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          P{shown[0].position}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          P{shown[shown.length - 1].position}
        </Typography>
      </Box>
    </Box>
  );
};

export const CareerResultsCard = ({ aggregate }: CareerResultsCardProps) => {
  const { results, headline } = aggregate;
  const winRate = headline.races ? results.wins / headline.races : null;
  const podiumRate = headline.races ? results.podiums / headline.races : null;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Results
        </Typography>

        <Row
          label="Win rate"
          value={winRate === null ? '—' : `${(winRate * 100).toFixed(1)}%`}
        />
        <Row
          label="Podium rate"
          value={
            podiumRate === null ? '—' : `${(podiumRate * 100).toFixed(1)}%`
          }
        />
        <Row label="Top fives" value={formatCount(results.topFives)} />
        <Row
          label="Poles"
          value={formatCount(results.poles)}
          hint="Class pole — first in your own class, not the overall field"
        />
        <Row label="Front rows" value={formatCount(results.frontRows)} />

        <Divider sx={{ my: 1 }} />

        <Row
          label="Average class finish"
          value={formatDecimal(results.averageClassFinish)}
        />
        <Row
          label="Average class grid"
          value={formatDecimal(results.averageClassGrid)}
        />
        <Row
          label="Best finish"
          value={results.bestClassFinish ? `P${results.bestClassFinish}` : '—'}
        />

        <Divider sx={{ my: 1 }} />

        <Row
          label="Positions gained"
          value={formatSigned(results.netPositionsGained)}
          hint="Grid to finish, added up across every race"
        />
        <Row
          label="Best comeback"
          value={formatSigned(results.bestComeback)}
          hint="The most places made up in a single race"
        />
        <Row label="Laps led" value={formatCount(results.lapsLed)} />

        <Divider sx={{ my: 1 }} />

        <Row label="Finishes" value={formatCount(results.finishes)} />
        <Row
          label="Retirements"
          value={formatCount(results.dnfs)}
          hint={`${results.dnfMechanical} mechanical · ${results.dnfAccident} accident`}
        />
        <Row
          label="Disqualifications"
          value={formatCount(results.disqualifications)}
        />

        <FinishDistribution distribution={results.finishDistribution} />
      </CardContent>
    </Card>
  );
};
