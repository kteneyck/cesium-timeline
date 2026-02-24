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
  tickColor: '#666',
  majorTickColor: '#999',
  labelColor: '#ccc',
  indicatorColor: '#d69826',
  indicatorLineWidth: 3,
  majorTickHeight: 10,
  minorTickHeight: 5,
  fontSize: 12,
  controlBarBackground: '#242424',
  controlBarBorder: '#333',
  buttonColor: '#666',
  buttonHoverColor: '#888',
  buttonActiveColor: '#d69826',
};
