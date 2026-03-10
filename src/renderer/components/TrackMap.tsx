import { trackMapToSVG, TrackPoints, SVGOptions } from '../utils/trackMapToSVG';

export const TrackMap = ({ points, svgOptions }: { points: TrackPoints[], svgOptions: SVGOptions }) => {
  const svg = trackMapToSVG(points, svgOptions);
  return <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />;
};
