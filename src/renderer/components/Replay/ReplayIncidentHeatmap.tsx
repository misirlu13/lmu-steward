import PlaceIcon from '@mui/icons-material/Place';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { Box, Dialog, IconButton, Paper, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { TrackMap } from '../TrackMap';
import {
	getTrackMapBounds,
	normalizeTrackWorldPointToSvg,
	TrackPoints,
} from '../../utils/trackMapToSVG';
import { useEffect, useMemo, useRef, useState } from 'react';

export type HeatmapSeverity = 'minor' | 'serious' | 'critical';

export interface ReplayHeatmapSpot {
	id: string;
	x: number;
	y: number;
	size: number;
	severity: HeatmapSeverity;
}

export interface ReplayHeatmapWorldSpot {
	id: string;
	x: number;
	z: number;
	size: number;
	severity: HeatmapSeverity;
}

interface ReplayIncidentHeatmapProps {
	trackLabel: string;
	zoomLabel?: string;
	spots: ReplayHeatmapSpot[];
	trackPoints?: TrackPoints[];
	worldSpots?: ReplayHeatmapWorldSpot[];
}

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 5;
const BUTTON_ZOOM_STEP = 0.2;
const WHEEL_ZOOM_STEP = 0.1;

export const ReplayIncidentHeatmap: React.FC<ReplayIncidentHeatmapProps> = ({
	trackLabel,
	zoomLabel = '1.0X',
	spots,
	trackPoints = [],
	worldSpots = [],
}) => {
	const theme = useTheme();
	const [zoomLevel, setZoomLevel] = useState<number>(Math.max(MIN_ZOOM, Number.parseFloat(zoomLabel) || 1));
	const [isExpanded, setIsExpanded] = useState(false);
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const inlineInteractionLayerRef = useRef<HTMLDivElement | null>(null);
	const dragStartRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
	const mapViewBoxSize = 1000;
	const trackStrokeWidth = 18;
	const trackPadding = Math.ceil(trackStrokeWidth);
	const severityColor: Record<HeatmapSeverity, string> = {
		minor: theme.palette.warning.main,
		serious: theme.palette.warning.dark,
		critical: theme.palette.error.main,
	};

	const convertedWorldSpots = useMemo<ReplayHeatmapSpot[]>(() => {
		if (!worldSpots.length || trackPoints.length < 2) {
			return [];
		}

		const bounds = getTrackMapBounds(trackPoints);
		if (!bounds) {
			return [];
		}

		return worldSpots
			.map((spot) => {
				const normalized = normalizeTrackWorldPointToSvg(
					{ x: spot.x, z: spot.z },
					bounds,
					mapViewBoxSize,
					trackPadding,
				);

				if (!normalized) {
					return null;
				}

				return {
					id: spot.id,
					x: normalized.x,
					y: normalized.y,
					size: spot.size,
					severity: spot.severity,
				};
			})
			.filter((spot): spot is ReplayHeatmapSpot => spot !== null);
	}, [mapViewBoxSize, trackPadding, trackPoints, worldSpots]);

	const allSpots = useMemo(
		() => [...spots, ...convertedWorldSpots],
		[spots, convertedWorldSpots],
	);

	const zoomLabelValue = `${zoomLevel.toFixed(1)}X`;

	const clampZoom = (value: number) => Number(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)).toFixed(1));

	const updateZoom = (direction: 'in' | 'out') => {
		setZoomLevel((previousZoomLevel) => {
			const delta = direction === 'in' ? BUTTON_ZOOM_STEP : -BUTTON_ZOOM_STEP;
			const nextZoomLevel = previousZoomLevel + delta;
			return clampZoom(nextZoomLevel);
		});
	};

	const applyWheelZoomDelta = (deltaY: number) => {
		setZoomLevel((previousZoomLevel) =>
			clampZoom(previousZoomLevel + (deltaY < 0 ? WHEEL_ZOOM_STEP : -WHEEL_ZOOM_STEP)),
		);
	};

	const handleFullscreenWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
		event.stopPropagation();
		applyWheelZoomDelta(event.deltaY);
	};

	useEffect(() => {
		if (isExpanded) {
			return undefined;
		}

		const interactionLayer = inlineInteractionLayerRef.current;
		if (!interactionLayer) {
			return undefined;
		}

		const handleNativeWheelZoom = (event: WheelEvent) => {
			event.preventDefault();
			event.stopPropagation();
			applyWheelZoomDelta(event.deltaY);
		};

		interactionLayer.addEventListener('wheel', handleNativeWheelZoom, {
			passive: false,
			capture: true,
		});

		return () => {
			interactionLayer.removeEventListener('wheel', handleNativeWheelZoom, true);
		};
	}, [isExpanded]);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		dragStartRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: panOffset.x,
			originY: panOffset.y,
		};
		setIsDragging(true);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!dragStartRef.current || dragStartRef.current.pointerId !== event.pointerId) {
			return;
		}

		const deltaX = event.clientX - dragStartRef.current.startX;
		const deltaY = event.clientY - dragStartRef.current.startY;

		setPanOffset({
			x: dragStartRef.current.originX + deltaX,
			y: dragStartRef.current.originY + deltaY,
		});
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (dragStartRef.current?.pointerId === event.pointerId) {
			dragStartRef.current = null;
			setIsDragging(false);
		}
	};

	const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
		if (dragStartRef.current?.pointerId === event.pointerId) {
			dragStartRef.current = null;
			setIsDragging(false);
		}
	};

	const renderHeatmapCanvas = (fullscreen = false) => (
		<Box
			sx={{
				position: 'relative',
				minHeight: fullscreen ? 0 : 320,
				height: fullscreen ? '100%' : 'auto',
				overflow: 'hidden',
				overscrollBehavior: 'contain',
				background:
					'radial-gradient(circle at 2px 2px, rgba(33,150,243,0.2) 1px, transparent 0)',
				backgroundSize: '20px 20px',
				backgroundColor: 'background.default',
			}}
		>
			<Box
				sx={{ position: 'absolute', inset: 0, p: 3, cursor: isDragging ? 'grabbing' : 'grab' }}
				ref={!fullscreen ? inlineInteractionLayerRef : undefined}
				onWheel={fullscreen ? handleFullscreenWheelZoom : undefined}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onPointerLeave={handlePointerLeave}
			>
				<Box
					sx={{
						position: 'relative',
						width: '100%',
						height: '100%',
						transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
						transformOrigin: 'center center',
						transition: isDragging ? 'none' : 'transform 180ms ease-out',
					}}
				>
					{trackPoints.length > 1 ? (
						<Box sx={{ position: 'absolute', inset: 0, opacity: 0.75 }}>
							<TrackMap
								points={trackPoints}
								svgOptions={{
									stroke: 'rgba(33, 150, 243, 0.45)',
									strokeWidth: trackStrokeWidth,
									viewBoxSize: mapViewBoxSize,
									padding: trackPadding,
								}}
							/>
						</Box>
					) : (
						<svg
							viewBox="0 0 1000 1000"
							style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
						>
							<path
								d="M160,500 C160,210 320,120 500,120 C680,120 840,300 840,500 C840,700 680,880 500,880 C320,880 160,760 160,500"
								fill="none"
								stroke="rgba(33, 150, 243, 0.35)"
								strokeWidth="38"
								strokeLinecap="round"
							/>
						</svg>
					)}

					<svg
						viewBox="0 0 1000 1000"
						style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
					>
						{allSpots.map((spot) => (
							<circle
								key={spot.id}
								cx={spot.x}
								cy={spot.y}
								r={spot.size}
								fill={severityColor[spot.severity]}
								fillOpacity="0.35"
							/>
						))}
						<text
							x="50%"
							y="52%"
							fill="rgba(236, 239, 241, 0.55)"
							textAnchor="middle"
							fontSize="28"
							letterSpacing="10"
							style={{ userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'none' }}
						>
							{trackLabel.toUpperCase()}
						</text>
					</svg>
				</Box>
			</Box>

			<Box
				sx={{
					position: 'absolute',
					left: 12,
					bottom: 12,
					display: 'flex',
					alignItems: 'center',
					gap: 0.5,
					px: 1,
					py: 0.5,
					borderRadius: 1,
					backgroundColor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
				}}
			>
				<IconButton size="small" onClick={() => updateZoom('out')} aria-label="Zoom out heatmap">
					<ZoomOutIcon fontSize="small" />
				</IconButton>
				<Typography variant="caption" color="text.secondary">
					ZOOM:{' '}
					<Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>
						{zoomLabelValue}
					</Box>
				</Typography>
				<IconButton size="small" onClick={() => updateZoom('in')} aria-label="Zoom in heatmap">
					<ZoomInIcon fontSize="small" />
				</IconButton>
			</Box>

			{!fullscreen ? (
				<IconButton
					size="small"
					onClick={() => setIsExpanded(true)}
					sx={{
						position: 'absolute',
						right: 12,
						bottom: 12,
						backgroundColor: 'primary.main',
						color: 'primary.contrastText',
						'&:hover': { backgroundColor: 'primary.dark' },
					}}
				>
					<OpenInFullIcon fontSize="small" />
				</IconButton>
			) : null}
		</Box>
	);

	return (
		<>
			<Paper
				variant="outlined"
				sx={{ borderColor: 'divider', borderRadius: 2, overflow: 'hidden', height: '100%' }}
			>
				<Stack
					direction="column"
					alignItems="flex-start"
					justifyContent="space-between"
					sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', gap: 1.5 }}
				>
					<Stack direction="row" spacing={1} alignItems="center">
						<PlaceIcon color="primary" fontSize="small" />
						<Typography variant="subtitle1" fontWeight={700}>
							Incident Hotspot Heatmap
						</Typography>
					</Stack>
					<Stack direction="row" spacing={1.5} alignItems="center" marginLeft="7px">
						{(['minor', 'serious', 'critical'] as HeatmapSeverity[]).map((severity) => (
							<Stack key={severity} direction="row" spacing={1} alignItems="center">
								<Box
									sx={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										backgroundColor: severityColor[severity],
									}}
								/>
								<Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', lineHeight: 1 }}>
									{severity}
								</Typography>
							</Stack>
						))}
					</Stack>
				</Stack>

				{renderHeatmapCanvas()}
			</Paper>

			<Dialog
				open={isExpanded}
				onClose={() => setIsExpanded(false)}
				fullScreen
			>
				<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="space-between"
						sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
					>
						<Typography variant="h6" fontWeight={700}>
							Incident Hotspot Heatmap
						</Typography>
						<IconButton aria-label="Close fullscreen heatmap" onClick={() => setIsExpanded(false)}>
							<CloseIcon />
						</IconButton>
					</Stack>
					<Box sx={{ p: 2, flex: 1, minHeight: 0 }}>{renderHeatmapCanvas(true)}</Box>
				</Box>
			</Dialog>
		</>
	);
};
