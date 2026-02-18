# Cesium Timeline Component

An SVG-based timeline component for React with Cesium Clock integration. Provides interactive time scrubbing, play/pause controls, and speed multiplier.

## Installation

```bash
npm install @bariumstudios/cesium-timeline
```

## Basic Usage

```tsx
import { Timeline } from '@bariumstudios/cesium-timeline';
import * as Cesium from 'cesium';

const MyComponent = () => {
  const viewer = useCesiumViewer();
  
  return (
    <Timeline
      startTime={Cesium.JulianDate.fromDate(new Date('2025-01-01'))}
      endTime={Cesium.JulianDate.fromDate(new Date('2025-12-31'))}
      currentTime={viewer.clock.currentTime}
      clock={viewer.clock}
      onTimeChange={(time) => {
        viewer.clock.currentTime = time;
      }}
      height={120}
      tickInterval="hourly"
    />
  );
};
```

## Features

- **SVG-based rendering**: Scalable and performant
- **Draggable indicator**: Drag the current time line to scrub through time
- **Clock integration**: Works with Cesium Clock for real-time updates
- **Interactive controls**: Play/pause, rewind, and speed multiplier
- **Responsive**: Fills container width automatically
- **Customizable**: Theme, colors, tick intervals, and more

## Props

See `TimelineProps` interface for complete props documentation.

## License

MIT
