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
};
