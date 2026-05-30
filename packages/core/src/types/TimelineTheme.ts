export interface TimelineTheme {
  backgroundColor: string;
  tickColor: string;
  majorTickColor: string;
  labelColor: string;
  indicatorColor: string;
  indicatorLineWidth: number;
  majorTickHeight: number;
  minorTickHeight: number;
  fontSize: number;
  controlBarBackground: string;
  controlBarBorder: string;
  buttonColor: string;
  buttonHoverColor: string;
  /** Highlight color for active FF/RW buttons. Defaults to indicatorColor. */
  buttonActiveColor: string;
  /** Default border color for swim lane items. */
  swimLaneItemBorderColor: string;
  /** Default border width for swim lane items (px). Set to 0 to remove borders. */
  swimLaneItemBorderWidth: number;
  /** Color of the red dot shown on the LIVE button when playback is live. */
  liveDotColor: string;
}

export const defaultTheme: TimelineTheme = {
  backgroundColor: '#1a1a1a',
  tickColor: '#666666',
  majorTickColor: '#999999',
  labelColor: '#cccccc',
  indicatorColor: '#d69826',
  indicatorLineWidth: 5,
  majorTickHeight: 10,
  minorTickHeight: 5,
  fontSize: 12,
  controlBarBackground: '#242424',
  controlBarBorder: '#333333',
  buttonColor: '#666666',
  buttonHoverColor: '#888888',
  buttonActiveColor: '#d69826',
  swimLaneItemBorderColor: '#666666',
  swimLaneItemBorderWidth: 0,
  liveDotColor: '#e53e3e',
};
