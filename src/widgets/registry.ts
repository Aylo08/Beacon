// Home-page widgets. To add one: write a component in src/widgets/ and register it here.
import type { ComponentType } from 'react';
import type { IconName } from '../components/Icon';
import { BusWidget } from './BusWidget';
import { RestaurantsWidget } from './RestaurantsWidget';
import { TodayWidget } from './TodayWidget';

export type WidgetDef = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  Component: ComponentType;
};

export const WIDGETS: WidgetDef[] = [
  {
    id: 'today',
    title: "Aujourd'hui",
    description: 'Vos cours de la journée, avec le cours en cours et le suivant',
    icon: 'calendar-2-line',
    Component: TodayWidget,
  },
  {
    id: 'restaurants',
    title: 'Resto U',
    description: 'Affluence en direct des restaurants Agroparc et Sainte-Marthe',
    icon: 'restaurant-line',
    Component: RestaurantsWidget,
  },
  {
    id: 'bus',
    title: 'Bus',
    description: 'Prochains C3 / 22 entre St Lazare et Grand Avignon ou Montaigne, en temps réel',
    icon: 'bus-line',
    Component: BusWidget,
  },
];

export const DEFAULT_WIDGETS = ['today'];

export const widgetById = (id: string) => WIDGETS.find((w) => w.id === id);
