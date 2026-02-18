import React, { useState, useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { TimelineProps, defaultTheme } from './types';
import { TimelineControls } from './components/TimelineControls';
import { TimelineSVG } from './components/TimelineSVG';
import { toJulianDate } from './utils/timeConversion';

export const Timeline: React.FC<TimelineProps> = ({
  startTime,
  endTime,
  currentTime: initialTime,
  clock,
  onTimeChange,
  onPlayPause,
  onMultiplierChange,
  height = 120,
  tickInterval = 60,
  showLabels = true,
  showControls = true,
  snapToTicks = false,
  enableDrag = true,
  multiplierOptions = [0.5, 1, 2, 5, 10],
  theme: customTheme,
  className,
}) => {
  // State management
  const [currentTime, setCurrentTime] = useState<Cesium.JulianDate>(() =>
    toJulianDate(initialTime || startTime)
  );
  const [isPlaying, setIsPlaying] = useState(clock?.shouldAnimate ?? false);
  const [multiplier, setMultiplier] = useState(clock?.multiplier ?? 1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // Auto-scroll state: track the visible time window
  const [visibleStartTime, setVisibleStartTime] = useState<Cesium.JulianDate>(() =>
    toJulianDate(startTime)
  );
  const [visibleEndTime, setVisibleEndTime] = useState<Cesium.JulianDate>(() =>
    toJulianDate(endTime)
  );

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const autoScrollRAFRef = useRef<number | null>(null);

  // Theme
  const finalTheme = { ...defaultTheme, ...customTheme };

  // Setup ResizeObserver for responsive width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Set initial width
    setContainerWidth(container.clientWidth);

    // Create ResizeObserver
    resizeObserverRef.current = new ResizeObserver(() => {
      setContainerWidth(container.clientWidth);
    });

    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  // Sync with Cesium clock
  useEffect(() => {
    if (!clock) return;

    const onTickListener = () => {
      setCurrentTime(Cesium.JulianDate.clone(clock.currentTime));
      setIsPlaying(clock.shouldAnimate);
      setMultiplier(clock.multiplier);
    };

    clock.onTick.addEventListener(onTickListener);

    return () => {
      clock.onTick.removeEventListener(onTickListener);
    };
  }, [clock]);

  // Fallback interval when no clock is provided
  useEffect(() => {
    if (clock || isDragging) return;

    const interval = setInterval(() => {
      setCurrentTime(() => {
        const now = new Date();
        return Cesium.JulianDate.fromDate(now);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [clock, isDragging]);

  // Auto-scroll logic: when currentTime approaches timeline edges
  useEffect(() => {
    if (isDragging) return;

    const updateAutoScroll = () => {
      const visibleDuration = Cesium.JulianDate.secondsDifference(visibleEndTime, visibleStartTime);
      const currentPosition = Cesium.JulianDate.secondsDifference(currentTime, visibleStartTime);
      
      // Scroll thresholds: if currentTime is < 10% or > 90% of visible range
      const SCROLL_THRESHOLD = 0.1;
      const leftThreshold = visibleDuration * SCROLL_THRESHOLD;
      const rightThreshold = visibleDuration * (1 - SCROLL_THRESHOLD);

      const startTimeSeconds = Cesium.JulianDate.secondsDifference(
        toJulianDate(startTime),
        visibleStartTime
      );
      const endTimeSeconds = Cesium.JulianDate.secondsDifference(
        toJulianDate(endTime),
        visibleEndTime
      );

      // Check if we're at absolute bounds
      const atAbsoluteStart = startTimeSeconds === 0;
      const atAbsoluteEnd = endTimeSeconds === 0;

      // Scroll left if approaching left edge (and not at absolute start)
      if (currentPosition < leftThreshold && !atAbsoluteStart) {
        const scrollAmount = visibleDuration * 0.2; // Scroll by 20% of visible range
        setVisibleStartTime((prev) => {
          const newStart = Cesium.JulianDate.addSeconds(prev, -scrollAmount, new Cesium.JulianDate());
          // Don't scroll before absolute start
          const absStart = toJulianDate(startTime);
          if (Cesium.JulianDate.lessThan(newStart, absStart)) {
            return absStart;
          }
          return newStart;
        });
        setVisibleEndTime((prev) => {
          const newEnd = Cesium.JulianDate.addSeconds(prev, -scrollAmount, new Cesium.JulianDate());
          const absStart = toJulianDate(startTime);
          // Ensure the range doesn't shrink
          if (Cesium.JulianDate.lessThan(newEnd, absStart)) {
            return Cesium.JulianDate.addSeconds(absStart, visibleDuration, new Cesium.JulianDate());
          }
          return newEnd;
        });
      }
      // Scroll right if approaching right edge (and not at absolute end)
      else if (currentPosition > rightThreshold && !atAbsoluteEnd) {
        const scrollAmount = visibleDuration * 0.2; // Scroll by 20% of visible range
        setVisibleStartTime((prev) =>
          Cesium.JulianDate.addSeconds(prev, scrollAmount, new Cesium.JulianDate())
        );
        setVisibleEndTime((prev) => {
          const newEnd = Cesium.JulianDate.addSeconds(prev, scrollAmount, new Cesium.JulianDate());
          // Don't scroll past absolute end
          const absEnd = toJulianDate(endTime);
          if (Cesium.JulianDate.greaterThan(newEnd, absEnd)) {
            return absEnd;
          }
          return newEnd;
        });
      }
    };

    // Use requestAnimationFrame for smooth auto-scrolling
    if (autoScrollRAFRef.current) {
      cancelAnimationFrame(autoScrollRAFRef.current);
    }
    
    autoScrollRAFRef.current = requestAnimationFrame(updateAutoScroll);

    return () => {
      if (autoScrollRAFRef.current) {
        cancelAnimationFrame(autoScrollRAFRef.current);
      }
    };
  }, [currentTime, visibleStartTime, visibleEndTime, isDragging, startTime, endTime]);

  // Handle time changes
  const handleTimeChange = (newTime: Cesium.JulianDate) => {
    setCurrentTime(newTime);

    if (clock) {
      clock.currentTime = Cesium.JulianDate.clone(newTime);
    }

    onTimeChange?.(newTime);
  };

  // Handle play/pause - only update Cesium clock
  const handlePlayPause = (playing: boolean) => {
    if (clock) {
      clock.shouldAnimate = playing;
    }

    onPlayPause?.(playing);
  };

  // Handle rewind - only update Cesium clock
  const handleRewind = () => {
    const newTime = toJulianDate(startTime);
    if (clock) {
      clock.currentTime = Cesium.JulianDate.clone(newTime);
    }
    // Reset visible range but let clock.onTick update currentTime
    setVisibleStartTime(toJulianDate(startTime));
    setVisibleEndTime(toJulianDate(endTime));
  };

  // Handle multiplier change - only update Cesium clock
  const handleMultiplierChange = (newMultiplier: number) => {
    if (clock) {
      clock.multiplier = newMultiplier;
    }

    onMultiplierChange?.(newMultiplier);
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {showControls && (
        <TimelineControls
          currentTime={currentTime}
          isPlaying={isPlaying}
          multiplier={multiplier}
          onPlayPause={handlePlayPause}
          onRewind={handleRewind}
          onMultiplierChange={handleMultiplierChange}
          multiplierOptions={multiplierOptions}
          theme={finalTheme}
        />
      )}

      {containerWidth > 0 && (
        <TimelineSVG
          startTime={visibleStartTime}
          endTime={visibleEndTime}
          currentTime={currentTime}
          width={containerWidth}
          height={height}
          tickInterval={tickInterval}
          showLabels={showLabels}
          snapToTicks={snapToTicks}
          enableDrag={enableDrag}
          theme={finalTheme}
          onTimeChange={handleTimeChange}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setIsDragging(false)}
        />
      )}
    </div>
  );
};

export default Timeline;
