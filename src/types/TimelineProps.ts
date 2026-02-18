import * as Cesium from 'cesium';
import { TickInterval } from './TickInterval';
import { TimelineTheme } from './TimelineTheme';

export interface TimelineProps {
  startTime: Cesium.JulianDate | Date;
  endTime: Cesium.JulianDate | Date;
  currentTime?: Cesium.JulianDate | Date;
  clock?: Cesium.Clock;
  onTimeChange?: (time: Cesium.JulianDate) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  onMultiplierChange?: (multiplier: number) => void;
  height?: number;
  tickInterval?: TickInterval | number;
  showLabels?: boolean;
  showControls?: boolean;
  snapToTicks?: boolean;
  enableDrag?: boolean;
  multiplierOptions?: number[];
  theme?: Partial<TimelineTheme>;
  className?: string;
}

export interface ControlsProps {
  currentTime: Cesium.JulianDate;
  isPlaying: boolean;
  multiplier: number;
  onPlayPause: (isPlaying: boolean) => void;
  onRewind: () => void;
  onMultiplierChange: (multiplier: number) => void;
  multiplierOptions: number[];
  theme: TimelineTheme;
}
