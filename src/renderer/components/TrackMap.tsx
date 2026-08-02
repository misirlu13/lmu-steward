import { trackMapToSVG, TrackPoints, SVGOptions } from '../utils/trackMapToSVG';

export const TrackMap = ({
  points,
  svgOptions,
}: {
  points: TrackPoints[];
  svgOptions: SVGOptions;
}) => {
  const svg = trackMapToSVG(points, svgOptions);
  return (
    <div
      style={{ width: '100%', height: '100%' }}
      // The markup is generated locally by trackMapToSVG from numeric track
      // coordinates and caller-supplied style literals; no remote or
      // user-authored strings are interpolated into it.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
