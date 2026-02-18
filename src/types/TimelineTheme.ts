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
}

export const defaultTheme: TimelineTheme = {
  backgroundColor: '#1a1a1a',
  tickColor: '#666',
  majorTickColor: '#999',
  labelColor: '#ccc',
  indicatorColor: '#ff6b6b',
  indicatorLineWidth: 2,
  majorTickHeight: 10,
  minorTickHeight: 5,
  fontSize: 12,
  controlBarBackground: '#242424',
  controlBarBorder: '#333',
  buttonColor: '#666',
  buttonHoverColor: '#888',
};
