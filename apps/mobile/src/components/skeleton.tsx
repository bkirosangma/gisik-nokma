import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, useColorScheme, View } from 'react-native';
import { themeFor } from '../screens/help-theme.js';
import { BOARD_ROW_FRAME_STYLE } from '../screens/board-row-frame.js';
import { SKELETON_BLOCK_GAP, SKELETON_PULSE_LOW, SKELETON_PULSE_MS, SKELETON_RADIUS, skeletonBarMetrics, skeletonFill } from './skeleton-model.js';

/**
 * Loading placeholders for the phone (smoothness T13; spec §4, amendment S-R1). Structural, like the web's: a screen's skeleton renders the
 * real component's container (the board row's `BOARD_ROW_FRAME_STYLE`) and fills it with PARTS — a bar where the text is. Decoration only: no
 * pressable lives in here (the 13.1188 census), the region is one busy node named once, and the bars are hidden from assistive tech.
 * The fill and numbers come from `skeleton-model.ts`, which a node test reads.
 */

/** One busy region: one label for assistive tech, one pulse for everything inside (off when the OS asks for reduced motion). */
export function SkeletonRegion(props: { label: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduceMotion(on);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.8);
      return;
    }
    const half = SKELETON_PULSE_MS / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: SKELETON_PULSE_LOW, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  return (
    <Animated.View accessible accessibilityLabel={props.label} accessibilityState={{ busy: true }} style={{ opacity }}>
      {props.children}
    </Animated.View>
  );
}

/** One PART: a bar the size of the text it stands in for (shorter than the line, with air above and below), or a solid block when given a height. */
export function SkeletonBar(props: { width?: number | `${number}%`; height?: number }) {
  const theme = themeFor(useColorScheme());
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: props.width ?? '60%', ...skeletonBarMetrics(props.height), borderRadius: SKELETON_RADIUS, backgroundColor: skeletonFill(theme) }}
    />
  );
}

/** A block the height of the thing it reserves (the editor's band). */
export function SkeletonBlock(props: { height: number }) {
  return (
    <SkeletonRegion label="Opening the editor">
      <SkeletonBar width="100%" height={props.height} />
    </SkeletonRegion>
  );
}

const ROW_WIDTHS = ['70%', '55%', '65%', '80%', '50%', '60%'] as const;

/** The board while the replica opens: the real row's frame, six times, each holding a title-line part. */
export function SkeletonList(props: { rows: number; label?: string }) {
  return (
    <SkeletonRegion label={props.label ?? 'Opening your local copy'}>
      {Array.from({ length: props.rows }, (_, index) => (
        <View key={index} style={BOARD_ROW_FRAME_STYLE}>
          <SkeletonBar width={ROW_WIDTHS[index % ROW_WIDTHS.length]} />
        </View>
      ))}
    </SkeletonRegion>
  );
}

/** The ticket screen while the replica or the ticket opens: the title line, the state line and the body block. */
export function TicketSkeleton() {
  return (
    <SkeletonRegion label="Opening ticket">
      <SkeletonBar width="70%" />
      <SkeletonBar width="30%" />
      <View style={{ marginTop: SKELETON_BLOCK_GAP }}>
        <SkeletonBar width="100%" height={96} />
      </View>
    </SkeletonRegion>
  );
}
