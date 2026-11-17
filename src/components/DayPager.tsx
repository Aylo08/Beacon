// Horizontal day pager: swipe left/right to change day. Renders [prev, current,
// next] in a paging ScrollView; when a swipe settles on a neighbour, the day
// changes and the view snaps back to the middle page (pages are keyed by day,
// so the page you swiped to keeps its state and scroll position).
import { useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { addDays } from '../lib/time';
import { t } from '../lib/i18n';

type Props = {
  day: string;
  onDayChange: (day: string) => void;
  renderDay: (day: string) => ReactNode;
};

export function DayPager({ day, onDayChange, renderDay }: Props) {
  const [width, setWidth] = useState(0);
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const days = [addDays(day, -1), day, addDays(day, 1)];

  // Keep the current day on the middle page (before paint, to avoid a flash).
  useLayoutEffect(() => {
    if (width) ref.current?.scrollTo({ x: width, animated: false });
  }, [day, width]);

  const settle = (x: number) => {
    if (!width) return;
    const page = Math.round(x / width);
    if (page === 0) onDayChange(days[0]);
    else if (page === 2) onDayChange(days[2]);
  };

  // Native: momentum end. Web has no momentum events, so settle after scrolling stops.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== 'web') return;
    const x = e.nativeEvent.contentOffset.x;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settle(x), 120);
  };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: width, y: 0 }}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
          onScroll={onScroll}
          scrollEventThrottle={32}
          directionalLockEnabled
          accessibilityHint={t('agenda.swipeHint')}
        >
          {days.map((d) => (
            <View key={d} style={{ width }}>
              {renderDay(d)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
