import type { ViewStyle } from 'react-native';

/**
 * The board row's FRAME: the one style object the real row (`board-screen.tsx`) and its skeleton row (`components/skeleton.tsx`) both take,
 * so the skeleton copies the row's box by BEING that box (spec S1, amendment S-R1; React Native has no classes, so the style object is the
 * container). The phone screens declare no box of their own today — the row is as tall as its text — so the frame is empty on purpose and
 * inventing padding here would change the real board. When a row style lands it lands HERE, once, and the skeleton follows.
 */
export const BOARD_ROW_FRAME_STYLE: ViewStyle = Object.freeze({});
