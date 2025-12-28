
export interface Point {
  x: number;
  y: number;
}

export interface Snowflake {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  wind: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  READY = 'READY',
  ERROR = 'ERROR'
}

declare global {
  interface Window {
    Hands: any;
    FaceMesh: any;
    Camera: any;
  }
}
