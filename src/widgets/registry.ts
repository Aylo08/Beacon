// Home-page widgets. To add one: write a component in src/widgets/ and register it here.
// Title and description are functions so they follow the app language.
import type { ComponentType } from 'react';
import type { IconName } from '../components/Icon';
import { BusWidget } from './BusWidget';
import { RestaurantsWidget } from './RestaurantsWidget';
import { TodayWidget } from './TodayWidget';
import { t } from '../lib/i18n';

export type WidgetDef = {
  id: string;
  title: () => string;
  description: () => string;
  icon: IconName;
  Component: ComponentType;
};

export const WIDGETS: WidgetDef[] = [
  {
    id: 'today',
    title: () => t('widget.today.title'),
    description: () => t('widget.today.description'),
    icon: 'calendar-2-line',
    Component: TodayWidget,
  },
  {
    id: 'restaurants',
    title: () => t('widget.restaurants.title'),
    description: () => t('widget.restaurants.description'),
    icon: 'restaurant-line',
    Component: RestaurantsWidget,
  },
  {
    id: 'bus',
    title: () => t('widget.bus.title'),
    description: () => t('widget.bus.description'),
    icon: 'bus-line',
    Component: BusWidget,
  },
];

export const DEFAULT_WIDGETS = ['today'];

export const widgetById = (id: string) => WIDGETS.find((w) => w.id === id);
